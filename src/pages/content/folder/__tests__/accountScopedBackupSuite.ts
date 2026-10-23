/**
 * The setup the account-scoped backup suites share (`accountScopedBackup*.test.ts`):
 * Gemini's `FolderManager` and AI Studio's folders over in-memory extension
 * storage, accounts a and b, and the helpers that switch between them. Each
 * test file maps `webextension-polyfill` to `accountScopedBackupMockBrowser.ts`,
 * stubs `@/utils/i18n` and calls `installAccountScopedBackupSuite()`.
 */
import { afterEach, beforeEach, vi } from 'vitest';

import {
  type AccountScope,
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';

import type { FolderSidebarRuntime } from '../FolderSidebarRuntime';
import type { FolderSidebarView } from '../FolderSidebarView';
import type { FolderStore } from '../FolderStore';
import type { FolderTransferController } from '../FolderTransferController';
import * as storageAdapters from '../storage/FolderStorageAdapter';
import type { FolderData } from '../types';
import { mockBrowser } from './accountScopedBackupMockBrowser';
import { AIStudioFolderManager } from './aistudioFolderManager';
import { FolderManager } from './geminiFolderManager';

export type Platform = 'gemini' | 'aistudio';
export type Internals = {
  data: FolderData;
  container: HTMLElement | null;
  accountScope: AccountScope | null;
  activeStorageKey: string;
  initializeFolderUI(): Promise<void>;
  account: { refresh(force?: boolean): Promise<unknown> };
  load(): Promise<void>;
  save(): Promise<void>;
  transfer: FolderTransferController;
  store: FolderStore;
  sidebarRuntime: FolderSidebarRuntime;
  treeView: FolderSidebarView;
  refreshScopedDataOnAccountContextChange(): Promise<void>;
  destroy(): void;
};
export type Harness = {
  manager: Internals;
  store: FolderStore | null;
  adapter: storageAdapters.IFolderStorageAdapter | null;
  data: FolderData;
  readonly storageKey: string;
  readonly accountScope: AccountScope | null;
  load(): Promise<void>;
  save(): Promise<unknown>;
  sync(): Promise<void>;
  switchTo(account: 'a' | 'b'): Promise<void>;
};

export type StorageListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  area: string,
) => void;
export const storageListeners = new Set<StorageListener>();
export function emitStorageChange(changes: Parameters<StorageListener>[0], area: string): void {
  for (const listener of storageListeners) listener(changes, area);
}

/** Extension storage, emptied in place before each test. */
export const extensionLocal: Record<string, unknown> = {};
export const extensionSync: Record<string, unknown> = {};
export const cleanup: Array<() => void> = [];
export const emptyData = (): FolderData => ({ folders: [], folderContents: {} });
export const baseKey = (platform: Platform) =>
  platform === 'gemini' ? StorageKeys.FOLDER_DATA : StorageKeys.FOLDER_DATA_AISTUDIO;

export function selectAccount(platform: Platform, account: 'a' | 'b'): void {
  const host = platform === 'gemini' ? 'gemini.google.com' : 'aistudio.google.com';
  const route = platform === 'gemini' ? `/u/${account === 'a' ? 1 : 2}/app` : '/';
  const jsdom = (
    globalThis as unknown as {
      jsdom: { reconfigure(options: { url: string }): void };
    }
  ).jsdom;
  jsdom.reconfigure({ url: `https://${host}${route}` });
  let accountIndicator = document.querySelector('.account-switcher-text');
  if (!accountIndicator) {
    accountIndicator = document.createElement('span');
    accountIndicator.className = 'account-switcher-text';
    document.body.appendChild(accountIndicator);
  }
  accountIndicator.setAttribute('data-email', `${account}@example.com`);
  accountIndicator.textContent = `${account}@example.com`;
}

export function pick(store: Record<string, unknown>, keys: unknown): Record<string, unknown> {
  if (typeof keys === 'string') return structuredClone({ [keys]: store[keys] });
  if (Array.isArray(keys)) {
    return structuredClone(Object.fromEntries(keys.map((key) => [key, store[key]])));
  }
  if (keys && typeof keys === 'object') {
    return structuredClone(
      Object.fromEntries(
        Object.entries(keys).map(([key, fallback]) => [key, store[key] ?? fallback]),
      ),
    );
  }
  return structuredClone(store);
}

export function privateData(account: 'a' | 'b'): FolderData {
  return {
    folders: [
      {
        id: account,
        name: `Private ${account}`,
        parentId: null,
        isExpanded: true,
        createdAt: 1,
        updatedAt: 1,
        sortIndex: 0,
      },
    ],
    folderContents: { [account]: [] },
  };
}

export async function accountKeys(platform: Platform, account: 'a' | 'b') {
  selectAccount(platform, account);
  const scope = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: `${account}@example.com`,
    routeUserId: platform === 'gemini' ? (account === 'a' ? '1' : '2') : null,
  });
  return {
    live: buildScopedStorageKey(baseKey(platform), scope.accountKey),
    backup: buildScopedStorageKey(`${platform}-folders`, scope.accountKey),
  };
}

export function backupData(namespace: string, slot = 'primary'): FolderData | undefined {
  const serialized = localStorage.getItem(`gvBackup_${namespace}_${slot}`);
  return serialized ? JSON.parse(serialized).data : undefined;
}

export async function makeHarness(platform: Platform, account: 'a' | 'b'): Promise<Harness> {
  selectAccount(platform, account);
  // Both use real loads with native UI waits disabled.
  extensionSync.geminiFolderEnabled = platform === 'aistudio';
  const adapter = platform === 'gemini' ? storageAdapters.createFolderStorageAdapter() : null;
  if (adapter) vi.spyOn(storageAdapters, 'createFolderStorageAdapter').mockReturnValueOnce(adapter);
  const instance = platform === 'gemini' ? new FolderManager() : new AIStudioFolderManager();
  const manager = instance as unknown as Internals;
  cleanup.push(() => manager.destroy());
  if (platform === 'aistudio') {
    // The folders' view loads without waiting for AI Studio's nav.
    const view = (instance as AIStudioFolderManager).view as unknown as Internals;
    vi.spyOn(view, 'initializeFolderUI').mockImplementation(() => manager.load());
  }
  await instance.init();
  const store = platform === 'gemini' ? manager.store : null;
  return {
    manager,
    store,
    adapter,
    get data() {
      return store ? store.data : manager.data;
    },
    set data(data: FolderData) {
      if (store) store.data = data;
      else manager.data = data;
    },
    get storageKey() {
      return store ? store.storageKey : manager.activeStorageKey;
    },
    get accountScope() {
      return store ? store.accountScope : manager.accountScope;
    },
    load: () => (store ? store.loadData() : manager.load()),
    save: () => (store ? store.saveData() : manager.save()),
    sync: () => manager.transfer.sync(),
    switchTo: async (next) => {
      selectAccount(platform, next);
      if (store) await store.refreshAccountScope();
      else await manager.account.refresh(true);
    },
  };
}

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export async function mountGeminiPanel(harness: Harness): Promise<HTMLElement> {
  const root = document.createElement('div');
  root.id = 'app-root';
  root.className = 'side-nav-open';
  root.innerHTML =
    '<div data-test-id="overflow-container"><expandable-section data-test-id="chats-expandable-section"></expandable-section></div>';
  document.body.appendChild(root);
  await harness.manager.sidebarRuntime.start('sidebar');
  return harness.manager.sidebarRuntime.panel!;
}

/** Routes the platform's folder writes through `write`. */
export function mockWrites(
  harness: Harness,
  platform: Platform,
  write: (key: string, data: FolderData) => Promise<boolean>,
): void {
  if (platform === 'gemini') vi.spyOn(harness.adapter!, 'saveData').mockImplementation(write);
  else
    mockBrowser.storage.local.set.mockImplementation(async (values) => {
      const [key, data] = Object.entries(values)[0];
      await write(key, data as FolderData);
    });
}

/** Account a's legacy unscoped data, holding a conversation from its route. */
export function legacyData(platform: Platform): FolderData {
  const legacy = privateData('a');
  const url = {
    gemini: 'https://gemini.google.com/u/1/app/abc',
    aistudio: 'https://aistudio.google.com/prompts/abc',
  }[platform];
  legacy.folderContents.a.push({ conversationId: 'legacy-a', title: 'Legacy a', addedAt: 1, url });
  return legacy;
}

export function pauseFirstWrite(harness: Harness, platform: Platform, storageKey: string) {
  const pending = deferred<void>();
  const started = deferred<void>();
  let first = true;
  const write = async (key: string, data: FolderData) => {
    const snapshot = structuredClone(data);
    if (key === storageKey && first) {
      first = false;
      started.resolve();
      await pending.promise;
    }
    extensionLocal[key] = snapshot;
    return true;
  };
  mockWrites(harness, platform, write);
  return { started: started.promise, release: () => pending.resolve() };
}

/** Fake timers, emptied storage and a fresh page around each test. */
export function installAccountScopedBackupSuite(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    storageListeners.clear();
    mockBrowser.storage.onChanged.addListener.mockImplementation((listener: StorageListener) =>
      storageListeners.add(listener),
    );
    mockBrowser.storage.onChanged.removeListener.mockImplementation((listener: StorageListener) =>
      storageListeners.delete(listener),
    );
    localStorage.clear();
    document.body.innerHTML = '';
    for (const key of Object.keys(extensionLocal)) delete extensionLocal[key];
    for (const key of Object.keys(extensionSync)) delete extensionSync[key];
    extensionSync[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] = true;
    const localGet = vi.fn(async (keys: unknown) => pick(extensionLocal, keys));
    const localSet = vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(extensionLocal, structuredClone(values));
    });
    const syncGet = vi.fn(async (keys: unknown) => pick(extensionSync, keys));
    const syncSet = vi.fn(async (values: Record<string, unknown>) => {
      Object.assign(extensionSync, structuredClone(values));
    });
    chrome.storage.local.get = localGet as typeof chrome.storage.local.get;
    chrome.storage.local.set = localSet as typeof chrome.storage.local.set;
    chrome.storage.sync.get = syncGet as typeof chrome.storage.sync.get;
    chrome.storage.sync.set = syncSet as typeof chrome.storage.sync.set;
    mockBrowser.storage.local.get = localGet;
    mockBrowser.storage.local.set = localSet;
    mockBrowser.storage.sync.get = syncGet;
    mockBrowser.storage.sync.set = syncSet;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const action of cleanup.splice(0)) action();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
}
