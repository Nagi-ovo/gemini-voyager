// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
/**
 * Renaming a filed chat from the sidebar section goes through ChatGPT's own
 * rename (the row's "Chat actions" menu, then Rename), as Gemini's folders use
 * Gemini's, so the folders keep ChatGPT's name. With "hide filed chats" on, the
 * hidden row shows while ChatGPT's name field is in it.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import {
  type TreeDriver,
  menuItem,
  menuItemLabels,
  openMenu,
  treeDriver,
} from '@/pages/content/folder/floatingTree/__tests__/treeDriver';
import { initI18n } from '@/utils/i18n';

import { FILED_ROW_ATTRIBUTE, HIDE_FILED_SETTING } from '../chatgptHideFiled';
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

const KEY = StorageKeys.FOLDER_DATA_CHATGPT;
const ROWS = makeRows(3).map((row, index) => ({
  ...row,
  title: ['Alpha', 'Beta', 'Gamma'][index],
}));
/** Filed, but on a history page the sidebar has not loaded. */
const UNLOADED_ID = 'unloaded-chat';

function ref(id: string, title: string, extra: Record<string, unknown> = {}) {
  return {
    conversationId: `chatgpt:conv:${id}`,
    title,
    url: `https://chatgpt.com/c/${id}`,
    addedAt: 1,
    ...extra,
  };
}

function data(alpha: Record<string, unknown> = {}): FolderData {
  return {
    folders: [
      {
        id: 'work',
        name: 'Work',
        parentId: null,
        isExpanded: true,
        createdAt: 1,
        updatedAt: 1,
      },
    ],
    folderContents: {
      work: [ref(ROWS[0].id, 'Alpha', alpha), ref(UNLOADED_ID, 'Older chat')],
      [ROOT_CONVERSATIONS_ID]: [ref(ROWS[1].id, 'Beta')],
    },
  };
}

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;
let sidebar: SidebarFixture;

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
  memory.values.local.set(KEY, data());
  scope = new PluginScope();
  sidebar = mountSidebarFixture(ROWS);
});

afterEach(async () => {
  await scope.dispose();
  sidebar.destroy();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
});

async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
}

/** Long enough for the menu to open and the name field to take focus. */
async function frames(count = 4): Promise<void> {
  for (let i = 0; i < count; i += 1) await nextPass();
}

async function activate(hideFiled = false): Promise<TreeDriver> {
  await activateChatGptFolders(scope, hideFiled ? { [HIDE_FILED_SETTING]: true } : {});
  await nextPass();
  const host = document.querySelector<HTMLElement>('.gv-chatgpt-folder-section');
  if (!host?.shadowRoot) throw new Error('the folder section is not mounted');
  return treeDriver({ root: host.shadowRoot, rootBucketId: ROOT_CONVERSATIONS_ID });
}

function titleOf(view: TreeDriver, bucket: string, title: string): HTMLElement {
  return view.conversationRow(bucket, title).querySelector<HTMLElement>('[dir="auto"]')!;
}

function stored(): FolderData {
  return memory.values.local.get(KEY) as FolderData;
}

function folderWrites(): number {
  return memory.writes.filter((write) => write.area === 'local' && write.key === KEY).length;
}

/** Types in ChatGPT's name field and presses Enter, as a user saves the name. */
function saveName(name: string): void {
  const field = sidebar.nameField()!;
  field.value = name;
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

/** Whether "hide filed chats" hides the row now; jsdom does not cascade `:has()`. */
function isHidden(id: string): boolean {
  const css = document.querySelector('style[data-gv-chatgpt-hide-filed]')?.textContent ?? '';
  const selector = css.slice(0, css.lastIndexOf('{')).trim();
  return !!selector && sidebar.row(id).matches(selector);
}

describe('ChatGPT folder section: renaming a filed chat', () => {
  it("opens ChatGPT's own name field on double-click, and the folder follows the name", async () => {
    const view = await activate();

    titleOf(view, 'work', 'Alpha').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true, composed: true }),
    );
    await frames();

    const field = sidebar.nameField();
    expect(field).not.toBeNull();
    expect(sidebar.row(ROWS[0].id).contains(document.activeElement)).toBe(true);
    expect(document.querySelector('[role="menu"]')).toBeNull();

    saveName('Alpha, renamed');
    await frames(2);

    expect(view.outline()).toContain('  · Alpha, renamed');
    expect(stored().folderContents.work[0].title).toBe('Alpha, renamed');
  });

  it('offers Rename on right-click, which opens the same name field', async () => {
    const view = await activate();

    view.conversationRow(ROOT_CONVERSATIONS_ID, 'Beta').dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: 40,
        clientY: 60,
      }),
    );
    expect(menuItemLabels()).toEqual(['Rename']);

    menuItem('Rename').click();
    await frames();

    expect(openMenu()).toBeNull();
    expect(sidebar.row(ROWS[1].id).contains(sidebar.nameField())).toBe(true);
    saveName('Beta, renamed');
    await frames(2);
    expect(view.outline()).toContain('· Beta, renamed');
  });

  it('lets ChatGPT name a chat again after the folder held a title of its own', async () => {
    memory.values.local.set(KEY, data({ title: 'My own name', customTitle: true }));
    const view = await activate();
    expect(view.outline()).toContain('  · My own name');

    titleOf(view, 'work', 'My own name').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true, composed: true }),
    );
    await frames();
    saveName('Alpha, renamed');
    await frames(2);

    const alpha = stored().folderContents.work[0];
    expect(alpha.customTitle).toBeUndefined();
    expect(alpha.title).toBe('Alpha, renamed');
  });

  it('writes nothing when the first plain item of the menu is not Rename', async () => {
    sidebar.destroy();
    sidebar = mountSidebarFixture(ROWS, { menuItems: ['Pin', 'Rename', 'Share'] });
    memory.values.local.set(KEY, data({ title: 'My own name', customTitle: true }));
    const view = await activate();
    const writes = folderWrites();

    titleOf(view, 'work', 'My own name').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true, composed: true }),
    );
    await frames(12);

    expect(sidebar.nameField()).toBeNull();
    expect(folderWrites()).toBe(writes);
    expect(stored().folderContents.work[0]).toMatchObject({
      title: 'My own name',
      customTitle: true,
    });
    expect(view.outline()).toContain('  · My own name');
  });

  it('does nothing for a filed chat the sidebar has not loaded', async () => {
    const view = await activate();
    const writes = folderWrites();

    titleOf(view, 'work', 'Older chat').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true, composed: true }),
    );
    await frames();

    expect(sidebar.nameField()).toBeNull();
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(folderWrites()).toBe(writes);
  });
});

describe('ChatGPT folder section: renaming with filed chats hidden', () => {
  it('shows the hidden row while its name field is open, then hides it again', async () => {
    const view = await activate(true);
    expect(isHidden(ROWS[0].id)).toBe(true);

    titleOf(view, 'work', 'Alpha').dispatchEvent(
      new MouseEvent('dblclick', { bubbles: true, cancelable: true, composed: true }),
    );
    // ChatGPT's menu is open for the row, which shows until the field has focus.
    expect(document.querySelector('[role="menu"]')).not.toBeNull();
    expect(isHidden(ROWS[0].id)).toBe(false);
    await frames();

    expect(sidebar.row(ROWS[0].id).contains(sidebar.nameField())).toBe(true);
    // Marked again, and still shown while the field has focus.
    expect(sidebar.row(ROWS[0].id).hasAttribute(FILED_ROW_ATTRIBUTE)).toBe(true);
    expect(isHidden(ROWS[0].id)).toBe(false);

    saveName('Alpha, renamed');
    await frames(2);

    expect(isHidden(ROWS[0].id)).toBe(true);
    expect(view.outline()).toContain('  · Alpha, renamed');
  });

  it('opens Rename from right-click on a hidden row too', async () => {
    const view = await activate(true);
    expect(isHidden(ROWS[1].id)).toBe(true);

    view
      .conversationRow(ROOT_CONVERSATIONS_ID, 'Beta')
      .dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true }),
      );
    menuItem('Rename').click();
    await frames();

    expect(sidebar.row(ROWS[1].id).contains(sidebar.nameField())).toBe(true);
    expect(isHidden(ROWS[1].id)).toBe(false);

    sidebar.nameField()!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await frames(2);
    expect(isHidden(ROWS[1].id)).toBe(true);
    expect(view.outline()).toContain('· Beta');
  });
});
