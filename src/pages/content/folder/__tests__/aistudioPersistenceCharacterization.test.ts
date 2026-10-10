/**
 * Characterization of AI Studio folder persistence before it moves onto the
 * shared FolderRepository. It pins, through the manager's persistence surface,
 * DOM and storage, what reaches chrome.storage, the recovery slots and the
 * screen: AI Studio never normalizes or prunes, keeps `__uncategorized__`,
 * copies the legacy bucket raw and recovers a missing key from backups.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type AccountScope,
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { DataBackupService } from '@/core/services/DataBackupService';
import { StorageKeys } from '@/core/types/common';
import { validateFolderData } from '@/features/folder/model/folderData';
import { toastDriver } from '@/tests/toastDriver';

import { AIStudioFolderManager } from '../aistudio';
import { migrateAIStudioLegacySync } from '../aistudioImport';
import { cls } from '../floatingTree/shared';
import type { ConversationReference, FolderData } from '../types';
import { ROOT, nameInput, tree, treeRoot, treeText } from './aistudioTreeDriver';

const { mockBrowser } = vi.hoisted(() => ({
  mockBrowser: {
    runtime: {
      id: 'test-extension-id',
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      sendMessage: vi.fn(),
    },
    storage: {
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
      local: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
      sync: { get: vi.fn(), set: vi.fn(), remove: vi.fn() },
    },
  },
}));

vi.mock('webextension-polyfill', () => ({ default: mockBrowser }));

type Manager = {
  data: FolderData;
  accountScope: AccountScope | null;
  activeStorageKey: string;
  handleAccountIsolationToggle(enabled: boolean): Promise<void>;
  refreshScopedDataOnAccountContextChange(): Promise<void>;
  load(): Promise<void>;
  save(): Promise<boolean>;
  destroy(): void;
};

type StorageListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

const GLOBAL_KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
const MIGRATION_MARKER = `${GLOBAL_KEY}:legacySyncImported`;
let local: Record<string, unknown>;
let sync: Record<string, unknown>;
const managers: Manager[] = [];

function pick(values: Record<string, unknown>, keys: unknown): Record<string, unknown> {
  if (typeof keys === 'string') return structuredClone({ [keys]: values[keys] });
  if (Array.isArray(keys)) {
    return structuredClone(Object.fromEntries(keys.map((key) => [key, values[key]])));
  }
  if (keys && typeof keys === 'object') {
    return structuredClone(
      Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [key, values[key] ?? fallback]),
      ),
    );
  }
  return structuredClone(values);
}

function prompt(id: string, extra: Partial<ConversationReference> & Record<string, unknown> = {}) {
  return {
    conversationId: id,
    title: `Prompt ${id}`,
    url: `https://aistudio.google.com/prompts/${id}`,
    addedAt: 100,
    ...extra,
  };
}

/** Real-shaped AI Studio data: no sortIndex anywhere, createdAt order differs from name order. */
function fixture(): FolderData & { version: number } {
  return structuredClone({
    folders: [
      {
        id: 'f-late',
        name: 'Alpha late',
        parentId: null,
        isExpanded: true,
        createdAt: 30,
        updatedAt: 30,
      },
      {
        id: 'f-early',
        name: 'Zulu early',
        parentId: null,
        isExpanded: true,
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: 'f-child',
        name: 'Child',
        parentId: 'f-early',
        isExpanded: true,
        createdAt: 20,
        updatedAt: 20,
      },
      // No folderContents entry at all.
      {
        id: 'f-nokey',
        name: 'Middle no key',
        parentId: null,
        isExpanded: true,
        createdAt: 40,
        updatedAt: 40,
      },
    ],
    folderContents: {
      'f-late': [prompt('p1'), prompt('p2', { addedAt: 300 }), prompt('p1')],
      'f-early': [],
      'f-child': [prompt('p3', { starred: true, importedExtra: 'kept' })],
      __uncategorized__: [prompt('p4'), prompt('p5', { url: '/prompts/p5' })],
      'ghost-folder': [prompt('p6')],
    },
    version: 2,
  });
}

/** What the old save path writes: cloneFolderData drops the extra top-level key only. */
function expectedWrite(source: FolderData = fixture()): FolderData {
  return { folders: source.folders, folderContents: source.folderContents };
}

function bytes(value: unknown): string {
  return JSON.stringify(value);
}

function folderData(name: string): FolderData {
  return {
    folders: [{ id: name, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { [name]: [] },
  };
}

async function scopedKey(account: string): Promise<string> {
  const scope = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: `${account}@example.com`,
  });
  return buildScopedStorageKey(GLOBAL_KEY, scope.accountKey);
}

async function scopedBackupNamespace(account: string): Promise<string> {
  const scope = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: `${account}@example.com`,
  });
  return buildScopedStorageKey('aistudio-folders', scope.accountKey);
}

function selectAccount(account: string): void {
  const indicator = document.querySelector('.account-switcher-text')!;
  indicator.setAttribute('data-email', `${account}@example.com`);
  indicator.textContent = `${account}@example.com`;
}

function useIsolation(enabled: boolean): void {
  sync[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] = enabled;
}

async function mount(): Promise<Manager> {
  const instance = new AIStudioFolderManager();
  const manager = instance as unknown as Manager;
  managers.push(manager);
  await instance.init();
  return manager;
}

function emitStorageChange(changes: Record<string, { newValue?: unknown }>, area: string): void {
  for (const [listener] of mockBrowser.storage.onChanged.addListener.mock.calls) {
    (listener as StorageListener)(changes, area);
  }
}

function folderWrites(key: string): unknown[] {
  return mockBrowser.storage.local.set.mock.calls
    .map(([values]) => (values as Record<string, unknown>)[key])
    .filter((value) => value !== undefined);
}

function rootFolderOrder(): string[] {
  return Array.from(
    treeRoot().querySelectorAll<HTMLElement>(`.${cls('folder')}[data-depth="0"]`),
    (item) => item.querySelector<HTMLElement>(`.${cls('folder-header')}`)?.dataset.folderId ?? '',
  );
}

function notificationText(): string {
  return toastDriver.messages().join('\n');
}

function backupSlot(namespace: string, slot: 'primary' | 'emergency'): FolderData | null {
  const raw = localStorage.getItem(`gvBackup_${namespace}_${slot}`);
  return raw ? (JSON.parse(raw).data as FolderData) : null;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  document.body.innerHTML = `
    <span class="account-switcher-text" data-email="a@example.com">a@example.com</span>
    <div class="nav-content v3-left-nav"><nav><div class="empty-space"></div></nav></div>`;
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url: 'https://aistudio.google.com/' });
  local = {};
  sync = {
    [StorageKeys.LANGUAGE]: 'en',
    [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: false,
    geminiFolderEnabled: true,
  };
  mockBrowser.storage.local.get.mockImplementation(async (keys: unknown) => pick(local, keys));
  mockBrowser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(local, structuredClone(values));
  });
  mockBrowser.storage.sync.get.mockImplementation(async (keys: unknown) => pick(sync, keys));
  mockBrowser.storage.sync.set.mockImplementation(async (values: Record<string, unknown>) => {
    Object.assign(sync, structuredClone(values));
  });
  mockBrowser.storage.sync.remove.mockImplementation(async (keys: string | string[]) => {
    for (const key of typeof keys === 'string' ? [keys] : keys) delete sync[key];
  });
  chrome.storage.local.get = mockBrowser.storage.local.get as typeof chrome.storage.local.get;
  chrome.storage.local.set = mockBrowser.storage.local.set as typeof chrome.storage.local.set;
  chrome.storage.sync.get = mockBrowser.storage.sync.get as typeof chrome.storage.sync.get;
  chrome.storage.sync.set = mockBrowser.storage.sync.set as typeof chrome.storage.sync.set;
  chrome.storage.sync.remove = mockBrowser.storage.sync.remove as typeof chrome.storage.sync.remove;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const manager of managers.splice(0)) manager.destroy();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe('AI Studio persistence characterization', () => {
  describe('global bucket', () => {
    it('loads stored data raw, without normalizing, pruning or writing back', async () => {
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();

      expect(manager.activeStorageKey).toBe(GLOBAL_KEY);
      expect(bytes(manager.data)).toBe(bytes(fixture()));
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
      // Root folders render by createdAt, not by name or sortIndex.
      expect(rootFolderOrder()).toEqual(['f-early', 'f-late', 'f-nokey']);
      // The duplicate reference stays visible; root conversations live in __uncategorized__.
      expect(tree.conversationIds('f-late')).toHaveLength(3);
      expect(tree.conversationIds(ROOT)).toEqual(['p4', 'p5']);
      expect(bytes(backupSlot('aistudio-folders', 'primary'))).toBe(bytes(fixture()));
      // Folder data never lands in page localStorage.
      expect(localStorage.getItem(GLOBAL_KEY)).toBeNull();
    });

    it('saves exactly the loaded content, keeping orphan, root and duplicate buckets', async () => {
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();

      await expect(manager.save()).resolves.toBe(true);

      expect(folderWrites(GLOBAL_KEY).map(bytes)).toEqual([bytes(expectedWrite())]);
      expect(bytes(local[GLOBAL_KEY])).toBe(bytes(expectedWrite()));
      expect(bytes(backupSlot('aistudio-folders', 'primary'))).toBe(bytes(expectedWrite()));
      expect(bytes(backupSlot('aistudio-folders', 'emergency'))).toBe(bytes(expectedWrite()));
      expect(localStorage.getItem(GLOBAL_KEY)).toBeNull();
    });

    it.each([
      { language: 'zh', message: '无法保存文件夹更改，请重试。' },
      { language: 'ja', message: 'フォルダの変更を保存できませんでした。もう一度お試しください。' },
    ])(
      'a failed folder save shows a visible notice in $language',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        local[GLOBAL_KEY] = folderData('Kept');
        await mount();
        mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));

        document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
        const input = nameInput()!;
        input.value = 'Unsaved folder';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await vi.advanceTimersByTimeAsync(0);

        expect(toastDriver.all()).toMatchObject([{ message, tone: 'error' }]);
      },
    );

    it('reports a failed write once without retrying it', async () => {
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();
      const writesBefore = mockBrowser.storage.local.set.mock.calls.length;
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));

      await expect(manager.save()).resolves.toBe(false);

      expect(mockBrowser.storage.local.set.mock.calls.length - writesBefore).toBe(1);
      expect(notificationText()).toContain('Could not save folder changes');
      expect(bytes(local[GLOBAL_KEY])).toBe(bytes(fixture()));
    });
  });

  describe('sync to local migration', () => {
    it('keeps deleted legacy folders and prompts deleted after re-init', async () => {
      sync[GLOBAL_KEY] = fixture();
      const manager = await mount();
      expect(tree.isRendered('f-child')).toBe(true);
      expect(tree.conversationIds('f-late')).toContain('p2');

      tree.requestFolderDeletion('f-child');
      tree.answer(true);
      await vi.advanceTimersByTimeAsync(0);
      tree.requestRemoval('f-late', 'p2');
      tree.answer(true);
      await vi.advanceTimersByTimeAsync(0);
      const deleted = structuredClone(local[GLOBAL_KEY]) as FolderData;
      expect(deleted.folders.some(({ id }) => id === 'f-child')).toBe(false);
      expect(
        deleted.folderContents['f-late'].map(({ conversationId }) => conversationId),
      ).not.toContain('p2');
      manager.destroy();

      const reloaded = await mount();
      expect(reloaded.data).toEqual(deleted);
      expect(tree.isRendered('f-child')).toBe(false);
      expect(tree.conversationIds('f-late')).not.toContain('p2');
      expect(sync[GLOBAL_KEY]).toEqual(fixture());

      reloaded.destroy();
      useIsolation(true);
      selectAccount('b');
      const scoped = await mount();
      expect(scoped.activeStorageKey).toBe(await scopedKey('b'));
      expect(scoped.data).toEqual(deleted);
      expect(local[GLOBAL_KEY]).toEqual(deleted);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('copies sync data into an empty local bucket as is', async () => {
      sync[GLOBAL_KEY] = fixture();
      const manager = await mount();

      expect(bytes(folderWrites(GLOBAL_KEY)[0])).toBe(bytes(fixture()));
      expect(bytes(manager.data)).toBe(bytes(fixture()));
    });

    it('keeps valid local data authoritative and preserves legacy-only items in sync', async () => {
      local[GLOBAL_KEY] = {
        folders: [folderData('Local').folders[0]],
        folderContents: { Local: [prompt('l1')], shared: [prompt('s1')] },
      };
      sync[GLOBAL_KEY] = {
        folders: [folderData('Local').folders[0], folderData('Synced').folders[0]],
        folderContents: { Synced: [prompt('y1')], shared: [prompt('s1'), prompt('s2')] },
      };
      const localBefore = bytes(local[GLOBAL_KEY]);
      const syncBefore = bytes(sync[GLOBAL_KEY]);
      const manager = await mount();

      expect(bytes(manager.data)).toBe(localBefore);
      expect(bytes(local[GLOBAL_KEY])).toBe(localBefore);
      expect(bytes(sync[GLOBAL_KEY])).toBe(syncBefore);
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(mockBrowser.storage.sync.set).not.toHaveBeenCalled();
    });

    it('replaces a local bucket with null contents by the legacy copy before marking it', async () => {
      local[GLOBAL_KEY] = { folders: [], folderContents: null };
      sync[GLOBAL_KEY] = fixture();

      await migrateAIStudioLegacySync(GLOBAL_KEY);

      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
      const writtenKeys = mockBrowser.storage.local.set.mock.calls.map(([values]) =>
        Object.keys(values as Record<string, unknown>),
      );
      expect(writtenKeys).toEqual([[GLOBAL_KEY], [MIGRATION_MARKER]]);
    });

    it('treats a valid empty local bucket as an intentional deletion', async () => {
      const empty = { folders: [], folderContents: {} };
      local[GLOBAL_KEY] = empty;
      sync[GLOBAL_KEY] = fixture();
      const manager = await mount();

      expect(manager.data).toEqual(empty);
      expect(local[GLOBAL_KEY]).toEqual(empty);
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('records completion only after the legacy copy has been accepted', async () => {
      sync[GLOBAL_KEY] = fixture();
      let accept!: () => void;
      const accepted = new Promise<void>((resolve) => {
        accept = resolve;
      });
      let started!: () => void;
      const saving = new Promise<void>((resolve) => {
        started = resolve;
      });
      mockBrowser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => {
        if (values[GLOBAL_KEY]) {
          started();
          await accepted;
        }
        Object.assign(local, structuredClone(values));
      });
      const migration = migrateAIStudioLegacySync(GLOBAL_KEY);
      await saving;
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();

      accept();
      await migration;
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('retries a failed legacy data save without marking or touching sync', async () => {
      sync[GLOBAL_KEY] = fixture();
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));

      await expect(migrateAIStudioLegacySync(GLOBAL_KEY)).rejects.toThrow('quota');
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      expect(sync[GLOBAL_KEY]).toEqual(fixture());

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
    });

    it('keeps edits after the copy succeeds but the marker save fails', async () => {
      sync[GLOBAL_KEY] = fixture();
      mockBrowser.storage.local.set
        .mockImplementationOnce(async (values: Record<string, unknown>) => {
          Object.assign(local, structuredClone(values));
        })
        .mockRejectedValueOnce(new Error('marker quota'));
      await expect(migrateAIStudioLegacySync(GLOBAL_KEY)).rejects.toThrow('marker quota');
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      const edited = folderData('After interrupted migration');
      local[GLOBAL_KEY] = edited;

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(edited);
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('keeps the completion marker durable when local data is later missing', async () => {
      sync[GLOBAL_KEY] = fixture();
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      delete local[GLOBAL_KEY];
      localStorage.clear();

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('records completion independently for each target key without rewriting /u/ routes', async () => {
      const key = await scopedKey('a');
      local[GLOBAL_KEY] = folderData('Global');
      const legacy = fixture();
      legacy.folderContents['f-late'][0].url = 'https://aistudio.google.com/u/2/prompts/p1';
      sync[key] = legacy;
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      await migrateAIStudioLegacySync(key);
      expect(local[GLOBAL_KEY]).toEqual(folderData('Global'));
      expect(local[key]).toEqual(legacy);

      delete local[key];
      await migrateAIStudioLegacySync(key);
      expect(local[key]).toBeUndefined();
      expect(sync[key]).toEqual(legacy);
    });

    it('does not write data or a marker after a failed local read', async () => {
      sync[GLOBAL_KEY] = fixture();
      mockBrowser.storage.local.get.mockRejectedValueOnce(new Error('read unavailable'));
      await expect(migrateAIStudioLegacySync(GLOBAL_KEY)).rejects.toThrow('read unavailable');
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
    });

    it('leaves an invalid legacy source unmarked so a later valid source can be imported', async () => {
      sync[GLOBAL_KEY] = { folders: 'corrupt', folderContents: {} };
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      expect(sync[GLOBAL_KEY]).toEqual({ folders: 'corrupt', folderContents: {} });

      sync[GLOBAL_KEY] = fixture();
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
    });

    it('preserves an own __proto__ legacy bucket through the raw copy', async () => {
      const legacy = JSON.parse(
        JSON.stringify(folderData('PROTO')).replaceAll('PROTO', '__proto__'),
      ) as FolderData;
      legacy.folderContents['__proto__'] = [prompt('p1')];
      sync[GLOBAL_KEY] = legacy;
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      const copied = local[GLOBAL_KEY] as FolderData;

      expect(copied).toEqual(legacy);
      expect(Object.getPrototypeOf(copied.folderContents)).toBe(Object.prototype);
      expect(Object.hasOwn(copied.folderContents, '__proto__')).toBe(true);
      expect(copied.folderContents['__proto__']).toEqual([prompt('p1')]);
    });

    it('keeps a save from another tab while the legacy source read is pending', async () => {
      let finish!: (value: Record<string, unknown>) => void;
      const pending = new Promise<Record<string, unknown>>((resolve) => {
        finish = resolve;
      });
      mockBrowser.storage.sync.get.mockReturnValueOnce(pending);
      const migration = migrateAIStudioLegacySync(GLOBAL_KEY);
      await Promise.resolve();
      local[GLOBAL_KEY] = folderData('Saved by another tab');
      finish({ [GLOBAL_KEY]: fixture() });
      await migration;

      expect(local[GLOBAL_KEY]).toEqual(folderData('Saved by another tab'));
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
    });

    it('serializes overlapping first imports with the native per-key lock', async () => {
      // Implement Web Locks mutual exclusion, while keeping the real storage migration.
      let queue = Promise.resolve();
      vi.stubGlobal('navigator', {
        locks: {
          request: (_key: string, operation: () => Promise<void>) => {
            const result = queue.then(operation);
            queue = result.catch(() => {});
            return result;
          },
        },
      });
      sync[GLOBAL_KEY] = fixture();

      await Promise.all([
        migrateAIStudioLegacySync(GLOBAL_KEY),
        migrateAIStudioLegacySync(GLOBAL_KEY),
      ]);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(folderWrites(GLOBAL_KEY)).toHaveLength(1);
    });
  });

  describe('recovery', () => {
    function seedPrimaryBackup(namespace: string, data: FolderData): void {
      new DataBackupService<FolderData>(namespace, validateFolderData).createPrimaryBackup(data);
    }

    it.each([
      { language: 'en', message: 'Folder data recovered from backup.' },
      { language: 'zh', message: '已从备份恢复文件夹数据。' },
    ])(
      'restores a missing bucket with a translated notice in $language',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        seedPrimaryBackup('aistudio-folders', expectedWrite());
        const manager = await mount();

        expect(bytes(manager.data)).toBe(bytes(expectedWrite()));
        expect(toastDriver.find(message)?.tone).toBe('warning');
        await vi.advanceTimersByTimeAsync(6999);
        expect(notificationText()).toContain(message);
        await vi.advanceTimersByTimeAsync(1);
        expect(toastDriver.find(message)).toBeUndefined();
        expect(folderWrites(GLOBAL_KEY).map(bytes)).toEqual([bytes(expectedWrite())]);
      },
    );

    it.each([
      {
        language: 'en',
        message:
          '⚠️ Warning: Failed to load folder data. Your folders may have been corrupted. Please check the browser console for details and try restoring from backup if available.',
      },
      {
        language: 'zh',
        message:
          '⚠️ 警告：无法加载文件夹数据。您的文件夹可能已损坏。请检查浏览器控制台以获取详细信息，并在可用时尝试从备份恢复。',
      },
    ])(
      'starts empty with a translated warning in $language when corrupt storage has no backup',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        local[GLOBAL_KEY] = { folders: 'corrupt', folderContents: {} };
        const manager = await mount();

        expect(manager.data).toEqual({ folders: [], folderContents: {} });
        expect(toastDriver.find(message)?.tone).toBe('error');
        await vi.advanceTimersByTimeAsync(4999);
        expect(notificationText()).toContain(message);
        await vi.advanceTimersByTimeAsync(1);
        expect(toastDriver.find(message)).toBeUndefined();
        expect(folderWrites(GLOBAL_KEY)).toEqual([]);
        expect(document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')?.disabled).toBe(
          false,
        );
      },
    );

    it.each([
      { language: 'en', message: 'Could not load folder data. Folders are read-only for now.' },
      { language: 'zh', message: '无法加载文件夹数据，暂时只能查看，无法编辑。' },
    ])(
      'shows a translated read-only notice in $language when a reload fails',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        local[GLOBAL_KEY] = fixture();
        const manager = await mount();
        localStorage.clear();
        mockBrowser.storage.local.get.mockRejectedValueOnce(new Error('storage unavailable'));

        await manager.load();

        expect(bytes(manager.data)).toBe(bytes(fixture()));
        expect(toastDriver.find(message)?.tone).toBe('error');
        expect(document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')?.disabled).toBe(
          true,
        );
        expect(folderWrites(GLOBAL_KEY)).toEqual([]);
      },
    );
  });

  it('keeps a failed edit with a Chinese recovery notice when storage is corrupt', async () => {
    sync[StorageKeys.LANGUAGE] = 'zh';
    local[GLOBAL_KEY] = fixture();
    const manager = await mount();
    manager.data.folders[0].name = 'Unsaved edit';
    mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));
    expect(await manager.save()).toBe(false);
    local[GLOBAL_KEY] = { folders: 'corrupt', folderContents: {} };

    await manager.load();

    expect(manager.data.folders[0].name).toBe('Unsaved edit');
    expect(toastDriver.find('无法加载文件夹数据，已保留当前文件夹。')?.tone).toBe('error');
    expect((local[GLOBAL_KEY] as FolderData).folders[0].name).toBe('Unsaved edit');
  });

  describe('account scope', () => {
    it('copies the whole legacy bucket into a new account bucket and leaves it in place', async () => {
      useIsolation(true);
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();
      const key = await scopedKey('a');

      expect(manager.activeStorageKey).toBe(key);
      expect(folderWrites(key).map(bytes)).toEqual([bytes(expectedWrite())]);
      expect(bytes(local[GLOBAL_KEY])).toBe(bytes(fixture()));
      expect(bytes(manager.data)).toBe(bytes(expectedWrite()));
      expect(bytes(backupSlot(await scopedBackupNamespace('a'), 'primary'))).toBe(
        bytes(expectedWrite()),
      );
      expect(backupSlot('aistudio-folders', 'primary')).toBeNull();
    });

    it('rebinds only when the account fingerprint changes', async () => {
      useIsolation(true);
      const privateA = folderData('Private a');
      privateA.folderContents['Private a'] = [prompt('p1')];
      local[await scopedKey('a')] = privateA;
      local[await scopedKey('b')] = folderData('Private b');
      const manager = await mount();
      tree.requestRemoval('Private a', 'p1');

      await vi.advanceTimersByTimeAsync(2500);
      expect(tree.pendingQuestion()).not.toBeNull();
      expect(treeText()).toContain('Private a');

      selectAccount('b');
      await vi.advanceTimersByTimeAsync(1200);
      expect(tree.pendingQuestion()).toBeNull();
      expect(manager.activeStorageKey).toBe(await scopedKey('b'));
      expect(treeText()).toContain('Private b');
    });

    it('binds through the next poll after a failed scope resolution', async () => {
      useIsolation(true);
      local[await scopedKey('a')] = folderData('Private a');
      const resolve = accountIsolationService.resolveAccountScope.bind(accountIsolationService);
      vi.spyOn(accountIsolationService, 'resolveAccountScope')
        .mockRejectedValueOnce(new Error('background not listening'))
        .mockImplementation(resolve);
      const manager = await mount();

      expect(manager.data).toEqual({ folders: [], folderContents: {} });
      expect(folderWrites(await scopedKey('a'))).toEqual([]);

      await vi.advanceTimersByTimeAsync(1200);
      expect(manager.activeStorageKey).toBe(await scopedKey('a'));
      expect(treeText()).toContain('Private a');
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
    });
  });

  describe('feature toggle', () => {
    it('can edit and save again after the folder feature is disabled and re-enabled', async () => {
      local[GLOBAL_KEY] = folderData('Kept');
      await mount();

      emitStorageChange({ geminiFolderEnabled: { newValue: false } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('.gv-aistudio-folder-tree')).toBeNull();

      emitStorageChange({ geminiFolderEnabled: { newValue: true } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      expect(treeText()).toContain('Kept');

      document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
      const input = nameInput()!;
      input.value = 'After re-enable';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);

      expect((local[GLOBAL_KEY] as FolderData).folders.map((folder) => folder.name)).toContain(
        'After re-enable',
      );
      expect(localStorage.getItem(GLOBAL_KEY)).toBeNull();
    });

    it('still reports a failed save after the folder feature is turned off and on', async () => {
      local[GLOBAL_KEY] = folderData('Kept');
      const manager = await mount();
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));
      await manager.save();
      expect(toastDriver.find('Could not save folder changes')?.tone).toBe('error');

      emitStorageChange({ geminiFolderEnabled: { newValue: false } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      // Turning the feature off takes its notices with it.
      expect(toastDriver.all()).toEqual([]);

      emitStorageChange({ geminiFolderEnabled: { newValue: true } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));
      await manager.save();
      expect(toastDriver.messages()).toEqual(['Could not save folder changes. Please try again.']);
    });
  });
});
