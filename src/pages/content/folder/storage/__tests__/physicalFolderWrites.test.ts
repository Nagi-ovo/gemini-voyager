import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';

import { migrateAIStudioLegacySync } from '../../aistudioImport';
import type { FolderData } from '../../types';
import { AIStudioFolderStorageAdapter } from '../AIStudioFolderStorageAdapter';
import { LocalStorageFolderAdapter, SafariFolderAdapter } from '../FolderStorageAdapter';

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

const data = (name: string): FolderData => ({
  folders: [{ id: 'f', name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
  folderContents: { f: [] },
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const platforms = [
  { site: 'gemini', key: StorageKeys.FOLDER_DATA, adapter: () => new LocalStorageFolderAdapter() },
  {
    site: 'aistudio',
    key: StorageKeys.FOLDER_DATA_AISTUDIO,
    adapter: () => new AIStudioFolderStorageAdapter(),
  },
  {
    site: 'chatgpt',
    key: StorageKeys.FOLDER_DATA_CHATGPT,
    adapter: () => new AIStudioFolderStorageAdapter(),
  },
];
let stored: Record<string, unknown>;
let originalStorage: typeof chrome.storage;
function owner(site = 'gemini') {
  stored[AUTHORITY_FENCE_KEY] = { build: 'owner', sites: { [site]: 'owner' } };
}
beforeEach(() => {
  stored = {};
  originalStorage = chrome.storage;
  chrome.storage = {
    ...chrome.storage,
    local: {
      ...chrome.storage.local,
      get: vi.fn(async (keys: string | string[]) =>
        Object.fromEntries(
          (Array.isArray(keys) ? keys : [keys]).map((key) => [key, structuredClone(stored[key])]),
        ),
      ),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(stored, structuredClone(items));
      }),
      remove: vi.fn(async (key: string) => {
        delete stored[key];
      }),
    },
    sync: { ...chrome.storage.sync, get: vi.fn(async () => ({})) },
  } as unknown as typeof chrome.storage;
  localStorage.clear();
  document.body.replaceChildren();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  chrome.storage = originalStorage;
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
});

describe('physical folder write authority', () => {
  it.each(platforms)(
    'does not overwrite or remove owner folders: $site',
    async ({ site, key, adapter }) => {
      stored[key] = data('Owner');
      owner(site);
      const storage = adapter();
      await expect(storage.saveData(key, data('Legacy'))).rejects.toThrow();
      await expect(storage.removeData(key)).rejects.toThrow();
      expect(stored[key]).toEqual(data('Owner'));
      expect(localStorage.getItem(key)).toBeNull();
    },
  );

  it.each([LocalStorageFolderAdapter, SafariFolderAdapter])(
    'a held missing migration cannot overwrite owner data: %s',
    async (Adapter) => {
      const key = StorageKeys.FOLDER_DATA;
      localStorage.setItem(key, JSON.stringify(data('Legacy')));
      const captured = deferred<void>();
      const read = deferred<Record<string, unknown>>();
      const get = chrome.storage.local.get;
      vi.mocked(get).mockImplementation((async (keys: string | string[]) => {
        if (keys === key) {
          captured.resolve();
          return read.promise;
        }
        return { [String(keys)]: structuredClone(stored[String(keys)]) };
      }) as typeof get);
      const migration = new Adapter().init(key);
      await captured.promise;
      owner();
      stored[key] = data('Owner');
      read.resolve({});
      await expect(migration).rejects.toThrow();
      expect(stored[key]).toEqual(data('Owner'));
      expect(stored[`${key}_migrated`]).toBeUndefined();
      expect(localStorage.getItem(`${key}_migrated`)).toBeNull();
    },
  );

  it('a held load cannot mirror old folders after the owner takes over', async () => {
    const key = StorageKeys.FOLDER_DATA;
    const captured = deferred<void>();
    const read = deferred<Record<string, unknown>>();
    const get = chrome.storage.local.get;
    vi.mocked(get).mockImplementation((async (keys: string | string[]) => {
      if (keys === key) {
        captured.resolve();
        return read.promise;
      }
      return { [String(keys)]: stored[String(keys)] };
    }) as typeof get);
    const loading = new LocalStorageFolderAdapter().loadData(key);
    await captured.promise;
    owner();
    localStorage.setItem(key, JSON.stringify(data('Owner')));
    read.resolve({ [key]: data('Legacy') });
    await expect(loading).rejects.toThrow();
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual(data('Owner'));
  });

  it('Safari cannot mark a migration complete after an in-flight bucket write sees owner takeover', async () => {
    const key = StorageKeys.FOLDER_DATA;
    localStorage.setItem(key, JSON.stringify(data('Legacy')));
    const captured = deferred<void>();
    const firstWrite = deferred<void>();
    vi.mocked(chrome.storage.local.set).mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      Object.assign(stored, items);
      captured.resolve();
      await firstWrite.promise;
    }) as typeof chrome.storage.local.set);
    const migration = new SafariFolderAdapter().init(key);
    await captured.promise;
    owner();
    stored[key] = data('Owner');
    firstWrite.resolve();
    await expect(migration).rejects.toThrow();
    expect(stored[key]).toEqual(data('Owner'));
    expect(stored[`${key}_migrated`]).toBeUndefined();
    expect(localStorage.getItem(`${key}_migrated`)).toBeNull();
  });

  it('Safari does not treat authorization refusal as a page fallback', async () => {
    const key = StorageKeys.FOLDER_DATA;
    stored[key] = data('Legacy');
    const captured = deferred<void>();
    const firstWrite = deferred<void>();
    vi.mocked(chrome.storage.local.set).mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      Object.assign(stored, items);
      captured.resolve();
      await firstWrite.promise;
      throw new Error('quota');
    }) as typeof chrome.storage.local.set);
    const migration = new SafariFolderAdapter().init(key);
    await captured.promise;
    owner();
    firstWrite.resolve();
    await expect(migration).rejects.toThrow();
    expect(localStorage.getItem(`${key}_migrated`)).toBeNull();
  });

  it('AI Studio legacy sync import cannot write folders or its marker under owner authority', async () => {
    const key = StorageKeys.FOLDER_DATA_AISTUDIO;
    owner('aistudio');
    vi.mocked(chrome.storage.sync.get).mockImplementation((async () => ({
      [key]: data('Legacy'),
    })) as unknown as typeof chrome.storage.sync.get);
    await expect(migrateAIStudioLegacySync(key)).rejects.toThrow();
    expect(stored[key]).toBeUndefined();
    expect(stored[`${key}:legacySyncImported`]).toBeUndefined();
  });
});
