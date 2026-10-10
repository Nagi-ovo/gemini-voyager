// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { initI18n } from '@/utils/i18n';

import { ChatGptHideFiled, FILED_ROW_ATTRIBUTE, HIDE_FILED_SETTING } from '../chatgptHideFiled';
import { activateChatGptFolders } from '../index';
import { type SidebarFixture, makeRows, mountSidebarFixture } from './chatgptSidebarFixture';
import { type MemoryStorage, createMemoryStorage, settle } from './memoryStorage';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id' },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const STYLE = 'style[data-gv-chatgpt-hide-filed]';
const ROWS = makeRows(6);

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;
let sidebar: SidebarFixture;

function filed(...rows: typeof ROWS): FolderData {
  return {
    folders: [],
    folderContents: {
      [ROOT_CONVERSATIONS_ID]: rows.map((row) => ({
        conversationId: `chatgpt:conv:${row.id}`,
        title: row.title,
        url: `https://chatgpt.com/c/${row.id}`,
        addedAt: 1,
      })),
    },
  };
}

/** The injected rule's selector; jsdom does not cascade `:has()`, so tests match it. */
function hiddenSelector(): string {
  const css = document.querySelector(STYLE)?.textContent ?? '';
  return css.slice(0, css.lastIndexOf('{')).trim();
}

function hiddenIds(): string[] {
  const selector = hiddenSelector();
  if (!selector) return [];
  return [...document.querySelectorAll(selector)].map((row) =>
    row.getAttribute('data-sidebar-chatgpt-conversation-key')!.replace('chatgpt:conversation:', ''),
  );
}

/** Lets storage reloads, the sidebar observer and its coalesced frame settle. */
async function nextPass(): Promise<void> {
  await settle(30);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
}

beforeAll(async () => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  await initI18n();
  globalThis.chrome.storage = originalStorage;
});

beforeEach(() => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  scope = new PluginScope();
  sidebar = mountSidebarFixture(ROWS);
});

afterEach(async () => {
  await scope.dispose();
  sidebar.destroy();
  document.head.querySelectorAll(STYLE).forEach((style) => style.remove());
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
});

describe('hiding filed chats in Recents', () => {
  it('hides only filed rows, and keeps the open conversation visible', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1], ROWS[3]));
    sidebar.setActive(ROWS[3].id);

    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();

    expect(hiddenIds()).toEqual([ROWS[1].id]);
  });

  it('follows filing and covers rows from later history pages', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1]));
    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();
    const later = makeRows(2, 40);

    memory.external('local', StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1], later[1]));
    await nextPass();
    sidebar.appendPage(later);
    await nextPass();

    expect(hiddenIds().sort()).toEqual([ROWS[1].id, later[1].id].sort());

    memory.external('local', StorageKeys.FOLDER_DATA_CHATGPT, filed());
    await nextPass();
    expect(hiddenIds()).toEqual([]);
    expect(document.querySelectorAll(`[${FILED_ROW_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it('keeps a filed chat visible inside its Project', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[2]));
    const project = sidebar.sidebar.querySelector(
      '[data-app-action-sidebar-section-heading="Projects"] [role="list"]',
    )!;
    const inProject = sidebar.row(ROWS[2].id).cloneNode(true) as HTMLElement;
    inProject.querySelector('a')!.setAttribute('href', `/g/g-p-67ab12cd34-trip/c/${ROWS[2].id}`);
    project.append(inProject);

    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();

    expect(hiddenIds()).toEqual([ROWS[2].id]);
    expect(project.contains(document.querySelectorAll(hiddenSelector())[0])).toBe(false);
  });

  it('hides nothing unless the setting is on, and removes its rule when turned off', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1]));
    await activateChatGptFolders(scope);
    await nextPass();
    expect(document.querySelector(STYLE)).toBeNull();
    expect(document.querySelectorAll(`[${FILED_ROW_ATTRIBUTE}]`)).toHaveLength(0);

    await scope.dispose();
    scope = new PluginScope();
    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();
    expect(hiddenIds()).toEqual([ROWS[1].id]);

    await scope.dispose();
    expect(document.querySelector(STYLE)).toBeNull();
    expect(document.querySelectorAll(`[${FILED_ROW_ATTRIBUTE}]`)).toHaveLength(0);
  });

  it('follows the open chat immediately, including aria-current on the row itself', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1], ROWS[3]));
    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();
    expect(hiddenIds()).toEqual([ROWS[1].id, ROWS[3].id]);

    sidebar.setActive(ROWS[1].id);
    expect(hiddenIds()).toEqual([ROWS[3].id]);
    sidebar.setActive(ROWS[3].id);
    expect(hiddenIds()).toEqual([ROWS[1].id]);
    sidebar.setActive(null);
    sidebar.row(ROWS[1].id).setAttribute('aria-current', 'page');
    expect(hiddenIds()).toEqual([ROWS[3].id]);
  });

  it('clears stale marks when a native row is recycled or stops linking to a chat', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1]));
    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();
    const row = sidebar.row(ROWS[1].id);
    expect(hiddenIds()).toEqual([ROWS[1].id]);

    sidebar.move(ROWS[1].id, `/c/${ROWS[2].id}`);
    await nextPass();
    expect(row.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);
    expect(hiddenIds()).toEqual([]);

    sidebar.move(ROWS[1].id, `/g/g-p-test/c/${ROWS[1].id}`);
    await nextPass();
    expect(hiddenIds()).toEqual([ROWS[1].id]);
    sidebar.move(ROWS[1].id, '/settings');
    await nextPass();
    expect(row.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);

    sidebar.move(ROWS[1].id, `/c/${ROWS[1].id}`);
    await nextPass();
    expect(hiddenIds()).toEqual([ROWS[1].id]);
    row.querySelector('a')!.setAttribute('target', '_blank');
    await nextPass();
    expect(hiddenIds()).toEqual([]);
  });

  it('reconciles rerenders, remounts, and cloned or moved rows outside Recents', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1]));
    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();
    const original = sidebar.row(ROWS[1].id);
    const project = sidebar.sidebar.querySelector(
      '[data-app-action-sidebar-section-heading="Projects"] [role="list"]',
    )!;
    const clone = original.cloneNode(true) as HTMLElement;
    project.append(clone);
    await nextPass();
    expect(clone.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);
    expect(hiddenIds()).toEqual([ROWS[1].id]);

    original.removeAttribute(FILED_ROW_ATTRIBUTE);
    await nextPass();
    expect(hiddenIds()).toEqual([ROWS[1].id]);

    sidebar.rerenderList();
    await nextPass();
    expect(original.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);
    expect(hiddenIds()).toEqual([ROWS[1].id]);

    const beforeRemount = sidebar.row(ROWS[1].id);
    sidebar.replaceSidebar();
    await nextPass();
    expect(beforeRemount.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);
    expect(hiddenIds()).toEqual([ROWS[1].id]);

    const moved = sidebar.row(ROWS[1].id);
    sidebar.sidebar
      .querySelector('[data-app-action-sidebar-section-heading="Projects"]')!
      .append(moved);
    await nextPass();
    expect(moved.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);
    expect(hiddenIds()).toEqual([]);
  });

  it('cleans tracked detached rows and connected clones on teardown', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, filed(ROWS[1]));
    await activateChatGptFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();
    const row = sidebar.row(ROWS[1].id);
    const clone = row.cloneNode(true) as HTMLElement;
    document.body.append(clone);
    row.remove();
    expect(row.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(true);
    expect(clone.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(true);

    await scope.dispose();
    expect(row.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);
    expect(clone.hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(false);
  });

  it('keeps CSS and unchanged row markers untouched as filed ids grow to 10k', async () => {
    const hide = new ChatGptHideFiled(scope);
    hide.update([ROWS[1].id]);
    hide.sync(sidebar.sidebar);
    const mutations: MutationRecord[] = [];
    const observer = new MutationObserver((records) => mutations.push(...records));
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [FILED_ROW_ATTRIBUTE],
    });

    try {
      hide.update([ROWS[1].id, ...makeRows(9999, 40).map(({ id }) => id)]);
      hide.sync(sidebar.sidebar);
      hide.sync(sidebar.sidebar);
      await settle();

      expect(hiddenIds()).toEqual([ROWS[1].id]);
      expect(mutations).toHaveLength(0);

      hide.update([ROWS[3].id]);
      hide.sync(sidebar.sidebar);
      await settle();
      expect(hiddenIds()).toEqual([ROWS[3].id]);
      expect(mutations.map(({ type }) => type)).toEqual(['attributes', 'attributes']);
    } finally {
      observer.disconnect();
    }
  });

  it('accepts only safe ids and never treats stored ids as CSS', () => {
    const hide = new ChatGptHideFiled(scope);
    hide.update([ROWS[1].id, 'abc"], body { display: none } a[x="']);
    hide.sync(sidebar.sidebar);
    expect(hiddenIds()).toEqual([ROWS[1].id]);

    hide.update(['abc"], body { display: none } a[x="']);
    hide.sync(sidebar.sidebar);
    expect(hiddenIds()).toEqual([]);
  });
});
