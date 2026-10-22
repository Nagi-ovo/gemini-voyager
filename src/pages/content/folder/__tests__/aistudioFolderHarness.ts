/**
 * An AI Studio page for folder manager tests: the left nav, storage served from
 * `local` and `sync`, and teardown of every mounted manager. A test file maps
 * `webextension-polyfill` to the global `chrome` mock, which `mockBrowser` types:
 *
 *   vi.mock('webextension-polyfill', () => ({ default: chrome }));
 */
import { type Mock, afterEach, beforeEach, vi } from 'vitest';

import {
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';

import type { ConversationReference, Folder, FolderData } from '../types';
import { AIStudioFolderManager } from './aistudioFolderManager';
import { treeText } from './aistudioTreeDriver';

export const mockBrowser = chrome as unknown as {
  runtime: { sendMessage: Mock; onMessage: { addListener: Mock } };
  storage: {
    onChanged: { addListener: Mock };
    local: { get: Mock; set: Mock; remove: Mock };
    sync: { get: Mock; set: Mock };
  };
};

export const GLOBAL_KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
/** Storage contents, emptied in place before each test. */
export const local: Record<string, unknown> = {};
export const sync: Record<string, unknown> = {};

/** The manager's private surface the tests reach. */
export type Manager = {
  data: FolderData;
  activeStorageKey: string;
  save(): Promise<boolean>;
  transfer: { sync(): Promise<void>; upload(): Promise<void> };
  destroy(): void;
};

type StorageListener = (changes: Record<string, { newValue?: unknown }>, area: string) => void;

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

function reset(values: Record<string, unknown>, next: Record<string, unknown>): void {
  for (const key of Object.keys(values)) delete values[key];
  Object.assign(values, next);
}

export function emitStorageChange(values: Record<string, unknown>, area: string): void {
  const changes = Object.fromEntries(
    Object.entries(values).map(([key, newValue]) => [key, { newValue }]),
  );
  for (const [listener] of mockBrowser.storage.onChanged.addListener.mock.calls) {
    (listener as StorageListener)(changes, area);
  }
}

/** chrome.storage hands listeners a fresh copy whose object keys come back sorted. */
export function sortedClone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedClone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedClone((value as Record<string, unknown>)[key])]),
  );
}

/** Another tab, the popup or cloud sync writes local storage. */
export function writeFromElsewhere(values: Record<string, unknown>): void {
  Object.assign(local, structuredClone(values));
  emitStorageChange(values, 'local');
}

export function folderData(name: string): FolderData {
  return {
    folders: [{ id: name, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { [name]: [] },
  };
}

export function panelText(): string {
  return treeText();
}

export async function scopedKey(account: string): Promise<string> {
  const scope = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: `${account}@example.com`,
  });
  return buildScopedStorageKey(GLOBAL_KEY, scope.accountKey);
}

/** Starts a manager on the current page and storage. */
export async function mount(): Promise<Manager> {
  const instance = new AIStudioFolderManager();
  const manager = instance as unknown as Manager;
  managers.push(manager);
  await instance.init();
  return manager;
}

export function folder(id: string, name: string, extra: Partial<Folder> = {}): Folder {
  return { id, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1, ...extra };
}

export function conv(id: string, title: string, extra: Partial<ConversationReference> = {}) {
  return {
    conversationId: id,
    title,
    url: `https://aistudio.google.com/prompts/${id}`,
    addedAt: 1,
    ...extra,
  };
}

/**
 * Creation order differs from both name and sortIndex order, so a tree that
 * sorts by either shows itself. Beta's prompts are stored oldest-added first,
 * with the starred one in the middle.
 */
export function treeFixture(): FolderData {
  return {
    folders: [
      folder('b', 'Beta', { createdAt: 1, sortIndex: 2 }),
      folder('a', 'Alpha', { createdAt: 2, sortIndex: 0 }),
      folder('p', 'Pinned', { createdAt: 3, sortIndex: 1, pinned: true }),
      folder('b2', 'Late child', { parentId: 'b', createdAt: 9, sortIndex: 0 }),
      folder('b1', 'Early child', { parentId: 'b', createdAt: 5, sortIndex: 1 }),
      folder('g', 'Grandchild', { parentId: 'b1', createdAt: 6 }),
    ],
    folderContents: {
      b: [
        conv('c1', 'First stored', { addedAt: 1 }),
        conv('c2', 'Starred second', { addedAt: 2, starred: true }),
        conv('c3', 'Newest third', { addedAt: 3 }),
      ],
      a: [conv('c4', 'In alpha')],
      p: [],
      b1: [],
      b2: [],
      g: [conv('c5', 'Under grandchild')],
    },
  };
}

export function stored(): FolderData {
  return local[GLOBAL_KEY] as FolderData;
}

export async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0));
}

function setUrl(url: string): void {
  (
    globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
  ).jsdom.reconfigure({ url });
}

/** Mounts a manager at `path` over `data`, once its first render settles. */
export async function mountTree(data: FolderData = treeFixture(), path = '/prompts/new_chat') {
  setUrl(`https://aistudio.google.com${path}`);
  local[GLOBAL_KEY] = structuredClone(data);
  const manager = await mount();
  await flush();
  return manager;
}

/** Destroys every manager mounted so far, as the feature turning off would. */
export function destroyManagers(): void {
  for (const manager of managers.splice(0)) manager.destroy();
}

/**
 * Sets the page up before each test and tears it down after. `syncStorage`:
 * fake timers on the playground, with each changed local write echoed to the
 * storage listeners in a later task, as chrome.storage does.
 */
export function installAIStudioFolderPage(options: { syncStorage?: boolean } = {}): void {
  const { syncStorage = false } = options;
  beforeEach(() => {
    if (syncStorage) vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = `
    <span class="account-switcher-text" data-email="a@example.com">a@example.com</span>
    <div class="nav-content v3-left-nav"><nav><div class="empty-space"></div></nav></div>`;
    if (syncStorage) setUrl('https://aistudio.google.com/');
    reset(local, {});
    reset(sync, {
      [StorageKeys.LANGUAGE]: 'en',
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: false,
      geminiFolderEnabled: true,
    });
    mockBrowser.storage.local.get.mockImplementation(async (keys: unknown) => pick(local, keys));
    mockBrowser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => {
      if (!syncStorage) {
        Object.assign(local, structuredClone(values));
        return;
      }
      // Like chrome.storage: a write that changes a value echoes back to this context's
      // listeners in a later task; an unchanged value or a rejected write emits nothing.
      const changed = Object.fromEntries(
        Object.entries(values)
          .filter(([key, value]) => JSON.stringify(local[key]) !== JSON.stringify(value))
          .map(([key, value]) => [key, sortedClone(value)]),
      );
      Object.assign(local, structuredClone(values));
      if (Object.keys(changed).length > 0) setTimeout(() => emitStorageChange(changed, 'local'), 0);
    });
    mockBrowser.storage.sync.get.mockImplementation(async (keys: unknown) => pick(sync, keys));
    mockBrowser.storage.sync.set.mockImplementation(async (values: Record<string, unknown>) => {
      Object.assign(sync, structuredClone(values));
    });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    destroyManagers();
    if (syncStorage) {
      vi.clearAllTimers();
      vi.useRealTimers();
    }
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });
}
