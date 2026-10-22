/**
 * The storage and repository behind the legacy folder authority fence tests:
 * an in-memory `chrome.storage.local` whose `onChanged` listeners hear the
 * authority fence key, and a ChatGPT repository started on stored folders.
 *
 * Each test file maps `webextension-polyfill` to `chrome` and calls
 * `installFolderRepositoryFence()`.
 */
import { afterEach, beforeEach, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { AUTHORITY_FENCE_KEY } from '@/features/folder/owner/authorityFence';
import { CHATGPT_FOLDER_CONFIG } from '@/pages/content/folder/pluginSiteFolderConfigs';

import { FolderRepository } from '../FolderRepository';
import type { PlatformFolderConfig } from '../platformFolderConfig';
import { AIStudioFolderStorageAdapter } from '../storage/AIStudioFolderStorageAdapter';
import type { IFolderStorageAdapter } from '../storage/FolderStorageAdapter';
import type { FolderData } from '../types';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
export const initial: FolderData = {
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
export const fence = (site: string, authority = 'owner') => ({
  build: 'test',
  sites: { [site]: authority },
});
export const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
export const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
export async function settle() {
  for (let i = 0; i < 40; i++) await Promise.resolve();
}
export function pageBackups(namespace = 'chatgpt-folders') {
  return Object.fromEntries(
    ['primary', 'emergency', 'beforeUnload', 'metadata'].map((slot) => {
      const key = `gvBackup_${namespace}_${slot}`;
      return [key, localStorage.getItem(key)];
    }),
  );
}

export let stored: Record<string, unknown>;
let listeners: Set<Listener>;
let originalStorage: typeof chrome.storage;
let originalPageUrl: string;
const repos: FolderRepository[] = [];
const onChange = vi.fn();
export const onRecovery = vi.fn();
export const onSaveFailed = vi.fn();

export function change(value: unknown, area = 'local') {
  if (area === 'local') stored[AUTHORITY_FENCE_KEY] = value;
  for (const listener of listeners) listener({ [AUTHORITY_FENCE_KEY]: { newValue: value } }, area);
}
export function repository(
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
export async function ready(adapter?: IFolderStorageAdapter) {
  stored[StorageKeys.FOLDER_DATA_CHATGPT] = clone(initial);
  const repo = repository(CHATGPT_FOLDER_CONFIG, adapter);
  await repo.init();
  await settle();
  return repo;
}

export function installFolderRepositoryFence(): void {
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
}
