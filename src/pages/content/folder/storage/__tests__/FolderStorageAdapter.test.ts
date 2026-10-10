import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderData } from '../../types';
import { LocalStorageFolderAdapter } from '../FolderStorageAdapter';

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

const KEY = 'gvFolderData';
const folderData: FolderData = {
  folders: [
    { id: 'f1', name: 'Research', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 2 },
  ],
  folderContents: { f1: [] },
};

describe('LocalStorageFolderAdapter', () => {
  let durable: Record<string, unknown>;

  beforeEach(() => {
    durable = {};
    localStorage.clear();
    vi.mocked(chrome.storage.local.get).mockImplementation((async (key: string) => ({
      [key]: durable[key],
    })) as unknown as typeof chrome.storage.local.get);
    vi.mocked(chrome.storage.local.set).mockImplementation((async (
      items: Record<string, unknown>,
    ) => {
      Object.assign(durable, items);
    }) as unknown as typeof chrome.storage.local.set);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('rejects a failed read instead of reporting the bucket absent', async () => {
    vi.mocked(chrome.storage.local.get).mockRejectedValueOnce(new Error('context invalidated'));

    await expect(new LocalStorageFolderAdapter().loadData(KEY)).rejects.toThrow(
      'context invalidated',
    );
  });

  it('returns a good read even when the page mirror is full', async () => {
    durable[KEY] = folderData;
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Storage full', 'QuotaExceededError');
    });

    await expect(new LocalStorageFolderAdapter().loadData(KEY)).resolves.toEqual(folderData);
  });

  it('reports a save failed when extension storage, which loads read first, rejects it', async () => {
    vi.mocked(chrome.storage.local.set).mockRejectedValueOnce(new Error('QUOTA_BYTES exceeded'));

    await expect(new LocalStorageFolderAdapter().saveData(KEY, folderData)).resolves.toBe(false);
  });
});
