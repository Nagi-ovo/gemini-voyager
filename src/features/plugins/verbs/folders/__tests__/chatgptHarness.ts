/**
 * ChatGPT's folders as the page runs them: the bundled catalog plugin mounted
 * by `PluginHost` on ChatGPT's bundled `site.json`, over an in-memory
 * `chrome.storage`, on the sidebar `chatgpt/chatgptSidebarFixture.ts` rebuilds
 * from a live capture. Unlike every other site's folders, ChatGPT's are on
 * until the user turns them off, so a page with no stored plugin state runs them.
 *
 * Each test file mocks `webextension-polyfill` to read `globalThis.chrome.storage`.
 */
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import type { PluginSettings } from '@/features/plugins/types';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';

import { type FixtureRow, makeRows } from './chatgpt/chatgptSidebarFixture';

export const PLUGIN_ID = 'voyager.chatgpt-folders';
export const SECTION = '.gv-chatgpt-folder-section';
export const FAB = '.gv-floating-fab';
export const PANEL = '.gv-floating-folder-panel';
export const PICKER = '.gv-chatgpt-folder-picker';
export const ENTRY = '[data-gv-chatgpt-move-to-folder]';
export const FILED_ATTRIBUTE = 'data-gv-chatgpt-filed';
export const HIDE_STYLE = 'style[data-gv-chatgpt-hide-filed]';

export const ROWS = makeRows(4);
export const [FILED, TARGET, OTHER, FILED_LEGACY] = ROWS;

export const ref = (row: FixtureRow, title = row.title, origin = 'https://chatgpt.com') => ({
  conversationId: `chatgpt:conv:${row.id}`,
  title,
  url: `${origin}/c/${row.id}`,
  addedAt: 1,
});

/**
 * What an earlier build stored: a chat under an old title, one filed on
 * chat.openai.com, and a cleared colour in ChatGPT's own `'default'` shape.
 */
export const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Thesis', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
    {
      id: 'f2',
      name: 'Reading',
      parentId: null,
      isExpanded: true,
      createdAt: 1,
      updatedAt: 1,
      color: 'default',
    },
  ],
  folderContents: {
    f1: [ref(FILED, 'Old title'), ref(FILED_LEGACY, FILED_LEGACY.title, 'https://chat.openai.com')],
    f2: [],
    [ROOT_CONVERSATIONS_ID]: [],
  },
};

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

const pluginsState = (enabled: boolean, settings?: PluginSettings) => ({
  [PLUGIN_ID]: { enabled, installedAt: 1, ...(settings ? { settings } : {}) },
});

/**
 * Fresh storage with ChatGPT's earlier data and its guide seen. `enabled`
 * stores the user's choice; `undefined` stores none, as for a user who never
 * touched the plugin.
 */
export function installStorage(
  enabled: boolean | undefined,
  settings?: PluginSettings,
  data: FolderData = DATA,
): MemoryStorage {
  const memory = createMemoryStorage();
  original ??= globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, structuredClone(data));
  if (enabled !== undefined) {
    memory.values.local.set(StorageKeys.PLUGINS_STATE, pluginsState(enabled, settings));
  }
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
    stored: () => memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT) as FolderData,
    setPlugin: async (enabled, settings) => {
      await memory.api.local.set({ [StorageKeys.PLUGINS_STATE]: pluginsState(enabled, settings) });
    },
    close: async () => {
      host.stop();
      await nextPass();
    },
  };
}

/** The ids of the Recents rows the hiding rule hides; jsdom does not cascade `:has()`, so this matches it. */
export function hiddenIds(): string[] {
  const css = document.querySelector(HIDE_STYLE)?.textContent ?? '';
  const selector = css.slice(0, css.lastIndexOf('{')).trim();
  if (!selector) return [];
  return [...document.querySelectorAll(selector)].map((row) =>
    row.getAttribute('data-sidebar-chatgpt-conversation-key')!.replace('chatgpt:conversation:', ''),
  );
}
