import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildScopedStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import {
  type MemoryStorage,
  createMemoryStorage,
  settle,
} from '@/features/plugins/builtin/chatgptFolders/__tests__/memoryStorage';
import { CHATGPT_FOLDER_CONFIG } from '@/features/plugins/builtin/chatgptFolders/config';

import { FolderRepository } from '../FolderRepository';
import {
  AISTUDIO_FOLDER_CONFIG,
  GEMINI_FOLDER_CONFIG,
  type PlatformFolderConfig,
} from '../platformFolderConfig';
import { AIStudioFolderStorageAdapter } from '../storage/AIStudioFolderStorageAdapter';
import { LocalStorageFolderAdapter } from '../storage/FolderStorageAdapter';

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

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let repository: FolderRepository;
let enabled: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  memory = createMemoryStorage();
  originalStorage = chrome.storage;
  chrome.storage = memory.api;
  localStorage.clear();
  enabled = true;
});

afterEach(async () => {
  repository?.destroy();
  await settle(30);
  chrome.storage = originalStorage;
  localStorage.clear();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
});

async function ready(
  config: PlatformFolderConfig,
  onRecovery = vi.fn(),
  initial = data('Initial'),
  storageKey = config.storageKey,
) {
  memory.values.local.set(storageKey, initial);
  repository = new FolderRepository(
    config,
    config.platform === 'gemini'
      ? new LocalStorageFolderAdapter()
      : new AIStudioFolderStorageAdapter(),
    {
      onChange: () => {},
      onRecovery,
      onExternalChange: () => {
        if (enabled) void repository.loadData();
      },
      onAccountReleased: () => {},
      isEnabled: () => enabled,
    },
  );
  await repository.init();
  await settle(30);
  expect(repository.canEdit).toBe(true);
}

async function resume() {
  enabled = true;
  await repository.refreshAccountScope();
  await repository.loadData();
  await settle(30);
}

describe.each([
  {
    site: 'Gemini',
    config: GEMINI_FOLDER_CONFIG,
    conversationId: 'gemini:conv:c1',
    url: 'https://gemini.google.com/app/c1',
  },
  {
    site: 'AI Studio',
    config: AISTUDIO_FOLDER_CONFIG,
    conversationId: 'c1',
    url: 'https://aistudio.google.com/prompts/c1',
  },
  {
    site: 'ChatGPT',
    config: CHATGPT_FOLDER_CONFIG,
    conversationId: 'c1',
    url: 'https://chatgpt.com/c/c1',
  },
])('$site repository resumption', ({ config, conversationId, url }) => {
  it('drains accepted active and trailing saves before refreshing the resumed memory', async () => {
    await ready(config);
    const set = memory.api.local.set.bind(memory.api.local);
    const releaseWrites: Array<() => void> = [];
    vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) {
        await new Promise<void>((resolve) => releaseWrites.push(resolve));
      }
      await set(items);
    });

    repository.data = data('Active edit');
    const active = repository.saveData();
    repository.data = data('Trailing edit');
    const trailing = repository.saveData();
    enabled = false;
    repository.suspend();
    expect(repository.canEdit).toBe(false);
    await resume();
    expect(repository.canEdit).toBe(false);
    expect(repository.data).toEqual(data('Trailing edit'));
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Initial'));

    releaseWrites.shift()!();
    await expect(active).resolves.toBe(true);
    await settle(30);
    expect(repository.canEdit).toBe(false);
    expect(repository.data).toEqual(data('Trailing edit'));
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Active edit'));

    releaseWrites.shift()!();
    await expect(trailing).resolves.toBe(true);
    await settle(60);
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(data('Trailing edit'));
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Trailing edit'));
  });

  it.each([0, 5_000])(
    'resumes from the committed active write when the trailing edit fails after %i ms',
    async (delay) => {
      await ready(config);
      const set = memory.api.local.set.bind(memory.api.local);
      const activeWrite = Promise.withResolvers<void>();
      let folderWrites = 0;
      vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
        if (config.storageKey in items) {
          folderWrites += 1;
          if (folderWrites === 1) await activeWrite.promise;
          else throw new Error('Trailing edit failed');
        }
        await set(items);
      });
      repository.data = data('Active edit');
      const active = repository.saveData();
      repository.data = data('Unsaved trailing edit');
      const trailing = repository.saveData();
      enabled = false;
      repository.suspend();
      await resume();
      await vi.advanceTimersByTimeAsync(delay);
      activeWrite.resolve();
      await expect(active).resolves.toBe(true);
      await expect(trailing).resolves.toBe(false);
      await settle(60);
      expect(repository.canEdit).toBe(true);
      expect(repository.data).toEqual(data('Active edit'));
      expect(memory.values.local.get(config.storageKey)).toEqual(data('Active edit'));
    },
  );

  it('persists an accepted debounce when suspension outlasts its timer', async () => {
    await ready(config);
    repository.data.folders[0].isExpanded = false;
    repository.scheduleSaveData();
    enabled = false;
    repository.suspend();
    await settle(30);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(repository.canEdit).toBe(false);
    expect((memory.values.local.get(config.storageKey) as FolderData).folders[0].isExpanded).toBe(
      false,
    );

    await resume();
    expect(repository.canEdit).toBe(true);
    expect(repository.data.folders[0].isExpanded).toBe(false);
    expect(memory.values.local.get(config.storageKey)).toEqual(repository.data);
  });

  it.each([
    { scenario: 'unchanged storage', replacedElsewhere: false, legacyMetadata: false },
    { scenario: 'new external storage', replacedElsewhere: true, legacyMetadata: false },
    {
      scenario: 'unchanged after earlier restore',
      replacedElsewhere: false,
      legacyMetadata: false,
    },
    {
      scenario: 'unchanged storage with legacy metadata',
      replacedElsewhere: false,
      legacyMetadata: true,
    },
  ])(
    'resumes from valid storage after failed trailing edits: $scenario',
    async ({ scenario, replacedElsewhere, legacyMetadata }) => {
      await ready(config);
      const initialData = data(
        scenario.includes('earlier restore') ? 'Earlier restore' : 'Initial',
      );
      const initial = legacyMetadata ? { ...initialData, version: 2 } : initialData;
      if (scenario.includes('earlier restore')) {
        memory.external('local', config.storageKey, initial);
        await settle(30);
      }
      if (legacyMetadata) {
        memory.values.local.set(config.storageKey, initial);
        await repository.loadData();
      }
      const set = memory.api.local.set.bind(memory.api.local);
      let release!: () => void;
      const writeFailure = new Promise<void>((resolve) => {
        release = resolve;
      });
      vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
        if (config.storageKey in items) {
          await writeFailure;
          throw new Error('Accepted write failed after resumption');
        }
        await set(items);
      });

      repository.data = data('Active edit');
      const active = repository.saveData();
      repository.data = data('Unsaved trailing edit');
      const trailing = repository.saveData();
      enabled = false;
      repository.suspend();
      await resume();
      expect(repository.canEdit).toBe(false);
      expect(repository.data).toEqual(data('Unsaved trailing edit'));

      if (replacedElsewhere)
        memory.external('local', config.storageKey, data('Restored elsewhere'));
      release();
      await expect(active).resolves.toBe(false);
      await expect(trailing).resolves.toBe(false);
      await settle(60);
      expect(repository.canEdit).toBe(true);
      expect(repository.data).toEqual(replacedElsewhere ? data('Restored elsewhere') : initial);
      expect(memory.values.local.get(config.storageKey)).toEqual(
        replacedElsewhere ? data('Restored elsewhere') : initial,
      );
    },
  );

  it('does not retain a failed edit over a newer external write during the resume read', async () => {
    const recovery = vi.fn();
    await ready(config, recovery);
    const set = memory.api.local.set.bind(memory.api.local);
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) throw new Error('Folder edit failed');
      await set(items);
    });
    repository.data = data('Failed edit');
    await expect(repository.saveData()).resolves.toBe(false);
    writes.mockRestore();
    enabled = false;
    repository.suspend();

    const get = memory.api.local.get.bind(memory.api.local);
    const staleReads = Promise.withResolvers<void>();
    const freshRead = Promise.withResolvers<void>();
    let bucketReads = 0;
    let failNextRead = false;
    vi.spyOn(memory.api.local, 'get').mockImplementation(async (keys: unknown) => {
      const captured = await get(keys as string);
      if (keys === config.storageKey) {
        bucketReads += 1;
        if (failNextRead) {
          failNextRead = false;
          throw new Error('Resume reconciliation read failed');
        }
        if ((captured[config.storageKey] as FolderData).folders[0].name === 'Initial') {
          await staleReads.promise;
        } else await freshRead.promise;
      }
      return captured;
    });
    enabled = true;
    await repository.refreshAccountScope();
    const loading = repository.loadData();
    await settle(30);
    expect(bucketReads).toBeGreaterThan(0);
    memory.external('local', config.storageKey, data('Restored elsewhere'));
    await settle(30);
    staleReads.resolve();
    await loading;
    await settle(30);
    expect(repository.canEdit).toBe(false);
    await expect(repository.saveData()).resolves.toBe(false);
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Restored elsewhere'));

    failNextRead = true;
    await vi.advanceTimersByTimeAsync(1_000);
    expect(repository.canEdit).toBe(false);
    expect(recovery).toHaveBeenCalledExactlyOnceWith('unreadable');
    await vi.advanceTimersByTimeAsync(2_000);
    freshRead.resolve();
    await settle(60);
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(data('Restored elsewhere'));
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Restored elsewhere'));
  });

  it('a folder restored elsewhere is not deleted again by an earlier failed edit', async () => {
    await ready(config);
    const restored = structuredClone(repository.data);
    const set = memory.api.local.set.bind(memory.api.local);
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) throw new Error('Folder deletion failed');
      await set(items);
    });
    repository.data = { folders: [], folderContents: {} };
    await expect(repository.saveData()).resolves.toBe(false);
    writes.mockRestore();
    enabled = false;
    repository.suspend();

    const get = memory.api.local.get.bind(memory.api.local);
    const staleRead = Promise.withResolvers<void>();
    let holdReads = true;
    vi.spyOn(memory.api.local, 'get').mockImplementation(async (keys: unknown) => {
      const captured = await get(keys as string);
      if (keys === config.storageKey && holdReads) await staleRead.promise;
      return captured;
    });
    enabled = true;
    await repository.refreshAccountScope();
    const loading = repository.loadData();
    await settle(30);
    memory.external('local', config.storageKey, data('Temporary replacement'));
    memory.external('local', config.storageKey, restored);
    await settle(30);
    holdReads = false;
    staleRead.resolve();
    await loading;
    await settle(30);
    expect(repository.canEdit).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(repository.canEdit).toBe(true);
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(restored);
    expect(repository.data).toEqual(restored);
  });

  it.each([
    { symptom: 'missing folder structure', value: { corrupted: true } },
    { symptom: 'removed bucket', value: undefined },
    { symptom: 'null bucket', value: null },
    { symptom: 'false bucket', value: false },
    { symptom: 'empty string bucket', value: '' },
  ])('keeps an unsaved rename after a corrupt external event: $symptom', async ({ value }) => {
    await ready(config);
    const set = memory.api.local.set.bind(memory.api.local);
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) throw new Error('Rename failed');
      await set(items);
    });
    repository.data = data('Mine');
    await expect(repository.saveData()).resolves.toBe(false);
    writes.mockRestore();
    localStorage.removeItem(config.storageKey);
    memory.external('local', config.storageKey, value);
    await settle(60);
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(data('Mine'));
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Mine'));
  });

  it.each([
    { corruption: 'array contents', contents: [] },
    { corruption: 'null contents', contents: null },
    { corruption: 'non-plain contents', contents: new Date(0) },
    { corruption: 'non-array bucket', contents: { folder: { conversationId: 'c1' } } },
    { corruption: 'unlisted empty bucket', contents: { orphan: null } },
    { corruption: 'null reference', contents: { folder: [null] } },
    { corruption: 'array reference', contents: { folder: [[]] } },
  ])(
    'keeps the failed rename and saved conversations when resumed storage has $corruption',
    async ({ contents }) => {
      const initial = data('Initial');
      initial.folderContents.folder = [
        { conversationId, title: 'Saved conversation', url, addedAt: 1, sortIndex: 0 },
      ];
      const recovery = vi.fn();
      await ready(config, recovery, initial);
      const edited = structuredClone(initial);
      edited.folders[0].name = 'Mine';
      const set = memory.api.local.set.bind(memory.api.local);
      const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
        if (config.storageKey in items) throw new Error('Rename failed');
        await set(items);
      });
      repository.data = edited;
      await expect(repository.saveData()).resolves.toBe(false);
      enabled = false;
      repository.suspend();
      memory.external('local', config.storageKey, { ...initial, folderContents: contents });
      await settle(30);
      writes.mockRestore();
      await resume();
      expect(repository.canEdit).toBe(true);
      expect(recovery).toHaveBeenCalledWith('kept');
      expect(repository.data).toEqual(edited);
      await expect(repository.saveData()).resolves.toBe(true);
      expect(memory.values.local.get(config.storageKey)).toEqual(edited);
    },
  );

  it.each([null, false, 0, ''])(
    "keeps a sibling folder's conversations when another folder's bucket is %j",
    async (emptyBucket) => {
      let storageKey = config.storageKey;
      if (config.platform === 'gemini') {
        memory.values.sync.set(StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI, true);
        storageKey = buildScopedStorageKey(config.storageKey, 'default');
      }
      const recovery = vi.fn();
      await ready(config, recovery, data('Old backup'), storageKey);
      expect(repository.storageKey).toBe(storageKey);
      enabled = false;
      repository.suspend();
      const folders = [
        { ...data('Empty').folders[0], id: 'empty' },
        { ...data('New').folders[0], id: 'new', sortIndex: 1 },
      ];
      const references = [{ conversationId, title: '', url, addedAt: 1, sortIndex: 0 }];
      memory.external('local', storageKey, {
        folders,
        folderContents: { empty: emptyBucket, new: references },
      });
      await settle(30);
      await resume();
      expect(repository.canEdit).toBe(true);
      expect(recovery).not.toHaveBeenCalled();
      expect(repository.data).toMatchObject({ folders, folderContents: { new: references } });
      await expect(repository.saveData()).resolves.toBe(true);
      expect(memory.values.local.get(storageKey)).toMatchObject({
        folders,
        folderContents: { new: references },
      });
    },
  );

  it('loads and saves legacy records with empty titles and missing optional metadata', async () => {
    const legacy: FolderData = {
      folders: [
        {
          id: 'folder',
          name: 'Legacy',
          parentId: null,
          isExpanded: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'empty',
          name: 'Empty',
          parentId: null,
          isExpanded: false,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      folderContents: {
        folder: [{ conversationId, title: '', url, addedAt: 1 }],
        [config.rootBucketId]: [{ conversationId: 'root', title: '', url, addedAt: 2 }],
      },
    };
    const recovery = vi.fn();
    await ready(config, recovery, legacy);
    enabled = false;
    repository.suspend();
    await resume();
    expect(repository.canEdit).toBe(true);
    expect(recovery).not.toHaveBeenCalled();
    expect(repository.data).toMatchObject(legacy);
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(repository.data);
    expect(memory.values.local.get(config.storageKey)).toMatchObject(legacy);
  });

  it('a restored folder survives resume while an earlier committed write is still settling', async () => {
    await ready(config);
    const restored = data('Restored folder');
    const set = memory.api.local.set.bind(memory.api.local);
    const committed = Promise.withResolvers<void>();
    const settlement = Promise.withResolvers<void>();
    let folderWrites = 0;
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) {
        folderWrites += 1;
        if (folderWrites > 1) throw new Error('Queued deletion failed');
        await set(items);
        committed.resolve();
        await settlement.promise;
        return;
      }
      await set(items);
    });
    repository.data = restored;
    const active = repository.saveData();
    await committed.promise;
    memory.external('local', config.storageKey, data('Temporary replacement'));
    await settle(30);
    repository.data = { folders: [], folderContents: {} };
    const trailing = repository.saveData();
    enabled = false;
    repository.suspend();
    await resume();
    memory.external('local', config.storageKey, restored);
    await settle(30);
    settlement.resolve();
    await expect(active).resolves.toBe(true);
    await expect(trailing).resolves.toBe(false);
    await settle(60);
    writes.mockRestore();
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(restored);
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(restored);
  });

  it('a valid restored conversation with an empty title survives a failed rename on resume', async () => {
    await ready(config);
    const set = memory.api.local.set.bind(memory.api.local);
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) throw new Error('Rename failed');
      await set(items);
    });
    repository.data = data('Mine');
    await expect(repository.saveData()).resolves.toBe(false);
    enabled = false;
    repository.suspend();
    const restored = data('Imported');
    restored.folderContents.folder = [
      {
        conversationId: 'untitled',
        title: '',
        url: 'https://aistudio.google.com/prompts/untitled',
        addedAt: 1,
        sortIndex: 0,
      },
    ];
    memory.external('local', config.storageKey, restored);
    await settle(30);
    writes.mockRestore();
    await resume();
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(restored);
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(restored);
  });

  it('an unreadable resume keeps the failed rename until valid storage can be read', async () => {
    await ready(config);
    const set = memory.api.local.set.bind(memory.api.local);
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) throw new Error('Rename failed');
      await set(items);
    });
    repository.data = data('Mine');
    await expect(repository.saveData()).resolves.toBe(false);
    writes.mockRestore();
    enabled = false;
    repository.suspend();
    const reads = vi.spyOn(memory.api.local, 'get').mockRejectedValue(new Error('Unreadable'));
    await resume();
    expect(repository.canEdit).toBe(false);
    expect(repository.data).toEqual(data('Mine'));
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Initial'));
    reads.mockRestore();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(data('Initial'));
  });

  it('backs off superseded resume reads until writes stop, then enables editing', async () => {
    await ready(config);
    enabled = false;
    repository.suspend();
    const get = memory.api.local.get.bind(memory.api.local);
    let bucketReads = 0;
    let writesArriving = true;
    vi.spyOn(memory.api.local, 'get').mockImplementation(async (keys: unknown) => {
      const captured = await get(keys as string);
      if (keys === config.storageKey) {
        bucketReads += 1;
        if (writesArriving) {
          memory.external('local', config.storageKey, data(`External ${bucketReads}`));
          await settle(10);
        }
      }
      return captured;
    });
    await resume();
    expect(repository.canEdit).toBe(false);
    const initialReads = bucketReads;
    await settle(100);
    expect(bucketReads).toBe(initialReads);
    await vi.advanceTimersByTimeAsync(7_000);
    expect(bucketReads).toBe(initialReads + 3);
    expect(repository.canEdit).toBe(false);
    writesArriving = false;
    await vi.advanceTimersByTimeAsync(8_000);
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(data(`External ${bucketReads - 1}`));
  });

  it.each([
    { edit: 'rename', externalChange: false },
    { edit: 'last-folder deletion', externalChange: false },
    { edit: 'rename', externalChange: true },
    { edit: 'last-folder deletion', externalChange: true },
  ])(
    'recovers corrupt storage after a failed $edit, with observed external change: $externalChange',
    async ({ edit, externalChange }) => {
      await ready(config);
      const edited =
        edit === 'rename' ? data('Unsaved rename') : { folders: [], folderContents: {} };
      const set = memory.api.local.set.bind(memory.api.local);
      let failFolderWrites = true;
      vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
        if (config.storageKey in items && failFolderWrites) throw new Error('Folder write failed');
        await set(items);
      });
      repository.data = edited;
      await expect(repository.saveData()).resolves.toBe(false);
      expect(repository.data).toEqual(edited);
      expect(memory.values.local.get(config.storageKey)).toEqual(data('Initial'));
      enabled = false;
      repository.suspend();
      failFolderWrites = false;
      if (externalChange) memory.external('local', config.storageKey, { corrupted: true });
      else memory.values.local.set(config.storageKey, { corrupted: true });
      await settle(30);
      expect(repository.canEdit).toBe(false);

      await resume();
      expect(repository.canEdit).toBe(true);
      const recovered = edited;
      expect(repository.data).toEqual(recovered);
      expect(memory.values.local.get(config.storageKey)).toEqual(recovered);
    },
  );
});
