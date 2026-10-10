import { beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { accountIsolationService } from '@/core/services/AccountIsolationService';

import { FolderStore } from '../../FolderStore';
import type { FolderData } from '../../types';
import { SafariFolderAdapter } from '../FolderStorageAdapter';

const storageState = vi.hoisted(() => ({ values: {} as Record<string, unknown> }));

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (key: string) => ({ [key]: storageState.values[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(storageState.values, items);
        }),
        remove: vi.fn(async (key: string) => {
          delete storageState.values[key];
        }),
      },
      sync: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    runtime: { id: 'test-extension-id' },
  },
}));

const folderData: FolderData = {
  folders: [
    {
      id: 'folder-1',
      name: 'Research',
      parentId: null,
      isExpanded: true,
      createdAt: 1,
      updatedAt: 2,
    },
  ],
  folderContents: { 'folder-1': [] },
};

describe('SafariFolderAdapter', () => {
  beforeEach(() => {
    storageState.values = {};
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('loads folder objects written by the cloud-sync popup', async () => {
    storageState.values.gvFolderData = folderData;

    await expect(new SafariFolderAdapter().loadData('gvFolderData')).resolves.toEqual(folderData);
  });

  it('keeps reading legacy JSON-string folder data', async () => {
    storageState.values.gvFolderData = JSON.stringify(folderData);

    await expect(new SafariFolderAdapter().loadData('gvFolderData')).resolves.toEqual(folderData);
  });

  it('stores folder data in the same object shape used by other browsers and the popup', async () => {
    await expect(new SafariFolderAdapter().saveData('gvFolderData', folderData)).resolves.toBe(
      true,
    );

    expect(storageState.values.gvFolderData).toEqual(folderData);
  });

  it('loads extension data before migration while page storage cannot be read', async () => {
    storageState.values.gvFolderData = folderData;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pageRead = vi.spyOn(localStorage, 'getItem').mockImplementation(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError');
    });

    try {
      await expect(new SafariFolderAdapter().loadData('gvFolderData')).resolves.toEqual(folderData);
    } finally {
      pageRead.mockRestore();
    }
  });

  it('rejects a failed read instead of answering from the page copy or as absent', async () => {
    const adapter = new SafariFolderAdapter();
    await adapter.init('gvFolderData');
    const unavailable = new Error('storage unavailable');
    vi.mocked(browser.storage.local.get)
      .mockRejectedValueOnce(unavailable)
      .mockRejectedValueOnce(unavailable);
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(adapter.loadData('gvFolderData')).rejects.toThrow('storage unavailable');
    localStorage.setItem('gvFolderData', JSON.stringify(folderData));
    await expect(adapter.loadData('gvFolderData')).rejects.toThrow('storage unavailable');
  });

  // Init and the first load each fail one migration step; later storage calls work.
  it.each([
    ['its flag cannot be read', 'get', 'gvFolderData_migrated'],
    ['its copy cannot be written to extension storage', 'set', 'gvFolderData'],
  ] as const)(
    'keeps the page-only library unready while %s, then shows it',
    async (_case, method, failingKey) => {
      vi.useFakeTimers();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(accountIsolationService, 'isIsolationEnabled').mockResolvedValue(false);
      localStorage.setItem('gvFolderData', JSON.stringify(folderData));
      const storageMethod = vi.mocked(browser.storage.local[method]) as unknown as ReturnType<
        typeof vi.fn<(arg: string | Record<string, unknown>) => Promise<unknown>>
      >;
      const real = storageMethod.getMockImplementation()!;
      let failures = 2;
      storageMethod.mockImplementation(async (arg: string | Record<string, unknown>) => {
        const keys = typeof arg === 'string' ? [arg] : Object.keys(arg);
        if (keys.includes(failingKey) && failures-- > 0) throw new Error('unavailable');
        return real(arg);
      });
      const store = new FolderStore(
        {
          getContext: () => ({ sidebar: null, sortMode: 'manual', enabled: true }),
          onChange: vi.fn(),
          onArchive: vi.fn(),
          onRecovery: vi.fn(),
        },
        new SafariFolderAdapter(),
      );
      try {
        await store.init();
        expect(store.canEdit).toBe(false);
        expect(storageState.values.gvFolderData).toBeUndefined();

        await vi.advanceTimersByTimeAsync(1000);
        expect(store.canEdit).toBe(true);
        expect(store.data.folders.map(({ id }) => id)).toEqual(['folder-1']);
        expect(JSON.parse(localStorage.getItem('gvFolderData')!)).toEqual(folderData);
      } finally {
        store.destroy();
        storageMethod.mockImplementation(real);
        vi.useRealTimers();
      }
    },
  );
});
