/**
 * The page and storage behind the AI Studio persistence characterization, which
 * pins, before AI Studio folder persistence moves onto the shared
 * FolderRepository, what reaches chrome.storage, the recovery slots and the
 * screen through the manager's persistence surface, DOM and storage: AI Studio
 * never normalizes or prunes, keeps `__uncategorized__`, copies the legacy
 * bucket raw and recovers a missing key from backups.
 *
 * Each test file maps `webextension-polyfill` to `mockBrowser` (see
 * `aistudioPersistenceMockBrowser.ts`) and calls `installAIStudioPersistencePage()`.
 */
import { afterEach, beforeEach, vi } from 'vitest';

import {
  type AccountScope,
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { toastDriver } from '@/tests/toastDriver';

import { cls } from '../floatingTree/shared';
import type { ConversationReference, FolderData } from '../types';
import { AIStudioFolderManager } from './aistudioFolderManager';
import { mockBrowser } from './aistudioPersistenceMockBrowser';
import { treeRoot } from './aistudioTreeDriver';

export { mockBrowser };

export type Manager = {
  data: FolderData;
  accountScope: AccountScope | null;
  activeStorageKey: string;
  handleAccountIsolationToggle(enabled: boolean): Promise<void>;
  refreshScopedDataOnAccountContextChange(): Promise<void>;
  load(): Promise<void>;
  save(): Promise<boolean>;
  destroy(): void;
};

export type StorageListener = (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void;

export const GLOBAL_KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
export const MIGRATION_MARKER = `${GLOBAL_KEY}:legacySyncImported`;
export const local: Record<string, unknown> = {};
export const sync: Record<string, unknown> = {};
const managers: Manager[] = [];

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

export function prompt(
  id: string,
  extra: Partial<ConversationReference> & Record<string, unknown> = {},
) {
  return {
    conversationId: id,
    title: `Prompt ${id}`,
    url: `https://aistudio.google.com/prompts/${id}`,
    addedAt: 100,
    ...extra,
  };
}

/** Real-shaped AI Studio data: no sortIndex anywhere, createdAt order differs from name order. */
export function fixture(): FolderData & { version: number } {
  return structuredClone({
    folders: [
      {
        id: 'f-late',
        name: 'Alpha late',
        parentId: null,
        isExpanded: true,
        createdAt: 30,
        updatedAt: 30,
      },
      {
        id: 'f-early',
        name: 'Zulu early',
        parentId: null,
        isExpanded: true,
        createdAt: 10,
        updatedAt: 10,
      },
      {
        id: 'f-child',
        name: 'Child',
        parentId: 'f-early',
        isExpanded: true,
        createdAt: 20,
        updatedAt: 20,
      },
      // No folderContents entry at all.
      {
        id: 'f-nokey',
        name: 'Middle no key',
        parentId: null,
        isExpanded: true,
        createdAt: 40,
        updatedAt: 40,
      },
    ],
    folderContents: {
      'f-late': [prompt('p1'), prompt('p2', { addedAt: 300 }), prompt('p1')],
      'f-early': [],
      'f-child': [prompt('p3', { starred: true, importedExtra: 'kept' })],
      __uncategorized__: [prompt('p4'), prompt('p5', { url: '/prompts/p5' })],
      'ghost-folder': [prompt('p6')],
    },
    version: 2,
  });
}

/** What the old save path writes: cloneFolderData drops the extra top-level key only. */
export function expectedWrite(source: FolderData = fixture()): FolderData {
  return { folders: source.folders, folderContents: source.folderContents };
}

export function bytes(value: unknown): string {
  return JSON.stringify(value);
}

export function folderData(name: string): FolderData {
  return {
    folders: [{ id: name, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { [name]: [] },
  };
}

export async function scopedKey(account: string): Promise<string> {
  const scope = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: `${account}@example.com`,
  });
  return buildScopedStorageKey(GLOBAL_KEY, scope.accountKey);
}

export async function scopedBackupNamespace(account: string): Promise<string> {
  const scope = await accountIsolationService.resolveAccountScope({
    pageUrl: window.location.href,
    email: `${account}@example.com`,
  });
  return buildScopedStorageKey('aistudio-folders', scope.accountKey);
}

export function selectAccount(account: string): void {
  const indicator = document.querySelector('.account-switcher-text')!;
  indicator.setAttribute('data-email', `${account}@example.com`);
  indicator.textContent = `${account}@example.com`;
}

export function useIsolation(enabled: boolean): void {
  sync[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] = enabled;
}

export async function mount(): Promise<Manager> {
  const instance = new AIStudioFolderManager();
  const manager = instance as unknown as Manager;
  managers.push(manager);
  await instance.init();
  return manager;
}

export function emitStorageChange(
  changes: Record<string, { newValue?: unknown }>,
  area: string,
): void {
  for (const [listener] of mockBrowser.storage.onChanged.addListener.mock.calls) {
    (listener as StorageListener)(changes, area);
  }
}

export function folderWrites(key: string): unknown[] {
  return mockBrowser.storage.local.set.mock.calls
    .map(([values]) => (values as Record<string, unknown>)[key])
    .filter((value) => value !== undefined);
}

export function rootFolderOrder(): string[] {
  return Array.from(
    treeRoot().querySelectorAll<HTMLElement>(`.${cls('folder')}[data-depth="0"]`),
    (item) => item.querySelector<HTMLElement>(`.${cls('folder-header')}`)?.dataset.folderId ?? '',
  );
}

export function notificationText(): string {
  return toastDriver.messages().join('\n');
}

export function backupSlot(namespace: string, slot: 'primary' | 'emergency'): FolderData | null {
  const raw = localStorage.getItem(`gvBackup_${namespace}_${slot}`);
  return raw ? (JSON.parse(raw).data as FolderData) : null;
}

/** Empties `target` in place and refills it, so imported references stay live. */
function reset(target: Record<string, unknown>, values: Record<string, unknown>): void {
  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, values);
}

/** Registers the per-test AI Studio page, storage mocks and teardown. */
export function installAIStudioPersistencePage(): void {
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
    reset(local, {});
    reset(sync, {
      [StorageKeys.LANGUAGE]: 'en',
      [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: false,
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
    mockBrowser.storage.sync.remove.mockImplementation(async (keys: string | string[]) => {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete sync[key];
    });
    chrome.storage.local.get = mockBrowser.storage.local.get as typeof chrome.storage.local.get;
    chrome.storage.local.set = mockBrowser.storage.local.set as typeof chrome.storage.local.set;
    chrome.storage.sync.get = mockBrowser.storage.sync.get as typeof chrome.storage.sync.get;
    chrome.storage.sync.set = mockBrowser.storage.sync.set as typeof chrome.storage.sync.set;
    chrome.storage.sync.remove = mockBrowser.storage.sync
      .remove as typeof chrome.storage.sync.remove;
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const manager of managers.splice(0)) manager.destroy();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });
}
