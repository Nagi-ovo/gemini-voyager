// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://claude.ai/recents" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { initI18n } from '@/utils/i18n';

import {
  type MemoryStorage,
  createMemoryStorage,
  settle,
} from '../../chatgptFolders/__tests__/memoryStorage';
import { HIDE_FILED_SETTING } from '../../siteFolders/hideFiled';
import { CLAUDE_FOLDERS_GUIDE_ID, CLAUDE_SITE_FOLDERS } from '../claudeSiteFolders';
import { activateClaudeFolders } from '../index';
import { type ClaudeSidebarFixture, claudeRows, mountClaudeSidebar } from './claudeSidebarFixture';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id' },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const SECTION = '.gv-claude-folder-section';
const ENTRY = '[data-gv-claude-move-to-folder]';
const PINNED = claudeRows(1, 0);
const RECENTS = claudeRows(3, 1);
const [FILED, TARGET] = RECENTS;
const ref = (row: { id: string; title: string }, title = row.title) => ({
  conversationId: `claude:conv:${row.id}`,
  title,
  url: `https://claude.ai/chat/${row.id}`,
  addedAt: 1,
});
const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Thesis', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
    { id: 'f2', name: 'Reading', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: {
    f1: [ref(FILED, 'Old title'), ref(PINNED[0])],
    f2: [],
    [ROOT_CONVERSATIONS_ID]: [],
  },
};

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;
let sidebar: ClaudeSidebarFixture;

async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
}

const stored = () => memory.values.local.get(StorageKeys.FOLDER_DATA_CLAUDE) as FolderData;

function pick(name: string): void {
  const picker = document.querySelector<HTMLElement>('.gv-chatgpt-folder-picker')?.shadowRoot;
  const item = [...(picker?.querySelectorAll<HTMLButtonElement>('.item') ?? [])].find(
    (button) => button.querySelector('.name')?.textContent === name,
  );
  if (!item) throw new Error(`no folder ${name}`);
  item.click();
}

async function activate(settings = {}): Promise<void> {
  await activateClaudeFolders(scope, settings);
  await nextPass();
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
  memory.values.sync.set(StorageKeys.COACHMARKS_SEEN, [CLAUDE_FOLDERS_GUIDE_ID]);
  memory.values.local.set(StorageKeys.FOLDER_DATA_CLAUDE, structuredClone(DATA));
  scope = new PluginScope();
  sidebar = mountClaudeSidebar(PINNED, RECENTS);
});

afterEach(async () => {
  await scope.dispose();
  sidebar.destroy();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
  vi.restoreAllMocks();
});

describe('Claude folders', () => {
  it("sits just above Recents and links filed chats to Claude's routes", async () => {
    await activate();

    const section = document.querySelector<HTMLElement>(SECTION)!;
    expect(section.nextElementSibling).toBe(sidebar.recents);
    const titles = [
      ...section.shadowRoot!.querySelectorAll<HTMLAnchorElement>(
        'a.gv-floating-folder-panel__conv-title',
      ),
    ];
    expect(titles.map((title) => title.getAttribute('href'))).toContain(
      `https://claude.ai/chat/${FILED.id}`,
    );
  });

  it("keeps Claude's bucket apart and takes the titles its rows show", async () => {
    await activate();
    await settle(20);

    expect(stored().folderContents.f1?.[0]?.title).toBe(FILED.title);
    expect(memory.values.local.has(StorageKeys.FOLDER_DATA_CHATGPT)).toBe(false);
  });

  it('adds "Move to folder" after Claude\'s submenus and files the row into the picked folder', async () => {
    await activate();

    const menu = sidebar.openMenu(TARGET.id);
    await nextPass();

    const labels = [...menu.querySelectorAll('[role="menuitem"]')].map((item) => item.textContent);
    expect(labels).toEqual([
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

    entry.click();
    expect(menu.hasAttribute('data-open')).toBe(false);
    await nextPass();
    pick('Reading');
    await settle(20);

    expect(stored().folderContents.f2).toEqual([
      expect.objectContaining({
        conversationId: `claude:conv:${TARGET.id}`,
        title: TARGET.title,
        url: `https://claude.ai/chat/${TARGET.id}`,
      }),
    ]);
  });

  it('leaves the entry out of a menu that belongs to no chat row', async () => {
    await activate();
    const menu = sidebar.openMenu(TARGET.id);
    menu.setAttribute('aria-labelledby', 'account-menu');
    await nextPass();

    expect(menu.querySelector(ENTRY)).toBeNull();
  });

  it('hides filed chats from Recents only, never the open chat or a pinned one', async () => {
    sidebar.setCurrent(TARGET.id);
    memory.values.local.set(StorageKeys.FOLDER_DATA_CLAUDE, {
      ...structuredClone(DATA),
      folderContents: { ...DATA.folderContents, f2: [ref(TARGET)] },
    });
    await activate({ [HIDE_FILED_SETTING]: true });

    const shown = (id: string) =>
      getComputedStyle(document.querySelector(`[data-row-key="chat:${id}"]`)!).display !== 'none';
    expect(shown(FILED.id)).toBe(false);
    expect(shown(TARGET.id)).toBe(true);
    expect(shown(PINNED[0].id)).toBe(true);
    expect(shown(RECENTS[2].id)).toBe(true);
  });

  it('files the open chat under the title its row shows, and nothing on another page', () => {
    history.replaceState(null, '', `/chat/${TARGET.id}`);
    expect(CLAUDE_SITE_FOLDERS.page.current('Untitled')).toEqual(
      expect.objectContaining({ conversationId: `claude:conv:${TARGET.id}`, title: TARGET.title }),
    );
    history.replaceState(null, '', '/new');
    expect(CLAUDE_SITE_FOLDERS.page.current('Untitled')).toBeNull();
  });
});
