import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashValue } from '@/core/utils/canonicalHash';
import {
  type FaultyStorage,
  createFaultyStorage,
} from '@/features/folder/owner/__tests__/faultyStorage';
import { folder, folderData } from '@/features/folder/owner/__tests__/ownerHarness';
import { type FolderAuthority, FOLDER_WRITE_AUTHORITY } from '@/features/folder/owner/authority';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';
import { BUNDLE_INTENT_KEY } from '@/features/folder/owner/bundleIntent';
import { createFolderOwnerCore } from '@/features/folder/owner/folderOwnerCore';
import type { FolderSite } from '@/features/folder/owner/folderOwnerPolicy';
import { ownerMetaKey } from '@/features/folder/owner/folderOwnerState';
import { PROMPT_LIBRARY_KEY } from '@/features/prompt/library/promptLibraryOwner';
import { backgroundWriteQueue } from '@/features/storage/writeQueue';

import { handleFolderOwnerMessage, startFolderOwner } from '../folderOwner';
import { promptLibraryOwner } from '../promptLibraryOwner';

const GEMINI_TAB = {
  id: 'test-extension-id',
  url: 'https://gemini.google.com/app/abc',
  frameId: 0,
  tab: { url: 'https://gemini.google.com/app/abc' },
};
const OPEN = { type: 'gv.folderOwner.open', key: 'gvFolderData', clientId: 'c1', ackedThrough: 0 };
const GEMINI_OWNER: Record<FolderSite, FolderAuthority> = {
  gemini: 'owner',
  aistudio: 'legacy',
  chatgpt: 'legacy',
};

function handlerWorld(authority?: Record<FolderSite, FolderAuthority>) {
  const storage = createFaultyStorage();
  const core = createFolderOwnerCore({
    area: storage.area,
    authority: authority ?? FOLDER_WRITE_AUTHORITY,
  });
  return {
    storage,
    send: (message: unknown, sender: object = GEMINI_TAB) =>
      handleFolderOwnerMessage(message, sender, { core, authority }),
  };
}

// T15 on the real handler: the gate decides before the core or storage is reached.
describe('folder owner message handler', () => {
  it('refuses every request with not_owner and touches no storage while sites are legacy', async () => {
    const { storage, send } = handlerWorld();

    await expect(send(OPEN)).resolves.toEqual({ kind: 'refused', reason: 'not_owner' });
    expect(storage.calls()).toBe(0);
  });

  it('reaches the core for an owner site and still refuses another site’s key', async () => {
    const { storage, send } = handlerWorld(GEMINI_OWNER);

    await expect(send(OPEN)).resolves.toMatchObject({ kind: 'empty', applied: 0 });
    const before = storage.calls();
    await expect(send({ ...OPEN, key: 'gvFolderDataChatGPT' })).resolves.toEqual({
      kind: 'refused',
      reason: 'sender_not_allowed',
    });
    expect(storage.calls()).toBe(before);
  });

  it('answers a malformed request of ours with bad_request and ignores other messages', async () => {
    const { storage, send } = handlerWorld(GEMINI_OWNER);

    await expect(send({ ...OPEN, ackedThrough: -1 })).resolves.toEqual({ kind: 'bad_request' });
    expect(send({ type: 'gv.promptLibrary.apply' })).toBeNull();
    expect(storage.calls()).toBe(0);
  });
});

const RETRY_ALARM = 'gv-folder-owner-bundle-retry';
/** Alarms the browser holds; a one-shot alarm is gone once it fires. */
const alarms = new Set<string>();

function fireAlarm(name: string) {
  alarms.delete(name);
  for (const [listener] of vi.mocked(chrome.alarms.onAlarm.addListener).mock.calls) {
    listener({ name, scheduledTime: Date.now() });
  }
}

/** Backs `chrome.storage.local` with `storage`. */
function routeLocalStorage(storage: FaultyStorage) {
  vi.mocked(chrome.storage.local.get).mockImplementation(async (keys: unknown) =>
    keys === null
      ? storage.area.getAll()
      : storage.area.get(Array.isArray(keys) ? keys : [String(keys)]),
  );
  vi.mocked(chrome.storage.local.set).mockImplementation((items) => storage.area.set(items));
}

function emitLocalChange(changes: Record<string, chrome.storage.StorageChange>) {
  for (const [listener] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
    listener(changes, 'local');
  }
}

describe('startFolderOwner', () => {
  beforeEach(() => {
    alarms.clear();
    vi.stubGlobal('chrome', {
      ...chrome,
      runtime: { ...chrome.runtime, getManifest: () => ({ version: '1.9.0' }) },
    });
    vi.mocked(chrome.storage.local.get).mockClear();
    vi.mocked(chrome.storage.local.set).mockReset().mockResolvedValue(undefined);
    vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
    vi.mocked(chrome.storage.onChanged.addListener).mockClear();
    vi.mocked(chrome.alarms.onAlarm.addListener).mockClear();
    vi.mocked(chrome.alarms.create)
      .mockReset()
      .mockImplementation((name) => void alarms.add(String(name)));
    vi.mocked(chrome.alarms.clear)
      .mockReset()
      .mockImplementation((name) => void alarms.delete(String(name)));
  });
  afterEach(() => {
    backgroundWriteQueue.setPrelude(null);
    vi.unstubAllGlobals();
  });

  it('leaves prompt-owner turns reading nothing extra while every site is legacy', async () => {
    startFolderOwner();

    await backgroundWriteQueue(async () => 'prompt turn');

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
  });

  it('resolves the bundle before a prompt-owner turn once a site is owned', async () => {
    vi.mocked(chrome.storage.local.get).mockResolvedValue({} as never);
    startFolderOwner(GEMINI_OWNER);
    await Promise.resolve();
    vi.mocked(chrome.storage.local.get).mockClear();

    await backgroundWriteQueue(async () => 'prompt turn');

    expect(chrome.storage.local.get).toHaveBeenCalledWith([BUNDLE_INTENT_KEY]);
  });

  it('T24b: startup writes only the running build’s legacy fence after an owner rollback', async () => {
    const storage = createFaultyStorage({
      gvFolderData: { legacy: 'edit' },
      'gvFolderOwner:meta:gvFolderData': { frozen: true },
      'gvFolderOwner:index': ['gvFolderData'],
      'gvFolderOwner:pending:c1:1': { accepted: true },
      [BUNDLE_INTENT_KEY]: { v: 1, txId: 'tx', status: 'open', site: 'chatgpt' },
      [AUTHORITY_FENCE_KEY]: { build: 'newer', sites: GEMINI_OWNER },
    });
    const before = storage.snapshot();
    vi.mocked(chrome.storage.local.set).mockImplementation((items) => storage.area.set(items));
    startFolderOwner();
    await backgroundWriteQueue(async () => 'prompt turn');

    expect(chrome.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();
    expect(chrome.alarms.onAlarm.addListener).not.toHaveBeenCalled();
    expect(chrome.alarms.create).not.toHaveBeenCalled();
    expect(chrome.alarms.clear).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).toHaveBeenCalledExactlyOnceWith({
      [AUTHORITY_FENCE_KEY]: { build: '1.9.0', sites: FOLDER_WRITE_AUTHORITY },
    });
    expect(storage.snapshot()).toEqual({
      ...before,
      [AUTHORITY_FENCE_KEY]: { build: '1.9.0', sites: FOLDER_WRITE_AUTHORITY },
    });
  });

  /** An owner worker whose open bundle is stuck on a failing K write, with its retry alarm armed. */
  async function stuckBundleWorker() {
    const storage = createFaultyStorage({
      gvFolderData: 'prev',
      cache: 'cache',
      [BUNDLE_INTENT_KEY]: {
        v: 1,
        txId: 'tx',
        status: 'open',
        site: 'gemini',
        clientId: 'c',
        seq: 1,
        at: 0,
        keys: {
          gvFolderData: { prevHash: await hashValue('prev'), nextHash: await hashValue('next') },
        },
        values: { gvFolderData: 'next' },
      },
    });
    storage.failWhen((op, keys) => op === 'set' && keys.includes('gvFolderData'));
    routeLocalStorage(storage);
    startFolderOwner(GEMINI_OWNER);
    await vi.waitFor(() => expect(alarms).toEqual(new Set([RETRY_ALARM])));
    expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'open' });
    storage.failWhen(null);
    return storage;
  }

  it.each(['the retry alarm', 'a storage event'] as const)(
    'R3.6: finishes a blocked bundle when %s wakes the worker',
    async (signal) => {
      const storage = await stuckBundleWorker();

      if (signal === 'the retry alarm') {
        fireAlarm(RETRY_ALARM);
      } else {
        await storage.area.remove(['cache']);
        emitLocalChange({ cache: { oldValue: 'cache' } });
      }
      await vi.waitFor(() =>
        expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' }),
      );

      expect(storage.read('gvFolderData')).toBe('next');
      expect(chrome.alarms.create).toHaveBeenCalledTimes(1);
      await vi.waitFor(() => expect(alarms).toEqual(new Set()));
    },
  );

  it('runs no second recovery when a retry alarm that already fired is delivered again', async () => {
    const storage = await stuckBundleWorker();
    fireAlarm(RETRY_ALARM);
    await vi.waitFor(() =>
      expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' }),
    );
    await backgroundWriteQueue(async () => undefined, []);
    const calls = storage.calls();

    fireAlarm(RETRY_ALARM);
    await backgroundWriteQueue(async () => undefined, []);

    expect(storage.calls()).toBe(calls);
  });

  it('drops the retry alarm an earlier worker left once a fresh worker finds nothing stuck', async () => {
    alarms.add(RETRY_ALARM);
    routeLocalStorage(createFaultyStorage());

    startFolderOwner(GEMINI_OWNER);
    await backgroundWriteQueue(async () => undefined, []);

    await vi.waitFor(() => expect(alarms).toEqual(new Set()));
  });

  it('answers a folder request with a write failure instead of leaving it unanswered when the fence write fails', async () => {
    const storage = createFaultyStorage();
    storage.failWhen((op, keys) => op === 'set' && keys.includes(AUTHORITY_FENCE_KEY));
    routeLocalStorage(storage);
    startFolderOwner(GEMINI_OWNER);
    const sendResponse = vi.fn();

    for (const [listener] of vi.mocked(chrome.runtime.onMessage.addListener).mock.calls) {
      listener(OPEN, GEMINI_TAB as chrome.runtime.MessageSender, sendResponse);
    }

    await vi.waitFor(() =>
      expect(sendResponse).toHaveBeenCalledExactlyOnceWith({
        kind: 'refused',
        reason: 'write_failed',
      }),
    );
    expect(storage.read(ownerMetaKey('gvFolderData'))).toBeUndefined();
  });

  it('lets prompt-library turns commit while a failing fence write holds back owner writes', async () => {
    const storage = createFaultyStorage({ gvFolderData: folderData([folder('F', 'Keep')]) });
    storage.failWhen((op, keys) => op === 'set' && keys.includes(AUTHORITY_FENCE_KEY));
    routeLocalStorage(storage);
    const owner = startFolderOwner(GEMINI_OWNER);
    const open = { key: 'gvFolderData', clientId: 'c', ackedThrough: 0 };
    const prompt = { id: 'p', text: 'Saved', tags: [], createdAt: 1 };

    await expect(promptLibraryOwner.apply({ kind: 'add', items: [prompt] })).resolves.toMatchObject(
      { added: 1 },
    );
    await expect(owner.open(open)).rejects.toThrow('fault at call');

    expect(storage.read(PROMPT_LIBRARY_KEY)).toEqual([prompt]);
    expect(storage.read(ownerMetaKey('gvFolderData'))).toBeUndefined();
    storage.failWhen(null);
    await expect(owner.open(open)).resolves.toMatchObject({ kind: 'ready' });
    expect(storage.read(AUTHORITY_FENCE_KEY)).toEqual({ build: '1.9.0', sites: GEMINI_OWNER });
  });

  it('rolls an open bundle forward from the no-read retry turn only after the fence lands', async () => {
    const storage = createFaultyStorage({
      gvFolderData: 'prev',
      [BUNDLE_INTENT_KEY]: {
        v: 1,
        txId: 'tx',
        status: 'open',
        site: 'gemini',
        clientId: 'c',
        seq: 1,
        at: 0,
        keys: {
          gvFolderData: { prevHash: await hashValue('prev'), nextHash: await hashValue('next') },
        },
        values: { gvFolderData: 'next' },
      },
    });
    storage.failWhen((op, keys) => op === 'set' && keys.includes(AUTHORITY_FENCE_KEY));
    routeLocalStorage(storage);
    startFolderOwner(GEMINI_OWNER);
    await vi.waitFor(() => expect(alarms).toEqual(new Set([RETRY_ALARM])));
    expect(storage.read('gvFolderData')).toBe('prev');

    storage.failWhen(null);
    fireAlarm(RETRY_ALARM);
    await vi.waitFor(() =>
      expect(storage.read(BUNDLE_INTENT_KEY)).toMatchObject({ status: 'closed' }),
    );
    expect(storage.read(AUTHORITY_FENCE_KEY)).toEqual({ build: '1.9.0', sites: GEMINI_OWNER });
    expect(storage.read('gvFolderData')).toBe('next');
  });
});
