/**
 * Folder fence recovery across accounts: edits made on account A while authority
 * was unreadable stay with A, are hidden while account B is bound, and come back
 * when the tab returns to A. Single-tab availability lives in
 * `FolderRepositoryFenceRecovery.test.ts`.
 */
import { expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import {
  buildScopedFolderStorageKey,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';

import {
  clone,
  commit,
  create,
  deferred,
  emit,
  get,
  initial,
  installFolderFenceRecovery,
  read,
  set,
  settle,
  stored,
} from './__tests__/folderRepositoryFenceRecoveryHarness';
import { AISTUDIO_FOLDER_CONFIG, GEMINI_FOLDER_CONFIG } from './platformFolderConfig';
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

installFolderFenceRecovery();

it('hides account A when account B is selected after authority became unreadable', async () => {
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
  const { repo } = create(GEMINI_FOLDER_CONFIG);
  await repo.init();
  await settle();
  expect(repo.storageKey).toBe(firstKey);
  set.mockImplementation(async (items) => {
    if (Object.hasOwn(items, firstKey)) throw new Error('Account A save failed');
    commit(items);
  });
  repo.data.folders[0].name = 'Private account A edit';
  expect(await repo.saveData()).toBe(false);
  await settle();
  set.mockImplementation(async (items) => commit(items));
  get.mockImplementation(async (keys) => {
    if (keys === AUTHORITY_FENCE_KEY) throw new Error('Authority unreadable');
    return read(keys);
  });
  await repo.loadData();
  expect(repo.canEdit).toBe(false);
  const activation = repo.activation;
  window.history.replaceState({}, '', '/u/1/app');
  await repo.refreshAccountScope();
  expect(repo.storageKey).toBe('');
  expect(repo.data).toEqual({ folders: [], folderContents: {} });
  expect(repo.activation).toBeGreaterThan(activation);
  get.mockImplementation(async (keys) => read(keys));
  await vi.advanceTimersByTimeAsync(30000);
  await settle();
  expect(repo.storageKey).toBe(secondKey);
  expect(repo.data.folders[0]?.name).toBe('Account B');
  expect(repo.canEdit).toBe(true);
  stored[firstKey] = { corrupted: true };
  localStorage.removeItem(firstKey);
  window.history.replaceState({}, '', '/');
  await repo.refreshAccountScope();
  await repo.loadData();
  await settle();
  expect(repo.storageKey).toBe(firstKey);
  expect(repo.data.folders[0]?.name).toBe('Private account A edit');
  expect((stored[firstKey] as FolderData).folders[0]?.name).toBe('Private account A edit');
});

it('account A debounced edits stay with A through unreadable authority and a delayed account B binding', async () => {
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
  const { repo } = create(GEMINI_FOLDER_CONFIG);
  await repo.init();
  await settle();
  repo.data.folders[0].isExpanded = false;
  repo.scheduleSaveData();
  get.mockImplementation(async (keys) => {
    if (keys === AUTHORITY_FENCE_KEY) throw new Error('Authority unreadable');
    return read(keys);
  });
  await repo.loadData();
  window.history.replaceState({}, '', '/u/1/app');
  await repo.refreshAccountScope();
  const bindingAuthority = deferred<Record<string, unknown>>();
  let recoveredProbe = false;
  get.mockImplementation(async (keys) => {
    if (keys === AUTHORITY_FENCE_KEY) {
      if (recoveredProbe) return bindingAuthority.promise;
      recoveredProbe = true;
    }
    return read(keys);
  });
  await vi.advanceTimersByTimeAsync(1600);
  expect(recoveredProbe).toBe(true);
  expect(repo.storageKey).toBe('');
  expect(repo.canEdit).toBe(false);
  get.mockImplementation(async (keys) => read(keys));
  bindingAuthority.resolve({});
  await settle();
  await vi.advanceTimersByTimeAsync(30000);
  expect(repo.storageKey).toBe(secondKey);
  expect(repo.data.folders[0].isExpanded).toBe(true);
  expect((stored[secondKey] as FolderData).folders[0].isExpanded).toBe(true);
  const restored: FolderData = {
    folders: [
      ...clone(initial.folders),
      { ...initial.folders[0], id: 'restored', name: 'Restored elsewhere' },
    ],
    folderContents: { f: [], restored: [] },
  };
  emit(firstKey, restored);
  window.history.replaceState({}, '', '/');
  await repo.refreshAccountScope();
  await repo.loadData();
  await vi.advanceTimersByTimeAsync(1000);
  await settle();
  expect(repo.storageKey).toBe(firstKey);
  expect(repo.data.folders[0].isExpanded).toBe(false);
  expect(repo.data.folders.map(({ id }) => id)).toContain('restored');
  expect((stored[firstKey] as FolderData).folders[0].isExpanded).toBe(false);
  expect((stored[firstKey] as FolderData).folders.map(({ id }) => id)).toContain('restored');
});

it.each([GEMINI_FOLDER_CONFIG, AISTUDIO_FOLDER_CONFIG])(
  'a collapse survives returning to account A after its queued save finishes with account B bound ($storageKey)',
  async (config) => {
    window.history.replaceState({}, '', '/');
    vi.mocked(browser.storage.sync.get).mockResolvedValue({
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: true,
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO]: true,
    });
    const firstKey = buildScopedStorageKey(config.storageKey, 'default');
    const secondKey = buildScopedStorageKey(config.storageKey, 'route:1');
    stored[firstKey] = clone(initial);
    const accountB = {
      ...clone(initial),
      folders: [{ ...initial.folders[0], name: 'Account B' }],
    };
    stored[secondKey] = clone(accountB);
    const { repo } = create(config);
    await repo.init();
    await settle();
    expect(repo.storageKey).toBe(firstKey);

    const startedB = deferred<void>();
    const finishB = deferred<void>();
    const startedC = deferred<void>();
    const finishC = deferred<void>();
    set.mockImplementation(async (items) => {
      const name = (items[firstKey] as FolderData | undefined)?.folders[0]?.name;
      if (name === 'B') {
        startedB.resolve();
        await finishB.promise;
      } else if (name === 'C') {
        startedC.resolve();
        await finishC.promise;
      }
      commit(items);
    });
    repo.data.folders[0].name = 'B';
    const savingB = repo.saveData();
    await startedB.promise;
    // Hold C's emergency-backup authorization until the later collapse has been accepted.
    const unreadableAuthority = deferred<void>();
    get.mockImplementation(async (keys) => {
      if (keys === AUTHORITY_FENCE_KEY) {
        await unreadableAuthority.promise;
        throw new Error('Authority unreadable');
      }
      return read(keys);
    });
    repo.data.folders[0].name = 'C';
    const savingC = repo.saveData();
    await settle();
    expect(repo.canEdit).toBe(true);
    repo.data.folders[0].isExpanded = false;
    repo.scheduleSaveData();
    unreadableAuthority.resolve();
    await settle();
    expect(repo.canEdit).toBe(false);
    window.history.replaceState({}, '', '/u/1/app');
    await repo.refreshAccountScope();
    finishB.resolve();
    expect(await savingB).toBe(true);
    await settle();

    get.mockImplementation(async (keys) => read(keys));
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    await startedC.promise;
    expect(repo.storageKey).toBe(secondKey);
    expect(repo.canEdit).toBe(true);
    expect(repo.data.folders[0].name).toBe('Account B');
    // C must settle after B binds: only A's still-pending collapse keeps its session alive.
    finishC.resolve();
    expect(await savingC).toBe(true);
    await settle();
    expect((stored[firstKey] as FolderData).folders[0].isExpanded).toBe(true);

    window.history.replaceState({}, '', '/');
    await repo.refreshAccountScope();
    await repo.loadData();
    await vi.advanceTimersByTimeAsync(1000);
    await settle();
    expect(repo.storageKey).toBe(firstKey);
    expect(repo.data.folders[0].name).toBe('C');
    expect(repo.data.folders[0].isExpanded).toBe(false);
    expect((stored[firstKey] as FolderData).folders[0].isExpanded).toBe(false);
    expect(stored[secondKey]).toEqual(accountB);
  },
);
