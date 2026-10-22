// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chat.deepseek.com/" }
/**
 * DeepSeek's sidebar as observed live (2026-10-19), with neutral classes in
 * place of its build hashes: only `ds-*` names and the conversation links are
 * real, and nothing else may be relied on.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { HIDE_FILED_SETTING } from '@/features/plugins/verbs/folders/hideFiled';
import { fakeTransfer } from '@/pages/content/folder/floatingTree/__tests__/treeDriver';
import { initI18n } from '@/utils/i18n';

import {
  type MemoryStorage,
  createMemoryStorage,
  settle,
} from '../../chatgptFolders/__tests__/memoryStorage';
import { DEEPSEEK_FOLDERS_GUIDE_ID, DEEPSEEK_SITE_FOLDERS } from '../deepseekSiteFolders';
import { activateDeepSeekFolders } from '../index';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id' },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const SECTION = '.gv-deepseek-folder-section';
const ROWS = ['Notes', 'Plans', 'Ideas'].map((title, i) => ({
  id: `08d7829${i}-6c6c-4ea9-b796-1274249b885b`,
  title,
}));
const [FILED, TARGET] = ROWS;
const ref = (row: (typeof ROWS)[number], title = row.title) => ({
  conversationId: `deepseek:conv:${row.id}`,
  title,
  url: `https://chat.deepseek.com/a/chat/s/${row.id}`,
  addedAt: 1,
});
const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Work', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: { f1: [ref(FILED, 'Old title')], [ROOT_CONVERSATIONS_ID]: [] },
};

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;
let list: HTMLElement;

function link(row: (typeof ROWS)[number]): string {
  return `<a class="row" href="/a/chat/s/${row.id}" tabindex="0"><div class="ds-focus-ring"></div><div class="title">${row.title}</div><div><div role="button" class="ds-button"></div></div></a>`;
}

function mountSidebar(): HTMLElement {
  const root = document.createElement('div');
  root.innerHTML = `<div class="sidebar"><div class="logo"></div>
    <div class="ds-scroll-area outer"><div class="ds-scroll-area inner"><div class="list">
      <div class="group"><div class="heading">30 days</div>${link(ROWS[0])}${link(ROWS[1])}</div>
      <div class="group"><div class="heading">2026-09</div>${link(ROWS[2])}</div>
    </div></div></div></div>
    <div class="ds-virtual-list ds-scroll-area"><a href="/a/chat/s/${ROWS[2].id}">a link in a reply</a></div>`;
  document.body.append(root);
  list = root.querySelector<HTMLElement>('.list')!;
  return root.querySelector<HTMLElement>('.sidebar')!;
}

async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
}

const stored = () => memory.values.local.get(StorageKeys.FOLDER_DATA_DEEPSEEK) as FolderData;
const section = () => document.querySelector<HTMLElement>(SECTION)!;

function dragEvent(type: string, transfer: ReturnType<typeof fakeTransfer>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperties(event, { dataTransfer: { value: transfer }, clientY: { value: 10 } });
  return event;
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
  memory.values.sync.set(StorageKeys.COACHMARKS_SEEN, [DEEPSEEK_FOLDERS_GUIDE_ID]);
  memory.values.local.set(StorageKeys.FOLDER_DATA_DEEPSEEK, structuredClone(DATA));
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
});

describe('DeepSeek folders', () => {
  it('sits at the top of the history scroll area and takes the titles its rows show', async () => {
    mountSidebar();
    await activateDeepSeekFolders(scope);
    await nextPass();
    await settle(20);

    expect(section().nextElementSibling).toBe(list);
    expect(section().parentElement?.classList.contains('inner')).toBe(true);
    expect(stored().folderContents.f1?.[0]?.title).toBe(FILED.title);
  });

  it('files a row dragged from the history onto a folder', async () => {
    mountSidebar();
    await activateDeepSeekFolders(scope);
    await nextPass();

    const transfer = fakeTransfer({ 'text/uri-list': 'https://chat.deepseek.com/' });
    document
      .querySelector(`.list a[href$="${TARGET.id}"] .title`)!
      .dispatchEvent(dragEvent('dragstart', transfer));
    const folder = section().shadowRoot!.querySelector<HTMLElement>(
      '.gv-floating-folder-panel__folder-header',
    )!;
    const over = dragEvent('dragover', transfer);
    folder.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    folder.dispatchEvent(dragEvent('drop', transfer));
    await nextPass();

    expect(stored().folderContents.f1.map((entry) => entry.conversationId)).toContain(
      `deepseek:conv:${TARGET.id}`,
    );
  });

  it("files nothing from another page's drag that only looks like one", async () => {
    mountSidebar();
    await activateDeepSeekFolders(scope);
    await nextPass();

    const transfer = fakeTransfer({
      'application/json': JSON.stringify({
        type: 'conversation',
        conversationId: `deepseek:conv:${TARGET.id}`,
        title: 'Spoofed',
        url: `https://evil.example/a/chat/s/${TARGET.id}`,
      }),
    });
    const folder = section().shadowRoot!.querySelector<HTMLElement>(
      '.gv-floating-folder-panel__folder-header',
    )!;
    folder.dispatchEvent(dragEvent('dragover', transfer));
    folder.dispatchEvent(dragEvent('drop', transfer));
    await nextPass();

    expect(stored().folderContents.f1).toHaveLength(1);
  });

  it('hides filed rows from the history when asked', async () => {
    mountSidebar();
    await activateDeepSeekFolders(scope, { [HIDE_FILED_SETTING]: true });
    await nextPass();

    const shown = (id: string) =>
      getComputedStyle(document.querySelector(`.list a[href$="${id}"]`)!).display !== 'none';
    expect(shown(FILED.id)).toBe(false);
    expect(shown(TARGET.id)).toBe(true);
  });

  it('finds no sidebar from a link inside a reply alone', () => {
    document.body.innerHTML = `<div class="ds-virtual-list ds-scroll-area"><a href="/a/chat/s/${TARGET.id}">x</a></div>`;
    expect(DEEPSEEK_SITE_FOLDERS.sidebar.find()).toBeNull();
  });

  it.each([
    ['its sidebar row', `Plans - DeepSeek`, TARGET.title],
    ['the tab title when the row is not listed', 'Trip ideas - DeepSeek', 'Trip ideas'],
    ['the untitled name on the home title', 'DeepSeek - Into the Unknown', 'Untitled'],
  ])('files the open chat under %s', (_name, tabTitle, expected) => {
    if (expected === TARGET.title) mountSidebar();
    document.title = tabTitle;
    history.replaceState(null, '', `/a/chat/s/${TARGET.id}`);
    expect(DEEPSEEK_SITE_FOLDERS.page.current('Untitled')?.title).toBe(expected);
    history.replaceState(null, '', '/');
    expect(DEEPSEEK_SITE_FOLDERS.page.current('Untitled')).toBeNull();
  });
});
