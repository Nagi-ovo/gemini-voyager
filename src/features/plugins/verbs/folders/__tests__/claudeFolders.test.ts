// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://claude.ai/recents" }
/**
 * Claude's folders through the page's own path: `PluginHost`, the bundled
 * catalog plugin and Claude's `site.json` (`claudeHarness.ts`).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { claudeAdapter } from '@/features/plugins/sites/adapters/claude';
import { settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

import { siteFoldersFromData } from '../siteData';
import {
  type ClaudeSidebar,
  DATA,
  ENTRY,
  FAB,
  IN_PROJECT,
  PICKER,
  PINNED,
  type Page,
  RECENTS,
  SECTION,
  installStorage,
  mountSidebar,
  nextPass,
  openPage,
  ref,
  restoreStorage,
} from './claudeHarness';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id', getURL: (path: string) => path },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const [FILED, TARGET, OTHER] = RECENTS;
let page: Page | null = null;

const section = (): HTMLElement => {
  const found = document.querySelectorAll<HTMLElement>(SECTION);
  expect(found).toHaveLength(1);
  return found[0];
};
const shownIn = (root: ParentNode, id: string) =>
  getComputedStyle(root.querySelector(`[data-row-key="chat:${id}"]`)!).display !== 'none';
const shown = (id: string) => shownIn(document.querySelector('[data-testid="sidebar"]')!, id);
const labels = (menu: HTMLElement) =>
  [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
const filedIn = (folder: string) =>
  page!.stored().folderContents[folder].map((entry) => entry.conversationId);

function picker(): ShadowRoot {
  const host = document.querySelector<HTMLElement>(PICKER);
  if (!host?.shadowRoot) throw new Error('no folder picker');
  return host.shadowRoot;
}

function pick(name: string): void {
  const item = [...picker().querySelectorAll<HTMLButtonElement>('.item')].find(
    (button) => button.querySelector('.name')?.textContent === name,
  );
  if (!item) throw new Error(`no folder ${name}`);
  item.click();
}

async function open(enabled = true, settings?: Record<string, boolean>, data = DATA) {
  page = await openPage(installStorage(enabled, settings, data));
  await nextPass();
  return page;
}

let sidebar: ClaudeSidebar;

beforeAll(async () => {
  installStorage(false);
  await initI18n();
  restoreStorage();
});

beforeEach(() => {
  history.replaceState(null, '', '/recents');
  document.title = 'Claude';
});

afterEach(async () => {
  await page?.close();
  page = null;
  document.body.replaceChildren();
  restoreStorage();
  vi.restoreAllMocks();
});

describe('Claude folders', () => {
  it('loads the folders an earlier build stored, unchanged, before the sidebar renders', async () => {
    const { memory } = await open();

    expect(document.querySelector(SECTION)).toBeNull();
    expect(document.querySelector(FAB)).not.toBeNull();
    expect(memory.values.local.get(StorageKeys.FOLDER_DATA_CLAUDE)).toEqual(DATA);
    expect(memory.writes.filter((write) => write.key === StorageKeys.FOLDER_DATA_CLAUDE)).toEqual(
      [],
    );
  });

  it("sits just above Recents, links filed chats to Claude's routes and takes the titles its rows show", async () => {
    sidebar = mountSidebar();
    const { memory, stored } = await open();
    await settle(20);

    expect(section().nextElementSibling).toBe(sidebar.recents);
    const hrefs = [
      ...section().shadowRoot!.querySelectorAll('a.gv-floating-folder-panel__conv-title'),
    ].map((title) => title.getAttribute('href'));
    expect(hrefs).toContain(`https://claude.ai/chat/${FILED.id}`);
    expect(stored().folderContents.f1?.[0]?.title).toBe(FILED.title);
    expect(memory.values.local.has(StorageKeys.FOLDER_DATA_CHATGPT)).toBe(false);
    expect(document.querySelector(FAB)).toBeNull();
  });

  it('adds "Move to folder" after Claude\'s submenus and files the row into the picked folder', async () => {
    sidebar = mountSidebar();
    await open();

    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();

    expect(labels(menu)).toEqual([
      'PinP',
      'Mark as unreadU',
      'RenameR',
      'Add to project',
      'Move to group',
      'Move to folder',
      'DeleteD',
    ]);
    const entry = menu.querySelector<HTMLElement>(ENTRY)!;
    expect(entry.hasAttribute('data-testid')).toBe(false);
    expect(entry.hasAttribute('aria-keyshortcuts')).toBe(false);
    expect(entry.querySelector('kbd, [data-cds="Shortcut"]')).toBeNull();
    // The folder icon takes the size of Claude's own icon holder.
    expect(entry.querySelector('[data-cds="Icon"]')).toBeNull();
    expect(entry.querySelector('svg')?.parentElement?.style.fontSize).toBe('16px');

    entry.click();
    expect(menu.hasAttribute('data-open')).toBe(false);
    await nextPass();
    pick('Reading');
    await settle(20);

    expect(page!.stored().folderContents.f2).toEqual([
      expect.objectContaining({
        conversationId: `claude:conv:${TARGET.id}`,
        title: TARGET.title,
        url: `https://claude.ai/chat/${TARGET.id}`,
      }),
    ]);
  });

  it('leaves the entry out of a menu that belongs to no chat row', async () => {
    sidebar = mountSidebar();
    await open();
    const menu = sidebar.openMenu(TARGET.id);
    menu.setAttribute('aria-labelledby', 'account-menu');
    await nextPass();

    expect(menu.querySelector(ENTRY)).toBeNull();
  });

  it('gives a menu Claude reuses for another row one entry, for that row, and drops the stale one', async () => {
    sidebar = mountSidebar();
    await open();
    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();
    expect(menu.querySelector(ENTRY)?.getAttribute('data-gv-claude-move-to-folder')).toBe(
      TARGET.id,
    );
    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    sidebar.openMenu(OTHER.id, { reuse: menu });
    await nextPass();

    const entries = menu.querySelectorAll<HTMLElement>(ENTRY);
    expect(entries).toHaveLength(1);
    expect(entries[0].getAttribute('data-gv-claude-move-to-folder')).toBe(OTHER.id);
    entries[0].click();
    await nextPass();
    pick('Reading');
    await settle(20);
    expect(filedIn('f2')).toEqual([`claude:conv:${OTHER.id}`]);
  });

  it('is reachable with the arrow keys from a menu opened by keyboard, and Enter files the row', async () => {
    sidebar = mountSidebar();
    await open();
    const menu = sidebar.openMenu(TARGET.id, { key: true });
    await nextPass();
    const item = (label: string) =>
      [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((candidate) =>
        candidate.textContent?.startsWith(label),
      )!;
    const press = (key: string) =>
      (document.activeElement ?? document.body).dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),
      );

    item('Move to group').focus();
    press('ArrowDown');
    const entry = menu.querySelector<HTMLElement>(ENTRY)!;
    expect(document.activeElement).toBe(entry);
    press('ArrowDown');
    expect(document.activeElement).toBe(item('Delete'));
    press('ArrowUp');
    expect(document.activeElement).toBe(entry);
    press('Enter');

    // The menu closed and handed focus back to the row's trigger before the picker took it.
    expect(menu.hasAttribute('data-open')).toBe(false);
    await nextPass();
    expect(picker().activeElement?.classList.contains('search')).toBe(true);
    pick('Thesis');
    await settle(20);
    expect(filedIn('f1')).toContain(`claude:conv:${TARGET.id}`);
  });

  it('hides filed chats from Recents only, never the open chat, a pinned one or a Project chat', async () => {
    sidebar = mountSidebar();
    sidebar.setCurrent(TARGET.id);
    await open(
      true,
      { hideFiledChats: true },
      {
        ...structuredClone(DATA),
        folderContents: { ...DATA.folderContents, f2: [ref(TARGET)] },
      },
    );

    expect(shown(FILED.id)).toBe(false);
    expect(shown(TARGET.id)).toBe(true);
    expect(shown(OTHER.id)).toBe(true);
    expect(shown(PINNED.id)).toBe(true);
    expect(shown(IN_PROJECT.id)).toBe(true);
    expect(shownIn(document.querySelector('main')!, IN_PROJECT.id)).toBe(true);
  });

  it('hides and shows filed chats again as the setting changes, without reloading the folders', async () => {
    sidebar = mountSidebar();
    const { setPlugin } = await open();
    const placed = section();
    expect(shown(FILED.id)).toBe(true);

    await setPlugin(true, { hideFiledChats: true });
    await nextPass();
    expect(shown(FILED.id)).toBe(false);
    expect(shown(PINNED.id)).toBe(true);

    await setPlugin(true, { hideFiledChats: false });
    await nextPass();
    expect(shown(FILED.id)).toBe(true);
    expect(section()).toBe(placed);
  });

  it.each([
    ['its sidebar row', 'Chat 2 - Claude', TARGET.title],
    ['the tab title when the row is not listed', 'Trip ideas - Claude', 'Trip ideas'],
    ['the untitled name on a placeholder', 'New chat - Claude', 'Untitled'],
  ])('files the open chat under %s, and nothing on another page', (_name, tabTitle, expected) => {
    if (expected === TARGET.title) mountSidebar();
    const site = siteFoldersFromData(claudeAdapter)!;
    document.title = tabTitle;
    history.replaceState(null, '', `/chat/${TARGET.id}`);
    expect(site.page.current('Untitled')).toEqual(
      expect.objectContaining({ conversationId: `claude:conv:${TARGET.id}`, title: expected }),
    );
    history.replaceState(null, '', '/new');
    expect(site.page.current('Untitled')).toBeNull();
  });
});
