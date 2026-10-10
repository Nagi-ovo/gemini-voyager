/**
 * Characterization of FolderStore persistence as observed through its public
 * API: what a load leaves in memory, what a save writes, how recovery and the
 * storage echo behave. These pin current behavior (including quirks) so the
 * persistence code can move without changing what reaches storage.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  type AccountScope,
  accountIsolationService,
  buildScopedFolderStorageKey,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { DataBackupService } from '@/core/services/DataBackupService';
import { validateFolderData } from '@/features/folder/model/folderData';

import { FolderStore, type FolderStoreChange } from '../FolderStore';
import type { IFolderStorageAdapter } from '../storage/FolderStorageAdapter';
import type { ConversationReference, Folder, FolderData } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'test-extension-id' },
  },
}));

const GLOBAL_KEY = 'gvFolderData';
const ACCOUNT: AccountScope = {
  accountKey: 'email:one',
  accountId: 1,
  routeUserId: '1',
  emailHash: 'one',
};
const SCOPED_KEY = buildScopedFolderStorageKey(ACCOUNT.accountKey);

type StorageListener = (changes: Record<string, unknown>, area: string) => void;

const beta: Folder = {
  id: 'f-b',
  name: 'Beta',
  parentId: null,
  isExpanded: true,
  createdAt: 1,
  updatedAt: 1,
};
const alpha: Folder = {
  id: 'f-a',
  name: 'alpha',
  parentId: null,
  isExpanded: false,
  createdAt: 2,
  updatedAt: 2,
};
const child: Folder = {
  id: 'f-child',
  name: 'Child',
  parentId: 'f-a',
  isExpanded: true,
  sortIndex: 0,
  createdAt: 3,
  updatedAt: 3,
};

function conversation(
  hex: string,
  title: string,
  url: string,
  extra: Partial<ConversationReference> = {},
): ConversationReference {
  return { conversationId: `c_${hex}`, title, url, addedAt: 0, ...extra };
}

const c111 = conversation('111', 'One', 'https://gemini.google.com/u/1/app/111', {
  addedAt: 10,
  lastOpenedAt: 50,
});
const c222 = conversation('222', 'Two', 'https://gemini.google.com/app/222', { addedAt: 20 });
const c333 = conversation('333', 'Three', 'https://gemini.google.com/u/2/app/333', {
  addedAt: 30,
  sortIndex: 0,
});
const c444 = conversation('444', 'Four', 'https://gemini.google.com/u/1/app/444', { addedAt: 5 });
const c555 = conversation('555', 'Five', 'https://gemini.google.com/app/555', { addedAt: 6 });
const c666 = conversation('666', 'Six', 'https://gemini.google.com/app/666', { addedAt: 7 });

/** Real-shaped stored data: unsorted folders, an orphan bucket and AI Studio's root key. */
function storedFixture(): FolderData {
  return structuredClone({
    folders: [beta, alpha, child],
    folderContents: {
      'f-b': [c111, c222],
      'f-a': [],
      'f-child': [c333],
      __root_conversations__: [c444],
      __uncategorized__: [c555],
      'ghost-folder': [c666],
    },
  });
}

/** What a global load leaves in memory: sortIndex seeded, only folder + Gemini root buckets kept. */
function expectedGlobalLoad(): FolderData {
  return {
    folders: [{ ...beta, sortIndex: 1 }, { ...alpha, sortIndex: 0 }, child],
    folderContents: {
      'f-b': [
        { ...c111, sortIndex: 0 },
        { ...c222, sortIndex: 1 },
      ],
      'f-a': [],
      'f-child': [c333],
      __root_conversations__: [{ ...c444, sortIndex: 0 }],
    },
  };
}

/** What the first scoped load for /u/1 writes under the account key. */
function expectedScopedMigrationWrite(): FolderData {
  return {
    folders: [{ ...beta, sortIndex: 0 }],
    folderContents: {
      'f-b': [
        { ...c111, sortIndex: 0 },
        { ...c222, sortIndex: 1 },
      ],
      __root_conversations__: [{ ...c444, sortIndex: 0 }],
      // Written by the migration before the load prunes non-folder buckets in memory.
      __uncategorized__: [{ ...c555, sortIndex: 0 }],
      'ghost-folder': [{ ...c666, sortIndex: 0 }],
    },
  };
}

function bytes(value: unknown): string {
  return JSON.stringify(value);
}

describe('FolderStore persistence characterization', () => {
  let saved: Map<string, unknown>;
  let adapter: IFolderStorageAdapter;
  let onChange: ReturnType<typeof vi.fn<(reason: FolderStoreChange) => void>>;
  let onRecovery: ReturnType<typeof vi.fn<(result: 'recovered' | 'lost' | 'unreadable') => void>>;
  let store: FolderStore | null;

  function createStore(): FolderStore {
    store = new FolderStore(
      {
        getContext: () => ({ sidebar: null, sortMode: 'manual', enabled: true }),
        onChange,
        onArchive: vi.fn(),
        onRecovery,
      },
      adapter,
    );
    return store;
  }

  function storageListener(): StorageListener {
    const calls = vi.mocked(browser.storage.onChanged.addListener).mock.calls;
    expect(calls).toHaveLength(1);
    return calls[0][0] as unknown as StorageListener;
  }

  function useIsolation(enabled: boolean): void {
    vi.mocked(accountIsolationService.isIsolationEnabled).mockResolvedValue(enabled);
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    store = null;
    vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
    vi.spyOn(accountIsolationService, 'resolveAccountScope').mockResolvedValue(ACCOUNT);
    saved = new Map();
    onChange = vi.fn();
    onRecovery = vi.fn();
    adapter = {
      init: vi.fn(async () => {}),
      loadData: vi.fn(async (key: string) =>
        saved.has(key) ? structuredClone(saved.get(key) as FolderData) : null,
      ),
      saveData: vi.fn(async (key: string, data: FolderData) => {
        saved.set(key, structuredClone(data));
        return true;
      }),
      removeData: vi.fn(async () => {}),
      getBackendName: () => 'test-memory',
    };
  });

  afterEach(() => {
    store?.destroy();
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('load', () => {
    it('normalizes and prunes real-shaped global data without writing it back', async () => {
      saved.set(GLOBAL_KEY, storedFixture());
      const folderStore = createStore();
      await folderStore.init();

      expect(folderStore.storageKey).toBe(GLOBAL_KEY);
      expect(folderStore.accountScope).toBeNull();
      expect(folderStore.canEdit).toBe(true);
      expect(bytes(folderStore.data)).toBe(bytes(expectedGlobalLoad()));
      expect(adapter.saveData).not.toHaveBeenCalled();
      expect(bytes(saved.get(GLOBAL_KEY))).toBe(bytes(storedFixture()));
      expect(onChange).toHaveBeenCalledWith('loaded');
      expect(onRecovery).not.toHaveBeenCalled();
      // Initializes each storage key once.
      expect(adapter.init).toHaveBeenCalledTimes(1);
      expect(adapter.init).toHaveBeenCalledWith(GLOBAL_KEY);
    });

    it('migrates the legacy global bucket into the account bucket, filtered by /u/N', async () => {
      useIsolation(true);
      saved.set(GLOBAL_KEY, storedFixture());
      const folderStore = createStore();
      await folderStore.init();

      expect(folderStore.storageKey).toBe(SCOPED_KEY);
      expect(folderStore.accountScope).toEqual(ACCOUNT);
      expect(vi.mocked(adapter.saveData).mock.calls.map((call) => call[0])).toEqual([SCOPED_KEY]);
      expect(bytes(saved.get(SCOPED_KEY))).toBe(bytes(expectedScopedMigrationWrite()));
      // The legacy global bucket is read, never rewritten or removed.
      expect(bytes(saved.get(GLOBAL_KEY))).toBe(bytes(storedFixture()));
      expect(adapter.removeData).not.toHaveBeenCalled();

      const {
        __uncategorized__: _uncategorized,
        'ghost-folder': _ghost,
        ...kept
      } = expectedScopedMigrationWrite().folderContents;
      expect(bytes(folderStore.data)).toBe(
        bytes({ folders: expectedScopedMigrationWrite().folders, folderContents: kept }),
      );
      expect(localStorage.getItem('gvBackup_gemini-folders_primary')).toBeNull();
      const scopedBackupNamespace = buildScopedStorageKey('gemini-folders', ACCOUNT.accountKey);
      const scopedPrimary = JSON.parse(
        localStorage.getItem(`gvBackup_${scopedBackupNamespace}_primary`) ?? '{}',
      );
      expect(bytes(scopedPrimary.data)).toBe(bytes(folderStore.data));
    });

    it('prefers existing account data over the legacy bucket', async () => {
      useIsolation(true);
      saved.set(GLOBAL_KEY, storedFixture());
      const scoped: FolderData = {
        folders: [{ ...beta, sortIndex: 4 }],
        folderContents: { 'f-b': [{ ...c222, sortIndex: 0 }] },
      };
      saved.set(SCOPED_KEY, structuredClone(scoped));
      const folderStore = createStore();
      await folderStore.init();

      expect(bytes(folderStore.data)).toBe(bytes(scoped));
      expect(adapter.saveData).not.toHaveBeenCalled();
    });

    it('starts empty and editable when neither bucket has data', async () => {
      useIsolation(true);
      const folderStore = createStore();
      await folderStore.init();

      expect(folderStore.data).toEqual({ folders: [], folderContents: {} });
      expect(folderStore.canEdit).toBe(true);
      expect(adapter.saveData).not.toHaveBeenCalled();
      expect(onRecovery).not.toHaveBeenCalled();
    });
  });

  describe('save', () => {
    it('writes back exactly what a load produced', async () => {
      saved.set(GLOBAL_KEY, storedFixture());
      const folderStore = createStore();
      await folderStore.init();

      await expect(folderStore.saveData()).resolves.toBe(true);

      expect(vi.mocked(adapter.saveData).mock.calls.map((call) => call[0])).toEqual([GLOBAL_KEY]);
      expect(bytes(saved.get(GLOBAL_KEY))).toBe(bytes(expectedGlobalLoad()));
      const primary = JSON.parse(localStorage.getItem('gvBackup_gemini-folders_primary') ?? '{}');
      expect(bytes(primary.data)).toBe(bytes(expectedGlobalLoad()));
      const emergency = JSON.parse(
        localStorage.getItem('gvBackup_gemini-folders_emergency') ?? '{}',
      );
      expect(bytes(emergency.data)).toBe(bytes(expectedGlobalLoad()));
      expect(onChange).toHaveBeenCalledWith('saved');
    });

    it('retries one failed write before reporting failure', async () => {
      saved.set(GLOBAL_KEY, storedFixture());
      const folderStore = createStore();
      await folderStore.init();
      vi.mocked(adapter.saveData).mockResolvedValue(false);

      await expect(folderStore.saveData()).resolves.toBe(false);
      expect(adapter.saveData).toHaveBeenCalledTimes(2);
    });

    it('debounces scheduled saves and flushes them on destroy', async () => {
      saved.set(GLOBAL_KEY, storedFixture());
      const folderStore = createStore();
      await folderStore.init();

      folderStore.scheduleSaveData();
      folderStore.scheduleSaveData();
      await vi.advanceTimersByTimeAsync(299);
      expect(adapter.saveData).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(adapter.saveData).toHaveBeenCalledTimes(1);

      folderStore.scheduleSaveData();
      folderStore.destroy();
      store = null;
      await vi.advanceTimersByTimeAsync(0);
      expect(adapter.saveData).toHaveBeenCalledTimes(2);
      expect(folderStore.canEdit).toBe(false);
    });
  });

  describe('recovery', () => {
    function seedPrimaryBackup(data: FolderData): void {
      new DataBackupService<FolderData>('gemini-folders', validateFolderData).createPrimaryBackup(
        data,
      );
    }

    it('restores a valid backup over corrupt storage and writes it back', async () => {
      const backup: FolderData = {
        folders: [beta],
        folderContents: { 'f-b': [c222] },
      };
      seedPrimaryBackup(backup);
      saved.set(GLOBAL_KEY, { folders: 'corrupt', folderContents: {} });
      const folderStore = createStore();
      await folderStore.init();

      const restored = {
        folders: [{ ...beta, sortIndex: 0 }],
        folderContents: { 'f-b': [{ ...c222, sortIndex: 0 }] },
      };
      expect(onRecovery).toHaveBeenCalledWith('recovered');
      expect(bytes(folderStore.data)).toBe(bytes(restored));
      expect(bytes(saved.get(GLOBAL_KEY))).toBe(bytes(restored));
    });

    it('reports a loss and starts empty when corrupt storage has no backup', async () => {
      saved.set(GLOBAL_KEY, { folders: 'corrupt', folderContents: {} });
      const folderStore = createStore();
      await folderStore.init();

      expect(onRecovery).toHaveBeenCalledWith('lost');
      expect(folderStore.data).toEqual({ folders: [], folderContents: {} });
      expect(folderStore.canEdit).toBe(true);
      expect(adapter.saveData).not.toHaveBeenCalled();
    });

    it('keeps a folder another tab added when a reload cannot read it and the user renames', async () => {
      saved.set(GLOBAL_KEY, { folders: [beta], folderContents: { 'f-b': [c222] } });
      const folderStore = createStore();
      await folderStore.init();
      // Another tab adds a folder; this tab's reload then fails to read.
      const newer: FolderData = { folders: [beta, alpha], folderContents: { 'f-b': [c222] } };
      saved.set(GLOBAL_KEY, newer);
      vi.mocked(adapter.loadData).mockRejectedValueOnce(new Error('storage unavailable'));
      await folderStore.loadData();

      expect(folderStore.data.folders.map(({ id }) => id)).toEqual([beta.id]);
      expect(folderStore.canEdit).toBe(false);
      folderStore.renameFolder(beta.id, 'Renamed during the outage');
      await vi.advanceTimersByTimeAsync(0);
      expect(adapter.saveData).not.toHaveBeenCalled();
      expect(bytes(saved.get(GLOBAL_KEY))).toBe(bytes(newer));

      await vi.advanceTimersByTimeAsync(1000);
      expect(folderStore.canEdit).toBe(true);
      folderStore.renameFolder(beta.id, 'Renamed');
      await vi.advanceTimersByTimeAsync(0);
      const stored = saved.get(GLOBAL_KEY) as FolderData;
      expect(stored.folders.map(({ id, name }) => [id, name])).toEqual([
        [beta.id, 'Renamed'],
        [alpha.id, alpha.name],
      ]);
    });

    it('saves an expand toggle made before a failed reload onto the data the retry reads', async () => {
      saved.set(GLOBAL_KEY, { folders: [beta], folderContents: { 'f-b': [c222] } });
      const folderStore = createStore();
      await folderStore.init();
      folderStore.toggleFolder(beta.id);
      saved.set(GLOBAL_KEY, { folders: [beta, alpha], folderContents: { 'f-b': [c222] } });
      vi.mocked(adapter.loadData).mockRejectedValueOnce(new Error('storage unavailable'));
      await folderStore.loadData();

      // The debounce comes due while the bucket is unreadable: nothing is written yet.
      await vi.advanceTimersByTimeAsync(600);
      expect(adapter.saveData).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      const stored = saved.get(GLOBAL_KEY) as FolderData;
      expect(stored.folders.map(({ id, isExpanded }) => [id, isExpanded])).toEqual([
        [beta.id, false],
        [alpha.id, alpha.isExpanded],
      ]);
    });

    it('stays read-only and writes nothing when the first read fails, until a retry reads', async () => {
      seedPrimaryBackup({ folders: [beta], folderContents: { 'f-b': [c222] } });
      saved.set(GLOBAL_KEY, storedFixture());
      vi.mocked(adapter.loadData).mockRejectedValueOnce(new Error('storage unavailable'));
      const folderStore = createStore();
      await folderStore.init();

      expect(onRecovery).toHaveBeenCalledWith('unreadable');
      expect(folderStore.canEdit).toBe(false);
      expect(folderStore.createFolder('During the outage')).toBeNull();
      expect(adapter.saveData).not.toHaveBeenCalled();
      expect(bytes(saved.get(GLOBAL_KEY))).toBe(bytes(storedFixture()));

      await vi.advanceTimersByTimeAsync(1000);
      expect(folderStore.canEdit).toBe(true);
      expect(bytes(folderStore.data)).toBe(bytes(expectedGlobalLoad()));
      expect(adapter.saveData).not.toHaveBeenCalled();
    });
  });

  describe('storage echo and cross-tab reload', () => {
    async function loadedStore(): Promise<{ folderStore: FolderStore; listener: StorageListener }> {
      saved.set(GLOBAL_KEY, storedFixture());
      const folderStore = createStore();
      await folderStore.init();
      return { folderStore, listener: storageListener() };
    }

    it('swallows exactly one echo per armed write', async () => {
      const { folderStore, listener } = await loadedStore();
      const reload = vi.spyOn(folderStore, 'reloadFoldersFromStorage').mockResolvedValue();

      await folderStore.saveData();
      listener({ [GLOBAL_KEY]: { newValue: saved.get(GLOBAL_KEY) } }, 'local');
      expect(reload).not.toHaveBeenCalled();

      listener({ [GLOBAL_KEY]: { newValue: saved.get(GLOBAL_KEY) } }, 'local');
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('suppresses only the echo of the write attempt that landed', async () => {
      const { folderStore, listener } = await loadedStore();
      const reload = vi.spyOn(folderStore, 'reloadFoldersFromStorage').mockResolvedValue();
      vi.mocked(adapter.saveData).mockResolvedValueOnce(false);

      await folderStore.saveData();
      listener({ [GLOBAL_KEY]: { newValue: saved.get(GLOBAL_KEY) } }, 'local');
      expect(reload).not.toHaveBeenCalled();
      // The failed first attempt changed nothing, so it has no echo to swallow.
      listener({ [GLOBAL_KEY]: { newValue: saved.get(GLOBAL_KEY) } }, 'local');
      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads an external write that follows a no-op save', async () => {
      const { folderStore, listener } = await loadedStore();
      const reload = vi.spyOn(folderStore, 'reloadFoldersFromStorage').mockResolvedValue();
      await folderStore.saveData();
      listener({ [GLOBAL_KEY]: { newValue: saved.get(GLOBAL_KEY) } }, 'local');

      // Unchanged data: chrome.storage emits no change event for this write.
      await folderStore.saveData();
      listener({ [GLOBAL_KEY]: { newValue: { ...expectedGlobalLoad(), folders: [] } } }, 'local');

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads an external write that follows a rejected save', async () => {
      const { folderStore, listener } = await loadedStore();
      const reload = vi.spyOn(folderStore, 'reloadFoldersFromStorage').mockResolvedValue();
      vi.mocked(adapter.saveData).mockResolvedValue(false);

      await expect(folderStore.saveData()).resolves.toBe(false);
      listener({ [GLOBAL_KEY]: { newValue: { ...expectedGlobalLoad(), folders: [] } } }, 'local');

      expect(reload).toHaveBeenCalledTimes(1);
    });

    it('stops suppressing after the 2s window and clears the stale echo', async () => {
      const { folderStore, listener } = await loadedStore();
      const reload = vi.spyOn(folderStore, 'reloadFoldersFromStorage').mockResolvedValue();

      await folderStore.saveData();
      await vi.advanceTimersByTimeAsync(2001);
      listener({ [GLOBAL_KEY]: { newValue: saved.get(GLOBAL_KEY) } }, 'local');
      listener({ [GLOBAL_KEY]: { newValue: saved.get(GLOBAL_KEY) } }, 'local');
      expect(reload).toHaveBeenCalledTimes(2);
    });

    it('ignores other keys and other storage areas', async () => {
      const { folderStore, listener } = await loadedStore();
      const reload = vi.spyOn(folderStore, 'reloadFoldersFromStorage').mockResolvedValue();

      listener({ [`${GLOBAL_KEY}:acct:other`]: {} }, 'local');
      listener({ gvFolderDataAIStudio: {} }, 'local');
      listener({ [GLOBAL_KEY]: {} }, 'sync');
      expect(reload).not.toHaveBeenCalled();
    });

    it('reloads another tab write into memory', async () => {
      const { folderStore, listener } = await loadedStore();
      const fromOtherTab: FolderData = {
        folders: [{ ...beta, name: 'Renamed elsewhere', sortIndex: 0 }],
        folderContents: { 'f-b': [{ ...c222, sortIndex: 0 }] },
      };
      saved.set(GLOBAL_KEY, structuredClone(fromOtherTab));
      onChange.mockClear();

      listener({ [GLOBAL_KEY]: { newValue: fromOtherTab } }, 'local');
      await vi.advanceTimersByTimeAsync(0);

      expect(bytes(folderStore.data)).toBe(bytes(fromOtherTab));
      expect(onChange).toHaveBeenCalledWith('loaded');
      expect(onChange).toHaveBeenCalledWith('title');
    });

    it('re-reads the isolation setting when either isolation switch changes', async () => {
      const { folderStore, listener } = await loadedStore();
      useIsolation(true);

      listener({ gvAccountIsolationEnabledGemini: { newValue: true } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);

      expect(folderStore.accountIsolationEnabled).toBe(true);
      expect(folderStore.storageKey).toBe(SCOPED_KEY);

      useIsolation(false);
      listener({ gvAccountIsolationEnabled: { newValue: false } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      expect(folderStore.accountIsolationEnabled).toBe(false);
      expect(folderStore.storageKey).toBe(GLOBAL_KEY);

      listener({ gvAccountIsolationEnabledAIStudio: { newValue: true } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      expect(accountIsolationService.isIsolationEnabled).toHaveBeenCalledTimes(3);
    });
  });
});
