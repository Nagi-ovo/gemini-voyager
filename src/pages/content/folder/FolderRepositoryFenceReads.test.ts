/**
 * The legacy folder authority fence on a repository's reads: loads, corrupt-data
 * recovery, backup hydration and account binding that find or race the owner
 * fence keep unsaved memory and leave storage alone. Writes under the fence live
 * in `FolderRepositoryFence.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { buildScopedFolderStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';
import { CHATGPT_FOLDER_CONFIG } from '@/pages/content/folder/pluginSiteFolderConfigs';
import { toastDriver } from '@/tests/toastDriver';

import {
  change,
  clone,
  deferred,
  fence,
  initial,
  installFolderRepositoryFence,
  pageBackups,
  ready,
  repository,
  settle,
  stored,
} from './__tests__/folderRepositoryFenceHarness';
import { AISTUDIO_FOLDER_CONFIG, GEMINI_FOLDER_CONFIG } from './platformFolderConfig';
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

installFolderRepositoryFence();

describe('legacy folder authority fence', () => {
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
});
