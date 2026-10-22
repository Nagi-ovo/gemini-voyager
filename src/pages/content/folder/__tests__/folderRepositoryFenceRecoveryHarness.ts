/**
 * The storage and repositories behind the folder fence recovery tests: an
 * in-memory `chrome.storage.local` whose `get`/`set` mocks each test can hold or
 * fail, with every committed key announced to `onChanged`, on fake timers.
 *
 * Each test file maps `webextension-polyfill` to `chrome` and calls
 * `installFolderFenceRecovery()`.
 */
import { afterEach, beforeEach, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CHATGPT_FOLDER_CONFIG } from '@/pages/content/folder/pluginSiteFolderConfigs';

import { FolderRepository } from '../FolderRepository';
import {
  AISTUDIO_FOLDER_CONFIG,
  GEMINI_FOLDER_CONFIG,
  type PlatformFolderConfig,
} from '../platformFolderConfig';
import { AIStudioFolderStorageAdapter } from '../storage/AIStudioFolderStorageAdapter';
import { LocalStorageFolderAdapter } from '../storage/FolderStorageAdapter';
import type { FolderData } from '../types';

type Listener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;
export const configs = [GEMINI_FOLDER_CONFIG, AISTUDIO_FOLDER_CONFIG, CHATGPT_FOLDER_CONFIG];
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
export const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));
export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
export async function settle() {
  for (let i = 0; i < 150; i++) await Promise.resolve();
}

let originalStorage: typeof chrome.storage;
let originalPageUrl: string;
export let stored: Record<string, unknown>;
let listeners: Set<Listener>;
const repositories: FolderRepository[] = [];
export const recovery = vi.fn();
export const set = vi.fn<(items: Record<string, unknown>) => Promise<void>>();
export const get = vi.fn<(keys: string | string[]) => Promise<Record<string, unknown>>>();
export function read(keys: string | string[]) {
  return Object.fromEntries(
    (Array.isArray(keys) ? keys : [keys]).map((key) => [key, clone(stored[key])]),
  );
}
export function emit(key: string, value: unknown) {
  stored[key] = clone(value);
  for (const listener of listeners) listener({ [key]: { newValue: clone(value) } }, 'local');
}
export function commit(items: Record<string, unknown>) {
  for (const [key, value] of Object.entries(items)) emit(key, value);
}
export function owner(config: PlatformFolderConfig) {
  const site = config.storageKey === StorageKeys.FOLDER_DATA_CHATGPT ? 'chatgpt' : config.platform;
  return { build: 'test', sites: { [site!]: 'owner' } };
}
export function create(config: PlatformFolderConfig) {
  const reloads = vi.fn();
  const repo = new FolderRepository(
    config,
    config === GEMINI_FOLDER_CONFIG
      ? new LocalStorageFolderAdapter()
      : new AIStudioFolderStorageAdapter(),
    {
      onChange: () => {},
      onAccountReleased: () => {},
      onRecovery: recovery,
      isEnabled: () => true,
      onExternalChange: () => {
        reloads();
        // Bound a broken reload loop so the regression reports failure instead of starving Vitest.
        if (reloads.mock.calls.length <= 20) void repo.loadData();
      },
    },
  );
  repositories.push(repo);
  return { repo, reloads };
}
export async function ready(config: PlatformFolderConfig) {
  stored[config.storageKey] = clone(initial);
  const result = create(config);
  await result.repo.init();
  await settle();
  return result;
}
export function emergency(config: PlatformFolderConfig) {
  return JSON.parse(localStorage.getItem(`gvBackup_${config.backupNamespace}_emergency`)!) as {
    data: FolderData;
  };
}

export function installFolderFenceRecovery(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    originalStorage = chrome.storage;
    originalPageUrl = window.location.href;
    stored = {};
    listeners = new Set();
    recovery.mockReset();
    get.mockReset().mockImplementation(async (keys) => read(keys));
    set.mockReset().mockImplementation(async (items) => commit(items));
    chrome.storage = {
      local: {
        get,
        set,
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
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    for (const repo of repositories.splice(0)) repo.destroy();
    chrome.storage = originalStorage;
    window.history.replaceState({}, '', originalPageUrl);
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
}
