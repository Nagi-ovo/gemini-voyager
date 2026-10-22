// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
/**
 * ChatGPT's folders through the page's own path: `PluginHost`, the bundled
 * catalog plugin and ChatGPT's `site.json` (`chatgptHarness.ts`).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

import { siteFolderLeases } from '../siteSession';
import { type SidebarFixture, mountSidebarFixture } from './chatgpt/chatgptSidebarFixture';
import {
  DATA,
  ENTRY,
  FAB,
  FILED,
  FILED_LEGACY,
  PICKER,
  type Page,
  ROWS,
  SECTION,
  TARGET,
  hiddenIds,
  installStorage,
  nextPass,
  openPage,
  restoreStorage,
} from './chatgptHarness';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id', getURL: (path: string) => path },
    i18n: { getUILanguage: () => 'en' },
  },
}));

let page: Page | null = null;
let sidebar: SidebarFixture | null = null;

const section = (): HTMLElement => {
  const found = document.querySelectorAll<HTMLElement>(SECTION);
  expect(found).toHaveLength(1);
  return found[0];
};
const labels = (menu: HTMLElement) =>
  [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
const filedIn = (folder: string) =>
  page!.stored().folderContents[folder].map((entry) => entry.conversationId);

function pick(name: string): void {
  const root = document.querySelector<HTMLElement>(PICKER)?.shadowRoot;
  const item = [...(root?.querySelectorAll<HTMLButtonElement>('.item') ?? [])].find(
    (button) => button.querySelector('.name')?.textContent === name,
  );
  if (!item) throw new Error(`no folder ${name}`);
  item.click();
}

async function open(enabled: boolean | undefined, settings?: Record<string, boolean>, data = DATA) {
  page = await openPage(installStorage(enabled, settings, data));
  await nextPass();
  return page;
}

beforeAll(async () => {
  installStorage(false);
  await initI18n();
  restoreStorage();
});

beforeEach(() => {
  history.replaceState(null, '', '/');
  document.title = 'ChatGPT';
});

afterEach(async () => {
  await page?.close();
  page = null;
  sidebar?.destroy();
  sidebar = null;
  document.body.replaceChildren();
  restoreStorage();
  vi.restoreAllMocks();
});

describe('ChatGPT folders', () => {
  it('run for a user who never turned them on or off, and load the stored folders without a write', async () => {
    const { memory } = await open(undefined);

    expect(document.querySelector(FAB)).not.toBeNull();
    expect(memory.values.local.has(StorageKeys.PLUGINS_STATE)).toBe(false);
    expect(memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT)).toEqual(DATA);
    expect(memory.writes.filter((write) => write.key === StorageKeys.FOLDER_DATA_CHATGPT)).toEqual(
      [],
    );
  });

  it('stay off once the user turned them off', async () => {
    sidebar = mountSidebarFixture(ROWS);
    await open(false);

    expect(document.querySelector(SECTION)).toBeNull();
    expect(document.querySelector(FAB)).toBeNull();
    expect(siteFolderLeases('chatgpt')).toBe(0);
  });

  it('sit just above Recents, outside its Project drop target, and link a chat filed on chat.openai.com where it was filed', async () => {
    sidebar = mountSidebarFixture(ROWS);
    const { stored } = await open(undefined);
    await settle(20);

    expect(
      section().nextElementSibling?.matches('[data-chatgpt-project-conversation-drop-target]'),
    ).toBe(true);
    const hrefs = [
      ...section().shadowRoot!.querySelectorAll('a.gv-floating-folder-panel__conv-title'),
    ].map((title) => title.getAttribute('href'));
    expect(hrefs).toEqual([
      `https://chatgpt.com/c/${FILED.id}`,
      `https://chat.openai.com/c/${FILED_LEGACY.id}`,
    ]);
    // Title sync takes the row's title; the cleared colour keeps ChatGPT's stored shape.
    expect(stored().folderContents.f1[0].title).toBe(FILED.title);
    expect(stored().folders[1].color).toBe('default');
    expect(document.querySelector(FAB)).toBeNull();
  });

  it('add "Move to folder" after Move to project and file the row into the picked folder', async () => {
    sidebar = mountSidebarFixture(ROWS);
    await open(undefined);

    const menu = sidebar.openMenu(TARGET.id);
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
    entry.click();
    await nextPass();
    pick('Reading');
    await settle(20);

    expect(filedIn('f2')).toEqual([`chatgpt:conv:${TARGET.id}`]);
    expect(page!.stored().folderContents.f2[0]).toMatchObject({
      title: TARGET.title,
      url: `https://chatgpt.com/c/${TARGET.id}`,
    });
  });

  it('hide filed chats from Recents without a reload, in a tab that draws no frames, never the open one', async () => {
    sidebar = mountSidebarFixture(ROWS);
    sidebar.setActive(FILED_LEGACY.id);
    const { setPlugin } = await open(undefined);
    const placed = section();
    expect(hiddenIds()).toEqual([]);

    // A hidden or covered tab runs no animation frames, but storage changes still arrive.
    const frames = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    try {
      await setPlugin(true, { hideFiledChats: true });
      for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(hiddenIds()).toEqual([FILED.id]);

      await setPlugin(true, { hideFiledChats: false });
      for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
      expect(hiddenIds()).toEqual([]);
    } finally {
      frames.mockRestore();
    }
    expect(section()).toBe(placed);
  });
});
