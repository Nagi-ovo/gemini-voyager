// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { toastDriver } from '@/tests/toastDriver';
import { initI18n } from '@/utils/i18n';

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

const ENTRY = '[data-gv-chatgpt-move-to-folder]';
const PICKER = '.gv-chatgpt-folder-picker';
const ROWS = makeRows(5);
const TARGET = ROWS[3];
const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Work', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
    { id: 'f2', name: 'Trips', parentId: 'f1', isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: { f1: [], f2: [], [ROOT_CONVERSATIONS_ID]: [] },
};

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;
let sidebar: SidebarFixture;

async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
}

function labels(menu: Element): string[] {
  return [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent ?? '');
}

function picker(): ShadowRoot {
  const host = document.querySelector<HTMLElement>(PICKER);
  if (!host?.shadowRoot) throw new Error('picker is not open');
  return host.shadowRoot;
}

function pick(name: string): void {
  const item = [...picker().querySelectorAll<HTMLButtonElement>('.item')].find(
    (button) => button.querySelector('.name')?.textContent === name,
  );
  if (!item) throw new Error(`no folder ${name}`);
  item.click();
}

function stored(folderId: string) {
  return (memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT) as FolderData).folderContents[
    folderId
  ];
}

beforeAll(async () => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  await initI18n();
  globalThis.chrome.storage = originalStorage;
});

beforeEach(async () => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, structuredClone(DATA));
  scope = new PluginScope();
  sidebar = mountSidebarFixture(ROWS);
  await activateChatGptFolders(scope);
  await nextPass();
});

afterEach(async () => {
  await scope.dispose();
  sidebar.destroy();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
});

describe('"Move to folder" in a sidebar row menu', () => {
  it('sits after Move to project once, and files the row into the picked folder', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    // Another sidebar change while the menu is open checks it again.
    sidebar.rename(ROWS[0].id, 'Renamed meanwhile');
    await nextPass();

    expect(labels(menu)).toEqual([
      'Rename',
      'Pin',
      'Move to project',
      'Move to folder',
      'Share',
      'Archive',
      'Delete',
    ]);
    const entry = menu.querySelector<HTMLElement>(ENTRY)!;
    expect(entry.hasAttribute('data-radix-collection-item')).toBe(false);
    expect(entry.className).toBe('gv-test-native-menu-item');

    const escapes = vi.fn();
    menu.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') escapes();
    });
    entry.click();
    expect(escapes).toHaveBeenCalledTimes(1);
    await nextPass();

    pick('Trips');
    await settle(20);
    expect(stored('f2')).toEqual([
      expect.objectContaining({
        conversationId: `chatgpt:conv:${TARGET.id}`,
        title: TARGET.title,
        url: `https://chatgpt.com/c/${TARGET.id}`,
      }),
    ]);
    expect(document.querySelector(PICKER)).toBeNull();
  });

  it('puts the row first in the picked folder', async () => {
    const other = ROWS[0];
    const held = {
      conversationId: `chatgpt:conv:${other.id}`,
      title: other.title,
      url: `https://chatgpt.com/c/${other.id}`,
      addedAt: 1,
      sortIndex: 0,
    };
    await scope.dispose();
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, {
      ...structuredClone(DATA),
      folderContents: { ...DATA.folderContents, f2: [held] },
    });
    scope = new PluginScope();
    await activateChatGptFolders(scope);
    await nextPass();

    sidebar.openMenu(TARGET.id);
    await nextPass();
    document.querySelector<HTMLElement>(ENTRY)!.click();
    await nextPass();
    pick('Trips');
    await settle(20);

    const order = stored('f2').toSorted((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0));
    expect(order.map((c) => c.conversationId)).toEqual([
      `chatgpt:conv:${TARGET.id}`,
      held.conversationId,
    ]);
  });

  it('filing a starred chat into another folder keeps it starred there', async () => {
    const starred = {
      conversationId: `chatgpt:conv:${TARGET.id}`,
      title: TARGET.title,
      url: `https://chatgpt.com/c/${TARGET.id}`,
      addedAt: 1,
      sortIndex: 0,
      starred: true,
    };
    await scope.dispose();
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, {
      ...structuredClone(DATA),
      folderContents: { ...DATA.folderContents, f1: [starred] },
    });
    scope = new PluginScope();
    await activateChatGptFolders(scope);
    await nextPass();

    sidebar.openMenu(TARGET.id);
    await nextPass();
    document.querySelector<HTMLElement>(ENTRY)!.click();
    await nextPass();
    pick('Trips');
    await settle(20);

    // The new record holds the star itself, so it outlives Work's copy.
    expect(stored('f2')).toEqual([expect.objectContaining({ starred: true })]);
  });

  it('is reachable with the arrow keys and opens the picker with Enter', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    const item = (label: string) =>
      [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
        (candidate) => candidate.textContent === label,
      )!;
    // Radix's handlers are React's, delegated to an ancestor of the menu.
    const radixSaw: string[] = [];
    const radix = (event: KeyboardEvent) => radixSaw.push(event.key);
    document.addEventListener('keydown', radix);
    const press = (key: string) =>
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );

    try {
      item('Move to project').focus();
      press('ArrowDown');
      const entry = menu.querySelector<HTMLElement>(ENTRY)!;
      expect(document.activeElement).toBe(entry);
      expect(entry.hasAttribute('data-highlighted')).toBe(true);
      press('ArrowDown');
      expect(document.activeElement).toBe(item('Share'));
      expect(entry.hasAttribute('data-highlighted')).toBe(false);
      press('ArrowUp');
      expect(document.activeElement).toBe(entry);
      press('ArrowUp');
      expect(document.activeElement).toBe(item('Move to project'));
      // Moves elsewhere in the menu stay Radix's.
      press('ArrowUp');
      expect(radixSaw).toEqual(['ArrowUp']);

      item('Share').focus();
      press('ArrowUp');
      press('Enter');
      expect(radixSaw).toEqual(['ArrowUp', 'Escape']);
      await nextPass();
      expect(document.querySelector(PICKER)).not.toBeNull();
    } finally {
      document.removeEventListener('keydown', radix);
    }
  });

  it('confirms the move in the sidebar section while the floating panel is closed', async () => {
    expect(document.querySelector('.gv-floating-folder-panel')).toBeNull();
    expect(toastDriver.all()).toEqual([]);

    for (const expected of ['Added to folder.', 'Already in this folder.']) {
      const menu = sidebar.openMenu(TARGET.id);
      await nextPass();
      menu.querySelector<HTMLElement>(ENTRY)!.click();
      await nextPass();
      pick('Work');
      await settle(20);
      // Each outcome replaces the one before, as the old status line did.
      expect(toastDriver.messages()).toEqual([expected]);
    }
  });

  it('refuses a folder another tab deleted while the picker was open, and says so', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    menu.querySelector<HTMLElement>(ENTRY)!.click();
    await nextPass();

    const fromOtherTab = structuredClone(DATA);
    fromOtherTab.folders = fromOtherTab.folders.filter((folder) => folder.id !== 'f2');
    delete fromOtherTab.folderContents.f2;
    memory.external('local', StorageKeys.FOLDER_DATA_CHATGPT, fromOtherTab);
    await settle(20);
    const writes = memory.writes.length;

    pick('Trips');
    await settle(20);

    const saved = memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT) as FolderData;
    expect(Object.hasOwn(saved.folderContents, 'f2')).toBe(false);
    expect(memory.writes.length).toBe(writes);
    expect(toastDriver.all()).toMatchObject([
      { message: 'Could not save folder changes. Please try again.', tone: 'error' },
    ]);
  });

  it.each([0, 2])(
    "keeps focus in the picker's search after Radix hands focus back to the trigger (exit frames: %i)",
    async (exitFrames) => {
      const menu = sidebar.openMenu(TARGET.id, { exitFrames });
      await nextPass();
      const trigger = sidebar.row(TARGET.id).querySelector('button[aria-haspopup="menu"]');

      menu.querySelector<HTMLElement>(ENTRY)!.click();
      // The picker waits until the closed menu has returned focus to the trigger.
      expect(document.querySelector(PICKER)).toBeNull();
      for (let frame = 0; frame <= exitFrames; frame += 1) await nextPass();

      const host = document.querySelector(PICKER);
      expect(document.activeElement).toBe(host);
      expect(picker().activeElement).toBe(picker().querySelector('.search'));
      expect(document.activeElement).not.toBe(trigger);
    },
  );

  it('opens no picker when turned off while the menu is still closing', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    menu.querySelector<HTMLElement>(ENTRY)!.click();

    await scope.dispose();
    await nextPass();
    await nextPass();

    expect(document.querySelector(PICKER)).toBeNull();
  });

  it('keeps the Project route of a row inside a Project', async () => {
    sidebar.move(TARGET.id, `/g/g-p-67ab12cd34-trip/c/${TARGET.id}`);
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();

    menu.querySelector<HTMLElement>(ENTRY)!.click();
    await nextPass();
    pick('Work');
    await settle(20);

    expect(stored('f1')[0].url).toBe(`https://chatgpt.com/g/g-p-67ab12cd34-trip/c/${TARGET.id}`);
  });

  it('reaches a menu whose content renders after its trigger opens', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    const portal = menu.closest('body > *')!;
    portal.remove();
    await nextPass();
    expect(menu.querySelector(ENTRY)).toBeNull();

    document.body.append(portal);
    await nextPass();
    await nextPass();

    expect(menu.querySelector(ENTRY)).not.toBeNull();
  });

  it('stops waiting for a menu that never renders', async () => {
    const trigger = sidebar.row(TARGET.id).querySelector('button[aria-haspopup="menu"]')!;
    trigger.setAttribute('aria-expanded', 'true');
    for (let frame = 0; frame < 12; frame += 1) await nextPass();

    const frames = vi.spyOn(window, 'requestAnimationFrame');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(frames).not.toHaveBeenCalled();
    frames.mockRestore();
  });

  it('closes the picker on Escape without filing anything', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    menu.querySelector<HTMLElement>(ENTRY)!.click();
    await nextPass();
    const writes = memory.writes.length;

    picker()
      .querySelector('.dialog')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle(20);

    expect(document.querySelector(PICKER)).toBeNull();
    expect(memory.writes.length).toBe(writes);
  });

  it('narrows folders by path as the user types', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    menu.querySelector<HTMLElement>(ENTRY)!.click();
    await nextPass();

    const search = picker().querySelector<HTMLInputElement>('.search')!;
    search.value = 'work / tri';
    search.dispatchEvent(new Event('input'));

    const shown = [...picker().querySelectorAll('.item')].map((item) =>
      item.getAttribute('aria-label'),
    );
    expect(shown).toEqual(['Work / Trips']);
  });

  it('leaves no entry or picker behind when turned off', async () => {
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    menu.querySelector<HTMLElement>(ENTRY)!.click();
    await nextPass();
    expect(document.querySelector(PICKER)).not.toBeNull();
    // Another row's menu, open with its entry when the plugin turns off.
    const open = sidebar.openMenu(ROWS[1].id);
    await nextPass();
    expect(open.querySelector(ENTRY)).not.toBeNull();

    await scope.dispose();

    expect(open.querySelector(ENTRY)).toBeNull();
    expect(document.querySelector(PICKER)).toBeNull();
  });
});
