/**
 * DeepSeek's folders as the page runs them: the bundled catalog plugin
 * mounted by `PluginHost` on DeepSeek's bundled `site.json`, over an in-memory
 * `chrome.storage`. The sidebar is DeepSeek's as observed live (2026-10-19),
 * with neutral classes in place of its build hashes: only `ds-*` names and the
 * conversation links are real, and nothing else may be relied on.
 *
 * Each test file mocks `webextension-polyfill` to read `globalThis.chrome.storage`.
 */
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import {
  type MemoryStorage,
  createMemoryStorage,
  settle,
} from '@/features/plugins/builtin/chatgptFolders/__tests__/memoryStorage';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import type { PluginSettings } from '@/features/plugins/types';

export const PLUGIN_ID = 'voyager.deepseek-folders';
export const GUIDE_ID = 'deepseek-folders-sidebar-intro-v1';
export const SECTION = '.gv-deepseek-folder-section';
export const FAB = '.gv-floating-fab';
export const PANEL = '.gv-floating-folder-panel';
export const FILED_ATTRIBUTE = 'data-gv-deepseek-filed';

export const ROWS = ['Notes', 'Plans', 'Ideas'].map((title, i) => ({
  id: `08d7829${i}-6c6c-4ea9-b796-1274249b885b`,
  title,
}));
export type Row = (typeof ROWS)[number];

export const ref = (row: Row, title = row.title) => ({
  conversationId: `deepseek:conv:${row.id}`,
  title,
  url: `https://chat.deepseek.com/a/chat/s/${row.id}`,
  addedAt: 1,
});

/** What an earlier build stored: one folder holding the first row under an old title. */
export const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Work', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: { f1: [ref(ROWS[0], 'Old title')], [ROOT_CONVERSATIONS_ID]: [] },
};

function link(row: Row): string {
  return `<a class="row" href="/a/chat/s/${row.id}" tabindex="0"><div class="ds-focus-ring"></div><div class="title">${row.title}</div><div><div role="button" class="ds-button"></div></div></a>`;
}

/** DeepSeek's sidebar, plus a reply that links to a chat inside the message list. */
export function mountSidebar(): { sidebar: HTMLElement; list: HTMLElement } {
  const root = document.createElement('div');
  root.innerHTML = `<div class="sidebar"><div class="logo"></div>
    <div class="ds-scroll-area outer"><div class="ds-scroll-area inner"><div class="list">
      <div class="group"><div class="heading">30 days</div>${link(ROWS[0])}${link(ROWS[1])}</div>
      <div class="group"><div class="heading">2026-09</div>${link(ROWS[2])}</div>
    </div></div></div></div>
    <div class="ds-virtual-list ds-scroll-area"><a href="/a/chat/s/${ROWS[2].id}">a link in a reply</a></div>`;
  document.body.append(root);
  return {
    sidebar: root.querySelector<HTMLElement>('.sidebar')!,
    list: root.querySelector<HTMLElement>('.list')!,
  };
}

export async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await settle(20);
}

export interface Page {
  readonly memory: MemoryStorage;
  readonly host: PluginHost;
  stored(): FolderData;
  /** Turns the plugin on or off, or changes its settings, as the popup does. */
  setPlugin(enabled: boolean, settings?: PluginSettings): Promise<void>;
  close(): Promise<void>;
}

let original: typeof chrome.storage | undefined;

/** Fresh storage with DeepSeek's earlier data, its guide seen and the plugin `enabled`. */
export function installStorage(enabled: boolean, settings?: PluginSettings): MemoryStorage {
  const memory = createMemoryStorage();
  original ??= globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  memory.values.sync.set(StorageKeys.COACHMARKS_SEEN, [GUIDE_ID]);
  memory.values.local.set(StorageKeys.FOLDER_DATA_DEEPSEEK, structuredClone(DATA));
  memory.values.local.set(StorageKeys.PLUGINS_STATE, {
    [PLUGIN_ID]: { enabled, installedAt: 1, ...(settings ? { settings } : {}) },
  });
  return memory;
}

export function restoreStorage(): void {
  if (original) globalThis.chrome.storage = original;
}

export async function openPage(memory: MemoryStorage): Promise<Page> {
  const host = new PluginHost({
    url: location.href,
    sources: [new BundledCatalogPluginSource()],
    doc: document,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  return {
    memory,
    host,
    stored: () => memory.values.local.get(StorageKeys.FOLDER_DATA_DEEPSEEK) as FolderData,
    setPlugin: async (enabled, settings) => {
      await memory.api.local.set({
        [StorageKeys.PLUGINS_STATE]: {
          [PLUGIN_ID]: { enabled, installedAt: 1, ...(settings ? { settings } : {}) },
        },
      });
    },
    close: async () => {
      host.stop();
      await nextPass();
    },
  };
}
