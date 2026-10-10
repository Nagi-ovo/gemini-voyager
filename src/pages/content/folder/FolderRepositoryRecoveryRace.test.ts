import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataBackupService } from '@/core/services/DataBackupService';
import { validateFolderData } from '@/features/folder/model/folderData';
import { CHATGPT_FOLDER_CONFIG } from '@/features/plugins/builtin/chatgptFolders/config';

import { FolderRepository } from './FolderRepository';
import {
  AISTUDIO_FOLDER_CONFIG,
  GEMINI_FOLDER_CONFIG,
  type PlatformFolderConfig,
} from './platformFolderConfig';
import { AIStudioFolderStorageAdapter } from './storage/AIStudioFolderStorageAdapter';
import { LocalStorageFolderAdapter } from './storage/FolderStorageAdapter';
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
function folder(name: string): FolderData {
  return {
    folders: [{ id: 'f', name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { f: [] },
  };
}

let originalStorage: typeof chrome.storage;
let stored: Record<string, unknown>;
let listeners: Set<Listener>;
let repository: FolderRepository | undefined;
const get = vi.fn<(keys: string | string[]) => Promise<Record<string, unknown>>>();
const set = vi.fn<(items: Record<string, unknown>) => Promise<void>>();
const recovery = vi.fn();
function read(keys: string | string[]) {
  return structuredClone(
    Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map((key) => [key, stored[key]])),
  );
}
function emit(key: string, value: unknown) {
  stored[key] = structuredClone(value);
  for (const listener of listeners)
    listener({ [key]: { newValue: structuredClone(value) } }, 'local');
}
function create(config: PlatformFolderConfig): FolderRepository {
  repository = new FolderRepository(
    config,
    config === GEMINI_FOLDER_CONFIG
      ? new LocalStorageFolderAdapter()
      : new AIStudioFolderStorageAdapter(),
    {
      onChange: () => {},
      onAccountReleased: () => {},
      onRecovery: recovery,
      isEnabled: () => true,
      onExternalChange: () => void repository?.loadData(),
    },
  );
  return repository;
}

beforeEach(() => {
  vi.useFakeTimers();
  originalStorage = chrome.storage;
  stored = {};
  listeners = new Set();
  recovery.mockReset();
  get.mockReset().mockImplementation(async (keys) => read(keys));
  set.mockReset().mockImplementation(async (items) => {
    for (const [key, value] of Object.entries(items)) emit(key, value);
  });
  chrome.storage = {
    local: { get, set, remove: vi.fn(async () => {}) },
    sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
    onChanged: {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
    },
  } as unknown as typeof chrome.storage;
  localStorage.clear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  repository?.destroy();
  repository = undefined;
  chrome.storage = originalStorage;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe.each([GEMINI_FOLDER_CONFIG, AISTUDIO_FOLDER_CONFIG, CHATGPT_FOLDER_CONFIG])(
  'recovery freshness for $storageKey',
  (config) => {
    it.each(config.recoverMissingData ? ['corrupt', 'missing'] : ['corrupt'])(
      'ordinary-load recovery does not overwrite a newer external folder write when primary data is %s',
      async (primary) => {
        await new DataBackupService<FolderData>(
          config.backupNamespace,
          validateFolderData,
        ).createPrimaryBackup(folder('Older backup'));
        if (primary === 'corrupt') stored[config.storageKey] = { folders: [], folderContents: [] };
        const hydrationStarted = deferred<void>();
        const hydration = deferred<Record<string, unknown>>();
        get.mockImplementation(async (keys) => {
          if (Array.isArray(keys) && keys.some((key) => key.startsWith('gvBackup_'))) {
            hydrationStarted.resolve();
            return hydration.promise;
          }
          return read(keys);
        });
        const repo = create(config);
        const loading = repo.init();
        await hydrationStarted.promise;
        const newer = folder('Saved elsewhere');
        emit(config.storageKey, newer);
        hydration.resolve({});
        await loading;

        expect(stored[config.storageKey]).toEqual(newer);
        expect(recovery).not.toHaveBeenCalledWith('recovered');
        // The deferred fresh read must reopen editing, rather than leave a startup session stuck.
        await vi.advanceTimersByTimeAsync(1000);
        expect(repo.canEdit).toBe(true);
        expect(repo.data.folders[0].name).toBe('Saved elsewhere');
        expect(stored[config.storageKey]).toEqual(newer);
        expect(set.mock.calls.some(([items]) => Object.hasOwn(items, config.storageKey))).toBe(
          false,
        );
      },
    );

    if (!config.recoverMissingData) {
      it('starts an absent bucket empty without recovering an older backup', async () => {
        await new DataBackupService<FolderData>(
          config.backupNamespace,
          validateFolderData,
        ).createPrimaryBackup(folder('Older backup'));
        const repo = create(config);
        await repo.init();

        expect(repo.canEdit).toBe(true);
        expect(repo.data).toEqual({ folders: [], folderContents: {} });
        expect(stored[config.storageKey]).toBeUndefined();
        expect(recovery).not.toHaveBeenCalled();
        expect(
          get.mock.calls.some(
            ([keys]) => Array.isArray(keys) && keys.some((key) => key.startsWith('gvBackup_')),
          ),
        ).toBe(false);
      });
    }
  },
);
