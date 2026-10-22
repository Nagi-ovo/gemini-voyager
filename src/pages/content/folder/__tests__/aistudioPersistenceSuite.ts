/**
 * The setup the AI Studio folder persistence suites share
 * (`aistudioPersistence*.test.ts`): storage served from `local` and `sync`
 * through the mocked `webextension-polyfill` and `chrome.storage`, account
 * isolation on, and the helpers that drive the folders like a user. Each test
 * file maps the polyfill to `aistudioPersistenceMockBrowser.ts` and calls
 * `installAIStudioPersistenceSuite()`.
 */
import { afterEach, beforeEach, expect, vi } from 'vitest';

import {
  type AccountScope,
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { toastDriver } from '@/tests/toastDriver';
import { getTranslationSync } from '@/utils/i18n';

import type { TreeActions } from '../floatingTree/shared';
import type { FolderData } from '../types';
import { AIStudioFolderManager } from './aistudioFolderManager';
import { mockBrowser } from './aistudioPersistenceMockBrowser';
import { ROOT, nameInput, tree, treeText } from './aistudioTreeDriver';

export type Manager = {
  data: FolderData;
  accountScope: AccountScope | null;
  activeStorageKey: string;
  handleAccountIsolationToggle(enabled: boolean): Promise<void>;
  refreshScopedDataOnAccountContextChange(): Promise<void>;
  transfer: { sync(): Promise<void>; importFile(): void };
  load(): Promise<void>;
  save(): Promise<boolean>;
  destroy(): void;
  treeActions(): TreeActions;
};

export const storageKey = StorageKeys.FOLDER_DATA_AISTUDIO;
/** Storage contents, emptied in place before each test. */
export const local: Record<string, unknown> = {};
export const sync: Record<string, unknown> = {};
/** Every manager a test mounted; `afterEach` destroys them. */
export const managers: Manager[] = [];

export function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

export function pick(values: Record<string, unknown>, keys: unknown): Record<string, unknown> {
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

export function folderData(name: string): FolderData {
  return {
    folders: [{ id: name, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { [name]: [] },
  };
}

export function selectAccount(account: string): void {
  const indicator = document.querySelector('.account-switcher-text')!;
  indicator.setAttribute('data-email', `${account}@example.com`);
  indicator.textContent = `${account}@example.com`;
}

export async function accountKey(account: string): Promise<string> {
  const scope = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: `${account}@example.com`,
  });
  return buildScopedStorageKey(storageKey, scope.accountKey);
}

export async function mountManager(): Promise<Manager> {
  local[storageKey] = folderData('Global original');
  local[await accountKey('a')] = folderData('Private a');
  local[await accountKey('b')] = folderData('Private b');
  const instance = new AIStudioFolderManager();
  const manager = instance as unknown as Manager;
  managers.push(manager);
  await instance.init();
  expect(treeText()).toContain('Private a');
  return manager;
}

export function attemptCreateAndDrop(): void {
  document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
  const input = nameInput();
  if (input) {
    input.value = 'Created during load';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  }
  const drop = new Event('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(drop, 'dataTransfer', {
    value: {
      getData: () =>
        JSON.stringify({
          type: 'conversation',
          conversationId: 'dropped-during-load',
          title: 'Dropped during load',
          url: '/prompts/dropped-during-load',
        }),
    },
  });
  tree.dropTarget(ROOT).dispatchEvent(drop);
}

export function holdFolderWrites(key: string) {
  const first = deferred<void>();
  const tail = deferred<boolean>();
  const firstStarted = deferred<void>();
  const tailStarted = deferred<void>();
  const snapshots: FolderData[] = [];
  mockBrowser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => {
    const snapshot = structuredClone(values);
    if (snapshot[key]) {
      snapshots.push(snapshot[key] as FolderData);
      if (snapshots.length === 1) {
        firstStarted.resolve();
        await first.promise;
      } else {
        tailStarted.resolve();
        if (!(await tail.promise)) throw new Error('Storage quota exceeded');
      }
    }
    Object.assign(local, snapshot);
  });
  return { first, tail, firstStarted, tailStarted, snapshots };
}

export function notificationText(): string {
  return toastDriver.messages().join('\n');
}

/** What an import reported, success or failure. */
export function importNotices(): string[] {
  const starts = (
    [
      'folder_import_success',
      'folder_import_error',
      'folder_import_invalid_format',
      'folder_import_wrong_site',
    ] as const
  ).map((key) => getTranslationSync(key).split('{')[0]);
  return toastDriver
    .messages()
    .filter((message) => starts.some((start) => message.startsWith(start)));
}

export function hasErrorNotice(): boolean {
  return toastDriver.all().some((toast) => toast.tone === 'error');
}

export function backupData(
  manager: Manager,
  slot: 'primary' | 'emergency' | 'beforeUnload',
): FolderData {
  const namespace = buildScopedStorageKey('aistudio-folders', manager.accountScope!.accountKey);
  return JSON.parse(localStorage.getItem(`gvBackup_${namespace}_${slot}`)!).data as FolderData;
}

export function createFolder(name: string): void {
  document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
  const input = nameInput()!;
  expect(input).not.toBeNull();
  input.value = name;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

export function chooseImport(manager: Manager, data: FolderData, marks: object = {}): void {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
  manager.transfer.importFile();
  const input = click.mock.contexts.at(-1) as HTMLInputElement;
  expect(input).toBeInstanceOf(HTMLInputElement);
  Object.defineProperty(input, 'files', {
    value: [{ text: async () => JSON.stringify({ ...marks, data }) }],
  });
  input.dispatchEvent(new Event('change'));
}

/**
 * Sets the page up before each test of the suite and tears it down after: fake
 * timers, an AI Studio playground with account a signed in, isolation on.
 */
export function installAIStudioPersistenceSuite(): void {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    localStorage.clear();
    document.body.innerHTML = `
    <span class="account-switcher-text" data-email="a@example.com">a@example.com</span>
    <div class="nav-content v3-left-nav"><nav><div class="empty-space"></div></nav></div>`;
    (
      globalThis as unknown as { jsdom: { reconfigure(options: { url: string }): void } }
    ).jsdom.reconfigure({ url: 'https://aistudio.google.com/' });
    for (const key of Object.keys(local)) delete local[key];
    for (const key of Object.keys(sync)) delete sync[key];
    Object.assign(sync, {
      [StorageKeys.LANGUAGE]: 'en',
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: true,
      geminiFolderEnabled: true,
    });
    mockBrowser.storage.local.get.mockImplementation(async (keys: unknown) => pick(local, keys));
    mockBrowser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => {
      Object.assign(local, structuredClone(values));
    });
    mockBrowser.storage.sync.get.mockImplementation(async (keys: unknown) => pick(sync, keys));
    mockBrowser.storage.sync.set.mockImplementation(async (values: Record<string, unknown>) => {
      Object.assign(sync, structuredClone(values));
    });
    chrome.storage.local.get = mockBrowser.storage.local.get as typeof chrome.storage.local.get;
    chrome.storage.local.set = mockBrowser.storage.local.set as typeof chrome.storage.local.set;
    chrome.storage.sync.get = mockBrowser.storage.sync.get as typeof chrome.storage.sync.get;
    chrome.storage.sync.set = mockBrowser.storage.sync.set as typeof chrome.storage.sync.set;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const manager of managers.splice(0)) manager.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });
}
