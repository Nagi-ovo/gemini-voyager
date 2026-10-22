import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AccountScope,
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import type { FolderData } from '@/core/types/folder';
import {
  type MemoryStorage,
  createMemoryStorage,
  settle,
} from '@/features/plugins/builtin/chatgptFolders/__tests__/memoryStorage';
import { CHATGPT_FOLDER_CONFIG } from '@/pages/content/folder/pluginSiteFolderConfigs';

import { FolderRepository } from '../../FolderRepository';
import { SiteFolderStore } from '../../SiteFolderStore';
import { GEMINI_FOLDER_CONFIG } from '../../platformFolderConfig';
import { AIStudioFolderStorageAdapter } from '../../storage/AIStudioFolderStorageAdapter';
import { createFolderSessions } from '../folderSessions';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
  },
}));

function data(name: string): FolderData {
  return {
    folders: [
      {
        id: 'folder',
        name,
        parentId: null,
        isExpanded: true,
        sortIndex: 0,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    folderContents: { folder: [] },
  };
}

const nameIn = (value: unknown): string | undefined =>
  (value as FolderData | undefined)?.folders[0]?.name;

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
/** Writes to `heldKey` wait here until the test lets them land. */
let heldKey: string | null;
const heldWrites: Array<() => void> = [];

beforeEach(() => {
  memory = createMemoryStorage();
  originalStorage = chrome.storage;
  chrome.storage = memory.api;
  localStorage.clear();
  heldKey = null;
  heldWrites.length = 0;
  const set = memory.api.local.set.bind(memory.api.local);
  vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
    if (heldKey && heldKey in items) {
      await new Promise<void>((resolve) => heldWrites.push(resolve));
    }
    await set(items);
  });
});

afterEach(async () => {
  for (const release of heldWrites.splice(0)) release();
  await settle(30);
  chrome.storage = originalStorage;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('folder sessions', () => {
  const key = CHATGPT_FOLDER_CONFIG.storageKey;
  const sessions = () => createFolderSessions(() => new SiteFolderStore(CHATGPT_FOLDER_CONFIG));

  it('release resolves only after an in-flight save settles', async () => {
    memory.values.local.set(key, data('Stored'));
    const lease = sessions().open('chatgpt');
    await lease.ready;
    expect(lease.store.ready).toBe(true);

    heldKey = key;
    lease.store.apply(data('Edited'));
    await settle(10);
    expect(heldWrites).toHaveLength(1);

    let released = false;
    void lease.release().then(() => (released = true));
    await settle(30);
    expect(released).toBe(false);

    heldWrites.shift()?.();
    await vi.waitFor(() => expect(released).toBe(true));
    expect(nameIn(memory.values.local.get(key))).toBe('Edited');
  });

  it('shares one store between leases and closes it with the last one', async () => {
    memory.values.local.set(key, data('Stored'));
    const folders = sessions();
    const first = folders.open('chatgpt');
    const second = folders.open('chatgpt');
    expect(second.store).toBe(first.store);
    await first.ready;

    await first.release();
    await first.release();
    expect(folders.leases('chatgpt')).toBe(1);
    expect(second.store.ready).toBe(true);
    await second.release();
    expect(folders.leases('chatgpt')).toBe(0);
    expect(second.store.ready).toBe(false);
  });

  it('a site reopened while its last write drains loads that write, not the older data', async () => {
    memory.values.local.set(key, data('Stored'));
    const folders = sessions();
    const before = folders.open('chatgpt');
    await before.ready;
    heldKey = key;
    before.store.apply(data('Last edit'));
    await settle(10);
    void before.release();

    const after = folders.open('chatgpt');
    expect(after.store).not.toBe(before.store);
    let started = false;
    void after.ready.then(() => (started = true));
    await settle(30);
    expect(started).toBe(false);

    heldWrites.shift()?.();
    await after.ready;
    expect(nameIn(after.store.data)).toBe('Last edit');
    await after.release();
  });
});

describe('an account switch before the drain', () => {
  it('A→B→A: the drained edit is written only to account A’s bucket', async () => {
    const scope = (accountKey: string, accountId: number): AccountScope => ({
      accountKey,
      accountId,
      routeUserId: String(accountId),
      emailHash: null,
    });
    let account = scope('a', 0);
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(true);
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockImplementation(
      async () => account,
    );
    const base = GEMINI_FOLDER_CONFIG.storageKey;
    const keyA = buildScopedStorageKey(base, 'a');
    const keyB = buildScopedStorageKey(base, 'b');
    memory.values.local.set(keyA, data('Account A'));
    memory.values.local.set(keyB, data('Account B'));

    let repository: FolderRepository | null = null;
    const folders = createFolderSessions(() => {
      const created = new FolderRepository(
        GEMINI_FOLDER_CONFIG,
        new AIStudioFolderStorageAdapter(),
        {
          onChange: () => {},
          onRecovery: () => {},
          onExternalChange: () => void created.loadData(),
          onAccountReleased: () => {},
          isEnabled: () => true,
        },
      );
      repository = created;
      return { init: () => created.init(), close: () => created.destroy() };
    });
    const lease = folders.open('gemini');
    await lease.ready;
    await settle(30);
    const repo = repository as FolderRepository | null;
    if (!repo) throw new Error('no repository');
    expect(repo.storageKey).toBe(keyA);

    heldKey = keyA;
    repo.data = data('Edit in A');
    void repo.saveData();
    await settle(10);
    expect(heldWrites).toHaveLength(1);

    account = scope('b', 1);
    await repo.refreshAccountScope();
    await repo.loadData();
    await settle(30);
    expect(repo.storageKey).toBe(keyB);
    account = scope('a', 0);
    await repo.refreshAccountScope();
    await repo.loadData();
    await settle(30);
    expect(repo.storageKey).toBe(keyA);

    let released = false;
    void lease.release().then(() => (released = true));
    await settle(30);
    expect(released).toBe(false);
    heldWrites.shift()?.();
    await vi.waitFor(() => expect(released).toBe(true));

    expect(nameIn(memory.values.local.get(keyA))).toBe('Edit in A');
    expect(nameIn(memory.values.local.get(keyB))).toBe('Account B');
    expect(memory.values.local.has(base)).toBe(false);
  });
});
