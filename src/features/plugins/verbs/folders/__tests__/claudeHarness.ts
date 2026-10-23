/**
 * Claude's folders as the page runs them: the bundled catalog plugin mounted by
 * `PluginHost` on Claude's bundled `site.json`, over an in-memory
 * `chrome.storage`. The sidebar is Claude's as observed live (2026-10-19),
 * reduced to what the folders read: test ids, row keys, router links, the row's
 * menu trigger, and the Base UI row menu portaled to `body`. Classes are left
 * out on purpose: nothing may depend on them.
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

export const PLUGIN_ID = 'voyager.claude-folders';
export const GUIDE_ID = 'claude-folders-sidebar-intro-v1';
export const SECTION = '.gv-claude-folder-section';
export const FAB = '.gv-floating-fab';
export const PANEL = '.gv-floating-folder-panel';
export const PICKER = '.gv-chatgpt-folder-picker';
export const ENTRY = '[data-gv-claude-move-to-folder]';
export const FILED_ATTRIBUTE = 'data-gv-claude-filed';

export interface Row {
  readonly id: string;
  readonly title: string;
}

const rows = (count: number, from: number): Row[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `0000000${from + i}-f3df-4f6e-b536-f875148e3766`,
    title: `Chat ${from + i}`,
  }));

/** A pinned chat, a chat inside a Project, and Recents. */
export const PINNED = rows(1, 0)[0];
export const IN_PROJECT = rows(1, 5)[0];
export const RECENTS = rows(3, 1);

export const ref = (row: Row, title = row.title) => ({
  conversationId: `claude:conv:${row.id}`,
  title,
  url: `https://claude.ai/chat/${row.id}`,
  addedAt: 1,
});

/** What an earlier build stored: the first Recents row under an old title, and the pinned chat. */
export const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Thesis', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
    { id: 'f2', name: 'Reading', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: {
    f1: [ref(RECENTS[0], 'Old title'), ref(PINNED), ref(IN_PROJECT)],
    f2: [],
    [ROOT_CONVERSATIONS_ID]: [],
  },
};

function row({ id, title }: Row): string {
  return `<div data-row-key="chat:${id}"><div><div id="base-ui-row-${id}"><div data-row>
    <a href="/chat/${id}" draggable="false" data-row-main-button><span data-row-label="iconless"><span dir="auto">${title}</span></span></a>
    <div><button type="button" id="trigger-${id}" aria-haspopup="menu" aria-expanded="false" data-row-action aria-label="More options for ${title}"></button></div>
  </div></div></div></div>`;
}

const MENU_ITEMS = [
  ['star-chat-trigger', 'Pin', 'P', false],
  ['toggle-chat-read-trigger', 'Mark as unread', 'U', false],
  ['rename-chat-trigger', 'Rename', 'R', false],
  ['move-to-project-trigger', 'Add to project', '', true],
  ['move-to-group-trigger', 'Move to group', '', true],
  ['delete-chat-trigger', 'Delete', 'D', false],
] as const;

function menuMarkup(): string {
  return MENU_ITEMS.map(
    ([testid, label, key, submenu]) =>
      `<div role="menuitem" tabindex="-1" data-testid="${testid}" data-cds-icon-row${submenu ? ' aria-haspopup="menu"' : ''}${key ? ` aria-keyshortcuts="${key.toLowerCase()}"` : ''}><span><span data-cds="Icon" aria-hidden="true" style="font-size: 16px"><svg viewBox="0 0 20 20"></svg></span></span><span>${label}</span>${key ? `<span aria-hidden="true" data-cds="Shortcut"><kbd>${key}</kbd></span>` : ''}</div>`,
  ).join('');
}

export interface ClaudeSidebar {
  readonly sidebar: HTMLElement;
  readonly recents: HTMLElement;
  /**
   * Opens conversation `id`'s row menu as Base UI does: a press (or Enter) on
   * its trigger, then a menu portaled to `body` and labelled by that trigger.
   * Given `reuse`, Base UI's closed menu is opened again for this row instead.
   */
  openMenu(id: string, options?: { key?: boolean; reuse?: HTMLElement }): HTMLElement;
  /** Marks conversation `id` as the open one. */
  setCurrent(id: string): void;
}

/** Claude's sidebar, plus a Project's page listing its chat outside the sidebar. */
export function mountSidebar(): ClaudeSidebar {
  const aside = document.createElement('aside');
  aside.setAttribute('aria-label', 'Sidebar');
  aside.innerHTML = `<div data-testid="sidebar"><div><div data-mode="cowork">
    <div data-testid="sidebar-pinned">${row(PINNED)}
      <div data-row-key="project:p1"><a href="/project/p1">Project</a><div>${row(IN_PROJECT)}</div></div>
    </div>
    <div data-testid="sidebar-recents"><div><div data-row-key="label:recents"><span data-group-name>Recents</span></div>${RECENTS.map(row).join('')}</div></div>
  </div></div></div>`;
  const projectPage = document.createElement('main');
  projectPage.innerHTML = `<div data-row-key="chat:${IN_PROJECT.id}"><a href="/chat/${IN_PROJECT.id}">${IN_PROJECT.title}</a></div>`;
  document.body.append(aside, projectPage);
  const trigger = (id: string) => document.getElementById(`trigger-${id}`)!;
  return {
    sidebar: aside.querySelector<HTMLElement>('[data-testid="sidebar"]')!,
    recents: aside.querySelector<HTMLElement>('[data-testid="sidebar-recents"]')!,
    openMenu(id, { key = false, reuse } = {}) {
      const opener = trigger(id);
      if (key) {
        opener.focus();
        opener.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      } else {
        opener.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
      }
      if (reuse) {
        reuse.removeAttribute('data-closed');
        reuse.setAttribute('data-open', '');
        reuse.setAttribute('aria-labelledby', opener.id);
        return reuse;
      }
      const portal = document.createElement('div');
      portal.setAttribute('data-base-ui-portal', '');
      portal.innerHTML = `<div role="presentation"><div role="menu" data-open aria-labelledby="${opener.id}"><div data-cds-sheet-scroll>${menuMarkup()}</div></div></div>`;
      document.body.append(portal);
      const menu = portal.querySelector<HTMLElement>('[role="menu"]')!;
      // Base UI keeps a closed menu mounted and hands focus back to the trigger it is labelled by.
      menu.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        menu.removeAttribute('data-open');
        menu.setAttribute('data-closed', '');
        document.getElementById(menu.getAttribute('aria-labelledby') ?? '')?.focus();
      });
      return menu;
    },
    setCurrent(id) {
      for (const link of aside.querySelectorAll('a[aria-current]')) {
        link.removeAttribute('aria-current');
      }
      aside.querySelector(`a[href="/chat/${id}"]`)?.setAttribute('aria-current', 'page');
    },
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

const pluginsState = (enabled: boolean, settings?: PluginSettings) => ({
  [PLUGIN_ID]: { enabled, installedAt: 1, ...(settings ? { settings } : {}) },
});

/** Fresh storage with Claude's earlier data, its guide seen and the plugin `enabled`. */
export function installStorage(
  enabled: boolean,
  settings?: PluginSettings,
  data: FolderData = DATA,
): MemoryStorage {
  const memory = createMemoryStorage();
  original ??= globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  memory.values.sync.set(StorageKeys.COACHMARKS_SEEN, [GUIDE_ID]);
  memory.values.local.set(StorageKeys.FOLDER_DATA_CLAUDE, structuredClone(data));
  memory.values.local.set(StorageKeys.PLUGINS_STATE, pluginsState(enabled, settings));
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
    stored: () => memory.values.local.get(StorageKeys.FOLDER_DATA_CLAUDE) as FolderData,
    setPlugin: async (enabled, settings) => {
      await memory.api.local.set({ [StorageKeys.PLUGINS_STATE]: pluginsState(enabled, settings) });
    },
    close: async () => {
      host.stop();
      await nextPass();
    },
  };
}
