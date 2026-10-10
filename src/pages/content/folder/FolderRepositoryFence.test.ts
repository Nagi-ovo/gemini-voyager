import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { buildScopedFolderStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { isVoyagerLayerEvent } from '@/core/ui/layer';
import { createToaster } from '@/core/ui/toast/toaster';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';
import {
  LegacyFolderFence,
  LegacyFolderWriteRefusedError,
} from '@/features/folder/owner/legacyFolderFence';
import { CHATGPT_FOLDER_CONFIG } from '@/features/plugins/builtin/chatgptFolders/config';
import { toastDriver } from '@/tests/toastDriver';

import { FolderRepository } from './FolderRepository';
import {
  AISTUDIO_FOLDER_CONFIG,
  GEMINI_FOLDER_CONFIG,
  type PlatformFolderConfig,
} from './platformFolderConfig';
import { AIStudioFolderStorageAdapter } from './storage/AIStudioFolderStorageAdapter';
import {
  LocalStorageFolderAdapter,
  type IFolderStorageAdapter,
} from './storage/FolderStorageAdapter';
import type { FolderData } from './types';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
    get runtime() {
      return chrome.runtime;
    },
  },
}));

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
const initial: FolderData = {
  folders: [
    {
      id: 'f',
      name: 'Stored',
      parentId: null,
      isExpanded: true,
      createdAt: 1,
      updatedAt: 1,
      sortIndex: 0,
    },
  ],
  folderContents: { f: [] },
};
const fence = (site: string, authority = 'owner') => ({
  build: 'test',
  sites: { [site]: authority },
});
const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
function pageBackups(namespace = 'chatgpt-folders') {
  return Object.fromEntries(
    ['primary', 'emergency', 'beforeUnload', 'metadata'].map((slot) => {
      const key = `gvBackup_${namespace}_${slot}`;
      return [key, localStorage.getItem(key)];
    }),
  );
}

let stored: Record<string, unknown>;
let listeners: Set<Listener>;
let originalStorage: typeof chrome.storage;
let originalPageUrl: string;
const repos: FolderRepository[] = [];
const onChange = vi.fn();
const onRecovery = vi.fn();
const onSaveFailed = vi.fn();

function change(value: unknown, area = 'local') {
  if (area === 'local') stored[AUTHORITY_FENCE_KEY] = value;
  for (const listener of listeners) listener({ [AUTHORITY_FENCE_KEY]: { newValue: value } }, area);
}
function repository(
  config: PlatformFolderConfig = CHATGPT_FOLDER_CONFIG,
  adapter: IFolderStorageAdapter = new AIStudioFolderStorageAdapter(),
) {
  const repo = new FolderRepository(config, adapter, {
    onChange,
    onRecovery,
    onSaveFailed,
    onExternalChange: () => void repo.loadData(),
    onAccountReleased: () => {},
    isEnabled: () => true,
  });
  repos.push(repo);
  return repo;
}
async function ready(adapter?: IFolderStorageAdapter) {
  stored[StorageKeys.FOLDER_DATA_CHATGPT] = clone(initial);
  const repo = repository(CHATGPT_FOLDER_CONFIG, adapter);
  await repo.init();
  await settle();
  return repo;
}

beforeEach(() => {
  stored = {};
  listeners = new Set();
  originalStorage = chrome.storage;
  originalPageUrl = window.location.href;
  chrome.storage = {
    local: {
      get: vi.fn(async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map((key) => [key, clone(stored[key])]),
        ),
      ),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(stored, clone(items));
      }),
      remove: vi.fn(async (keys: string | string[]) => {
        for (const key of Array.isArray(keys) ? keys : [keys]) delete stored[key];
      }),
    },
    sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    },
  } as unknown as typeof chrome.storage;
  localStorage.clear();
  document.body.replaceChildren();
  onChange.mockClear();
  onRecovery.mockClear();
  onSaveFailed.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const repo of repos.splice(0)) repo.destroy();
  chrome.storage = originalStorage;
  window.history.replaceState({}, '', originalPageUrl);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('legacy folder authority fence', () => {
  it('keeps one persistent reload toast beside other feedback until the user dismisses it', async () => {
    vi.useFakeTimers();
    const repo = await ready();
    const other = createToaster();
    try {
      other.show({ message: 'Other feedback', durationMs: null });
      change(fence('chatgpt'));
      change(fence('chatgpt'));
      await vi.advanceTimersByTimeAsync(60_000);
      const notice = toastDriver.find('Voyager was updated')!;
      expect(notice).toMatchObject({ tone: 'error', role: 'alert' });
      expect(toastDriver.all()).toHaveLength(2);
      const events: boolean[] = [];
      const pressed = (event: Event) => events.push(isVoyagerLayerEvent(event));
      document.addEventListener('pointerdown', pressed, { once: true });
      notice.element.dispatchEvent(
        new PointerEvent('pointerdown', { bubbles: true, composed: true }),
      );
      expect(events).toEqual([true]);
      toastDriver.press(notice, 'Close');
      expect(toastDriver.messages()).toEqual(['Other feedback']);
      change(fence('chatgpt'));
      expect(toastDriver.messages()).toEqual(['Other feedback']);
      expect(repo.canEdit).toBe(false);
    } finally {
      other.destroy();
    }
  });

  it.each(['close', 'destroy'] as const)(
    'removes only its reload toast when %s ends its lifetime',
    (method) => {
      const guard = new LegacyFolderFence(StorageKeys.FOLDER_DATA_CHATGPT, () => {}, false);
      const other = createToaster();
      try {
        other.show({ message: 'Other feedback', durationMs: null });
        guard.observe(fence('chatgpt'));
        expect(toastDriver.all()).toHaveLength(2);
        guard[method]();
        guard[method]();
        expect(toastDriver.messages()).toEqual(['Other feedback']);
      } finally {
        guard.destroy();
        other.destroy();
      }
    },
  );

  it.each([
    [CHATGPT_FOLDER_CONFIG, 'chatgpt'],
    [GEMINI_FOLDER_CONFIG, 'gemini'],
    [
      {
        ...AISTUDIO_FOLDER_CONFIG,
        storageKey: `${StorageKeys.FOLDER_DATA_AISTUDIO}:acct:abc`,
        platform: null,
      },
      'aistudio',
    ],
  ] as const)(
    'blocks init/migration for the owner of $1 while keeping memory',
    async (config, site) => {
      localStorage.setItem(config.storageKey, JSON.stringify(initial));
      stored[AUTHORITY_FENCE_KEY] = fence(site);
      const repo = repository(config, new LocalStorageFolderAdapter());
      repo.data = clone(initial);
      await repo.init();
      expect(repo.canEdit).toBe(false);
      expect(repo.data).toEqual(initial);
      expect(stored[config.storageKey]).toBeUndefined();
      expect(localStorage.getItem(`gvBackup_${config.backupNamespace}_primary`)).toBeNull();
      expect(toastDriver.all().find(({ role }) => role === 'alert')?.message).toBe(
        'Voyager was updated. Reload this tab to keep editing folders.',
      );
      expect(await repo.saveData()).toBe(false);
      expect(await repo.replaceData({ ...initial, folders: [] })).toBe(false);
    },
  );

  it.each(['legacy', 'owner'])(
    'gates deletion and atomic companions for %s authority',
    async (authority) => {
      const key = StorageKeys.FOLDER_DATA_CHATGPT;
      const marker = `${key}:imported`;
      stored[key] = clone(initial);
      stored[marker] = false;
      stored[AUTHORITY_FENCE_KEY] = fence('chatgpt', authority);
      const guard = new LegacyFolderFence(key, () => {});
      const adapter = new AIStudioFolderStorageAdapter();
      adapter.setWriteGate((_key, operation) => guard.write(operation));
      const edited = { ...initial, folders: [{ ...initial.folders[0], name: 'Edited' }] };
      const save = adapter.saveData(key, edited, { [marker]: true });
      if (authority === 'owner')
        await expect(save).rejects.toBeInstanceOf(LegacyFolderWriteRefusedError);
      else await save;
      expect(stored[key]).toEqual(authority === 'owner' ? initial : edited);
      expect(stored[marker]).toBe(authority !== 'owner');
      const remove = adapter.removeData(key);
      if (authority === 'owner')
        await expect(remove).rejects.toBeInstanceOf(LegacyFolderWriteRefusedError);
      else await remove;
      expect(stored[key]).toEqual(authority === 'owner' ? initial : undefined);
      guard.destroy();
    },
  );

  it('checks fresh authority before a save even without a storage event', async () => {
    const repo = await ready();
    repo.data.folders[0].name = 'Unsaved';
    const backups = pageBackups();
    stored[AUTHORITY_FENCE_KEY] = fence('chatgpt');
    expect(await repo.saveData()).toBe(false);
    await settle();
    window.dispatchEvent(new Event('beforeunload'));
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(repo.canEdit).toBe(false);
    expect(pageBackups()).toEqual(backups);
    expect(toastDriver.all().some(({ role }) => role === 'alert')).toBe(true);
    expect(onSaveFailed).not.toHaveBeenCalled();
  });

  it('observes only local authority and keeps a fenced tab closed after rollback', async () => {
    const repo = await ready();
    change(fence('chatgpt'), 'sync');
    expect(repo.canEdit).toBe(true);
    repo.data.folders[0].name = 'Memory';
    change(fence('chatgpt'));
    expect(repo.canEdit).toBe(false);
    change(fence('chatgpt', 'legacy'));
    await repo.loadData();
    expect(await repo.saveData()).toBe(false);
    expect(repo.data.folders[0]?.name).toBe('Memory');
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
    expect(toastDriver.all().filter(({ role }) => role === 'alert')).toHaveLength(1);
  });

  it('blocks a failed fence read without writing data or backups', async () => {
    const repo = await ready();
    repo.data.folders[0].name = 'Unsaved';
    const backups = pageBackups();
    vi.mocked(browser.storage.local.get).mockRejectedValue(new Error('read unavailable'));
    expect(await repo.saveData()).toBe(false);
    await settle();
    window.dispatchEvent(new Event('beforeunload'));
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(repo.canEdit).toBe(false);
    expect(pageBackups()).toEqual(backups);
    expect(onRecovery).toHaveBeenCalledWith('unreadable');
    expect(onSaveFailed).not.toHaveBeenCalled();
    expect(toastDriver.all().some(({ role }) => role === 'alert')).toBe(false);
  });

  it.each([GEMINI_FOLDER_CONFIG, AISTUDIO_FOLDER_CONFIG, CHATGPT_FOLDER_CONFIG])(
    'keeps a failed rename through unreadable rebind retries and corrupt recovery for $storageKey',
    async (config) => {
      vi.useFakeTimers();
      stored[config.storageKey] = clone(initial);
      const repo = repository(
        config,
        config.platform === 'gemini'
          ? new LocalStorageFolderAdapter()
          : new AIStudioFolderStorageAdapter(),
      );
      await repo.init();
      await settle();
      const writes = browser.storage.local.set;
      vi.mocked(writes).mockRejectedValue(new Error('Rename failed'));
      repo.data.folders[0].name = 'Mine';
      expect(await repo.saveData()).toBe(false);
      await settle();
      vi.mocked(writes).mockImplementation(async (items) => {
        Object.assign(stored, clone(items));
      });
      const backups = pageBackups(config.backupNamespace);
      const get = vi.mocked(browser.storage.local.get).getMockImplementation()!;
      vi.mocked(browser.storage.local.get).mockRejectedValue(new Error('Unreadable'));
      await repo.refreshAccountScope();
      expect(repo.data.folders[0]?.name).toBe('Mine');
      expect(repo.canEdit).toBe(false);
      expect(repo.storageKey).toBe('');
      await vi.advanceTimersByTimeAsync(1600);
      expect(repo.data.folders[0]?.name).toBe('Mine');
      expect(await repo.saveData()).toBe(false);
      window.dispatchEvent(new Event('beforeunload'));
      expect(stored[config.storageKey]).toEqual(initial);
      expect(pageBackups(config.backupNamespace)).toEqual(backups);
      const reading = deferred<Record<string, unknown>>();
      vi.mocked(browser.storage.local.get).mockImplementation(async (keys) => {
        if (keys === config.storageKey) return reading.promise;
        return get(keys);
      });
      await vi.advanceTimersByTimeAsync(3000);
      expect(repo.data.folders[0]?.name).toBe('Mine');
      expect(repo.canEdit).toBe(false);
      stored[config.storageKey] = { corrupted: true };
      reading.resolve({ [config.storageKey]: stored[config.storageKey] });
      await settle();
      expect(repo.canEdit).toBe(true);
      expect(repo.data.folders[0]?.name).toBe('Mine');
      expect((stored[config.storageKey] as FolderData).folders[0].name).toBe('Mine');
    },
  );

  it('hides released account edits when a different account has an unreadable fence', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/');
    vi.mocked(browser.storage.sync.get).mockResolvedValue({
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: true,
    });
    const firstKey = buildScopedFolderStorageKey('default');
    const secondKey = buildScopedFolderStorageKey('route:1');
    stored[firstKey] = clone(initial);
    stored[secondKey] = {
      ...clone(initial),
      folders: [{ ...initial.folders[0], name: 'Account B' }],
    };
    const repo = repository(GEMINI_FOLDER_CONFIG, new LocalStorageFolderAdapter());
    await repo.init();
    await settle();
    expect(repo.storageKey).toBe(firstKey);
    repo.data.folders[0].name = 'Private account A edit';
    window.history.replaceState({}, '', '/u/1/app');
    const get = vi.mocked(browser.storage.local.get).getMockImplementation()!;
    vi.mocked(browser.storage.local.get).mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) throw new Error('Fence unreadable');
      return get(keys);
    });
    await repo.refreshAccountScope();
    expect(repo.canEdit).toBe(false);
    expect(repo.storageKey).toBe('');
    expect(repo.data).toEqual({ folders: [], folderContents: {} });
    vi.mocked(browser.storage.local.get).mockImplementation(get);
    await vi.advanceTimersByTimeAsync(1000);
    expect(repo.canEdit).toBe(true);
    expect(repo.storageKey).toBe(secondKey);
    expect(repo.data.folders[0]?.name).toBe('Account B');
    expect(stored[firstKey]).toEqual(initial);
  });

  it('finishes account binding after a failed startup fence read', async () => {
    vi.useFakeTimers();
    window.history.replaceState({}, '', '/u/1/app');
    vi.mocked(browser.storage.sync.get).mockResolvedValue({
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: true,
    });
    const scopedKey = buildScopedFolderStorageKey('route:1');
    stored[StorageKeys.FOLDER_DATA] = clone(initial);
    stored[scopedKey] = { ...initial, folders: [{ ...initial.folders[0], name: 'Account' }] };
    const get = vi.mocked(browser.storage.local.get).getMockImplementation()!;
    let failedFenceReads = 0;
    vi.mocked(browser.storage.local.get).mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY && failedFenceReads++ < 2)
        throw new Error('fence unavailable');
      return get(keys);
    });
    const repo = repository(GEMINI_FOLDER_CONFIG);
    await repo.init();
    expect(repo.canEdit).toBe(false);
    await vi.advanceTimersByTimeAsync(3000);
    expect(repo.storageKey).toBe(scopedKey);
    expect(repo.data.folders[0]?.name).toBe('Account');
    expect(repo.canEdit).toBe(true);
    repo.data.folders[0].name = 'Saved account';
    expect(await repo.saveData()).toBe(true);
    expect(stored[StorageKeys.FOLDER_DATA]).toEqual(initial);
    expect((stored[scopedKey] as FolderData).folders[0].name).toBe('Saved account');
  });

  it('retains unsaved memory when an account refresh discovers the owner fence', async () => {
    const repo = await ready();
    repo.data.folders[0].name = 'Unsaved';
    stored[AUTHORITY_FENCE_KEY] = fence('chatgpt');
    await repo.refreshAccountScope();
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(repo.canEdit).toBe(false);
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
  });

  it('retains the released session when authority changes during account binding', async () => {
    const repo = await ready();
    repo.data.folders[0].name = 'Unsaved';
    const gate = deferred<Record<string, unknown>>();
    const started = deferred<void>();
    vi.mocked(browser.storage.local.get).mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) {
        started.resolve();
        return gate.promise;
      }
      return { [keys as string]: clone(stored[keys as string]) };
    });
    const binding = repo.refreshAccountScope();
    await started.promise;
    change(fence('chatgpt'));
    gate.resolve({});
    await binding;
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(repo.storageKey).toBe(StorageKeys.FOLDER_DATA_CHATGPT);
    expect(repo.canEdit).toBe(false);
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
  });

  it('fences the empty-save diagnostic before its adapter can mirror storage', async () => {
    const repo = await ready(new LocalStorageFolderAdapter());
    const pageData = localStorage.getItem(StorageKeys.FOLDER_DATA_CHATGPT);
    repo.data = { folders: [], folderContents: {} };
    stored[StorageKeys.FOLDER_DATA_CHATGPT] = {
      ...initial,
      folders: [{ ...initial.folders[0], name: 'Owner data' }],
    };
    stored[AUTHORITY_FENCE_KEY] = fence('chatgpt');
    expect(await repo.saveData()).toBe(false);
    expect(localStorage.getItem(StorageKeys.FOLDER_DATA_CHATGPT)).toBe(pageData);
    expect((stored[StorageKeys.FOLDER_DATA_CHATGPT] as FolderData).folders[0].name).toBe(
      'Owner data',
    );
    expect(repo.data).toEqual({ folders: [], folderContents: {} });
  });

  it('does not replace unsaved memory or create a mirror when load finds an owner fence', async () => {
    const repo = await ready(new LocalStorageFolderAdapter());
    repo.data.folders[0].name = 'Unsaved';
    const pageData = localStorage.getItem(StorageKeys.FOLDER_DATA_CHATGPT);
    stored[StorageKeys.FOLDER_DATA_CHATGPT] = {
      ...initial,
      folders: [{ ...initial.folders[0], name: 'Owner data' }],
    };
    stored[AUTHORITY_FENCE_KEY] = fence('chatgpt');
    await repo.loadData();
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(localStorage.getItem(StorageKeys.FOLDER_DATA_CHATGPT)).toBe(pageData);
  });

  it('does not apply a read that finishes after the owner fence', async () => {
    const repo = await ready();
    repo.data.folders[0].name = 'Unsaved';
    const gate = deferred<Record<string, unknown>>();
    const started = deferred<void>();
    const get = browser.storage.local.get;
    vi.mocked(get).mockImplementation(async (keys) => {
      if (keys === StorageKeys.FOLDER_DATA_CHATGPT) {
        started.resolve();
        return gate.promise;
      }
      return { [AUTHORITY_FENCE_KEY]: stored[AUTHORITY_FENCE_KEY] };
    });
    const loading = repo.loadData();
    await started.promise;
    change(fence('chatgpt'));
    gate.resolve({ [StorageKeys.FOLDER_DATA_CHATGPT]: initial });
    await loading;
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(repo.canEdit).toBe(false);
  });

  it('checks authority again before corrupt-data recovery replaces memory', async () => {
    const repo = await ready();
    repo.data.folders[0].name = 'Unsaved';
    stored[StorageKeys.FOLDER_DATA_CHATGPT] = 'broken';
    vi.mocked(browser.storage.local.get).mockImplementation(async (keys) => {
      if (keys === StorageKeys.FOLDER_DATA_CHATGPT) {
        stored[AUTHORITY_FENCE_KEY] = fence('chatgpt');
        return { [StorageKeys.FOLDER_DATA_CHATGPT]: 'broken' };
      }
      return { [AUTHORITY_FENCE_KEY]: stored[AUTHORITY_FENCE_KEY] };
    });
    await repo.loadData();
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toBe('broken');
    expect(repo.canEdit).toBe(false);
    expect(toastDriver.all().some(({ role }) => role === 'alert')).toBe(true);
  });

  it('retains memory when the owner fence arrives during backup hydration', async () => {
    const repo = await ready();
    repo.data.folders[0].name = 'Unsaved';
    stored[StorageKeys.FOLDER_DATA_CHATGPT] = 'broken';
    const gate = deferred<Record<string, unknown>>();
    const started = deferred<void>();
    vi.mocked(browser.storage.local.get).mockImplementation(async (keys) => {
      if (Array.isArray(keys)) {
        started.resolve();
        return gate.promise;
      }
      return { [keys as string]: clone(stored[keys as string]) };
    });
    const loading = repo.loadData();
    await started.promise;
    change(fence('chatgpt'));
    gate.resolve({});
    await loading;
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toBe('broken');
    expect(repo.canEdit).toBe(false);
  });

  it('checks again before retrying an adapter failure', async () => {
    const repo = await ready(new LocalStorageFolderAdapter());
    repo.data.folders[0].name = 'Unsaved';
    vi.mocked(browser.storage.local.set).mockImplementation(async () => {
      stored[AUTHORITY_FENCE_KEY] = fence('chatgpt');
      throw new Error('first write failed');
    });
    expect(await repo.saveData()).toBe(false);
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
    expect(repo.data.folders[0]?.name).toBe('Unsaved');
    expect(toastDriver.all().some(({ role }) => role === 'alert')).toBe(true);
  });

  it('cancels queued snapshots and the debounce while retaining the newest edit', async () => {
    vi.useFakeTimers();
    const repo = await ready();
    const gate = deferred<void>();
    const started = deferred<void>();
    vi.mocked(browser.storage.local.set).mockImplementation(async () => {
      started.resolve();
      await gate.promise;
      throw new Error('issued write failed');
    });
    const first = repo.saveData();
    await started.promise;
    repo.data.folders[0].name = 'Latest';
    const queued = repo.saveData();
    repo.scheduleSaveData();
    change(fence('chatgpt'));
    expect(await queued).toBe(false);
    gate.resolve();
    expect(await first).toBe(false);
    await vi.advanceTimersByTimeAsync(31000);
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
    expect(repo.data.folders[0]?.name).toBe('Latest');
    expect(repo.canEdit).toBe(false);
  });

  it('stops queued Safari backup copies, late metadata and unload after fencing', async () => {
    vi.spyOn(navigator, 'vendor', 'get').mockReturnValue('Apple Computer, Inc.');
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Version/17.0 Safari/605.1.15');
    const gate = deferred<{ status: string }>();
    vi.mocked(browser.runtime.sendMessage).mockReturnValue(gate.promise);
    const repo = await ready();
    const emergency = repo.session!.backup.createEmergencyBackup(initial);
    await settle();
    const backups = pageBackups();
    const sent = vi.mocked(browser.runtime.sendMessage).mock.calls.length;
    change(fence('chatgpt'));
    gate.resolve({ status: 'saved' });
    await emergency;
    await settle();
    repo.session!.markReady();
    window.dispatchEvent(new Event('beforeunload'));
    expect(await repo.session!.backup.createPrimaryBackup(initial)).toBe(false);
    expect(vi.mocked(browser.runtime.sendMessage).mock.calls.length).toBe(sent);
    expect(pageBackups()).toEqual(backups);
    expect(stored[StorageKeys.FOLDER_DATA_CHATGPT]).toEqual(initial);
  });

  it.each([
    undefined,
    { build: 'legacy', sites: { chatgpt: 'legacy', gemini: 'legacy', aistudio: 'legacy' } },
  ])('keeps legacy edits, backups and unload unchanged for fence %j', async (authority) => {
    stored[AUTHORITY_FENCE_KEY] = authority;
    const repo = await ready();
    repo.data.folders[0].name = 'Saved';
    expect(await repo.saveData()).toBe(true);
    await settle();
    expect(repo.canEdit).toBe(true);
    expect((stored[StorageKeys.FOLDER_DATA_CHATGPT] as FolderData).folders[0].name).toBe('Saved');
    expect(
      JSON.parse(localStorage.getItem('gvBackup_chatgpt-folders_emergency')!).data.folders[0].name,
    ).toBe('Saved');
    window.dispatchEvent(new Event('beforeunload'));
    await settle();
    expect(
      JSON.parse(localStorage.getItem('gvBackup_chatgpt-folders_beforeUnload')!).data.folders[0]
        .name,
    ).toBe('Saved');
    expect(toastDriver.all().some(({ role }) => role === 'alert')).toBe(false);
    expect(onRecovery).not.toHaveBeenCalled();
  });
});
