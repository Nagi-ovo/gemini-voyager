// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
/**
 * Multi-select in ChatGPT's folder section, against its real store and
 * storage: a long press selects filed chats, which then drag or leave their
 * folder together, as on Gemini.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import {
  type FakeTransfer,
  type TreeDriver,
  isShown,
  treeDriver,
} from '@/pages/content/folder/floatingTree/__tests__/treeDriver';
import { confirmDriver } from '@/tests/confirmDriver';
import { initI18n, getTranslationSyncUnsafe as t } from '@/utils/i18n';

import { activateChatGptFolders } from '../index';
import { type SidebarFixture, makeRows, mountSidebarFixture } from './chatgptSidebarFixture';
import { type MemoryStorage, createMemoryStorage, settle as settleStorage } from './memoryStorage';

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
const ROOT = ROOT_CONVERSATIONS_ID;
const SELECTED = 'gv-floating-folder-panel__conv--selected';
const LONG_PRESS_MS = 500;

function ref(id: string, title: string, sortIndex: number) {
  return {
    conversationId: `chatgpt:conv:${id}`,
    title,
    url: `https://chatgpt.com/c/${id}`,
    addedAt: 1,
    sortIndex,
  };
}

function folder(id: string, name: string, sortIndex: number) {
  return { id, name, parentId: null, isExpanded: true, sortIndex, createdAt: 1, updatedAt: 1 };
}

const DATA: FolderData = {
  folders: [folder('work', 'Work', 0), folder('personal', 'Personal', 1)],
  folderContents: {
    work: [ref('a', 'Alpha', 0), ref('b', 'Beta', 1), ref('c', 'Gamma', 2)],
    personal: [ref('d', 'Delta', 0)],
    [ROOT]: [],
  },
};

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
  memory.values.local.set(KEY, structuredClone(DATA));
  scope = new PluginScope();
  sidebar = mountSidebarFixture(makeRows(2));
});

afterEach(async () => {
  await scope.dispose();
  sidebar.destroy();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
  vi.restoreAllMocks();
});

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

async function nextPass(): Promise<void> {
  await settleStorage(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settleStorage(20);
}

type Section = { view: TreeDriver; root: ShadowRoot };

async function activate(): Promise<Section> {
  await activateChatGptFolders(scope);
  await nextPass();
  const host = document.querySelector<HTMLElement>('.gv-chatgpt-folder-section');
  if (!host?.shadowRoot) throw new Error('the folder section is not mounted');
  return { view: treeDriver({ root: host.shadowRoot, rootBucketId: ROOT }), root: host.shadowRoot };
}

function stored(): FolderData {
  return memory.values.local.get(KEY) as FolderData;
}

function titles(bucketId: string): string[] {
  return [...stored().folderContents[bucketId]]
    .sort((x, y) => (x.sortIndex ?? 0) - (y.sortIndex ?? 0))
    .map((c) => c.title);
}

function mouse(target: Element, type: string): MouseEvent {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: 0,
  });
  target.dispatchEvent(event);
  return event;
}

function titleOf(row: HTMLElement): HTMLElement {
  return row.querySelector<HTMLElement>('a[dir="auto"], button[dir="auto"]')!;
}

/** Holds the pointer on a chat until multi-select starts, then lets go. */
async function longPress(row: HTMLElement): Promise<MouseEvent> {
  const title = titleOf(row);
  mouse(title, 'mousedown');
  await wait(LONG_PRESS_MS + 20);
  mouse(title, 'mouseup');
  const click = mouse(title, 'click');
  // The outside-click watch starts a turn after the press.
  await wait(0);
  return click;
}

function click(row: HTMLElement): MouseEvent {
  const title = titleOf(row);
  mouse(title, 'mousedown');
  mouse(title, 'mouseup');
  return mouse(title, 'click');
}

/** The selection bar while it shows (the section's sheet keys it off the mode class). */
function toolbar(section: Section): HTMLElement | null {
  const bar = section.root.querySelector<HTMLElement>('.gv-chatgpt-folder-section__selection');
  if (!bar?.classList.contains('gv-multi-select-mode') || !isShown(bar)) return null;
  return bar.querySelector<HTMLElement>('[role="toolbar"]');
}

function selectedTitles(section: Section): string[] {
  return [...section.root.querySelectorAll<HTMLElement>(`.${SELECTED}`)].map(
    (row) => titleOf(row).textContent?.trim() ?? '',
  );
}

function dragEvent(type: string, transfer: FakeTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  Object.defineProperty(event, 'clientY', { value: 20 });
  return event;
}

/** Drops on the middle of `target`, which files into its folder. */
function dropInto(target: HTMLElement, transfer: FakeTransfer): void {
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, bottom: 40, height: 40, left: 0, right: 200, width: 200 }),
  });
  target.dispatchEvent(dragEvent('dragover', transfer));
  target.dispatchEvent(dragEvent('drop', transfer));
}

async function selectAlphaAndBeta(section: Section): Promise<void> {
  const { view } = section;
  const release = await longPress(view.conversationRow('work', 'Alpha'));
  // Ending the long press opens nothing.
  expect(release.defaultPrevented).toBe(true);
  expect(click(view.conversationRow('work', 'Beta')).defaultPrevented).toBe(true);
}

describe('ChatGPT folder section: multi-select', () => {
  it('selects chats by long press and click, and counts them in a bar atop the tree', async () => {
    const section = await activate();
    expect(toolbar(section)).toBeNull();

    await selectAlphaAndBeta(section);

    expect(selectedTitles(section)).toEqual(['Alpha', 'Beta']);
    expect(toolbar(section)?.textContent).toContain(
      t('folder_multi_select_count').replace('{count}', '2'),
    );
    // A chat in another folder cannot join this folder's selection.
    expect(click(section.view.conversationRow('personal', 'Delta')).defaultPrevented).toBe(true);
    expect(selectedTitles(section)).toEqual(['Alpha', 'Beta']);
    // Clicking a selected chat again lets it go.
    click(section.view.conversationRow('work', 'Beta'));
    expect(selectedTitles(section)).toEqual(['Alpha']);
  });

  it('drags every selected chat into another folder and ends the selection', async () => {
    const section = await activate();
    await selectAlphaAndBeta(section);

    dropInto(section.view.folderRow('Personal'), section.view.dragRow('work', 'Alpha'));
    await nextPass();

    expect(titles('personal')).toEqual(['Delta', 'Alpha', 'Beta']);
    expect(titles('work')).toEqual(['Gamma']);
    expect(toolbar(section)).toBeNull();
    expect(selectedTitles(section)).toEqual([]);
  });

  it('removes the selected chats from their folder after the batch confirm', async () => {
    const section = await activate();
    await selectAlphaAndBeta(section);
    const remove = () =>
      toolbar(section)!
        .querySelector<HTMLButtonElement>(`button[aria-label="${t('batch_delete_button')}"]`)!
        .click();

    remove();
    expect(confirmDriver.message()).toBe(t('folder_batch_remove_confirm').replace('{count}', '2'));
    expect(confirmDriver.focusedLabel()).toBe(t('pm_cancel'));
    confirmDriver.answer(t('pm_cancel'));
    await nextPass();
    expect(titles('work')).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(selectedTitles(section)).toEqual(['Alpha', 'Beta']);

    remove();
    confirmDriver.answer(t('folder_remove_conversation_action'));
    await nextPass();
    expect(titles('work')).toEqual(['Gamma']);
    expect(toolbar(section)).toBeNull();
  });

  it('ends on Escape and on a press outside, but not on a press inside Voyager', async () => {
    const section = await activate();
    await selectAlphaAndBeta(section);

    // The folder menu's body-level layer is one of Voyager's own.
    const layer = document.createElement('div');
    layer.setAttribute('data-gv-shadow-surface', '');
    document.body.append(layer);
    mouse(layer, 'click');
    expect(selectedTitles(section)).toEqual(['Alpha', 'Beta']);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(selectedTitles(section)).toEqual([]);
    expect(toolbar(section)).toBeNull();

    await selectAlphaAndBeta(section);
    mouse(sidebar.row(sidebar.rowIds()[0]), 'click');
    expect(selectedTitles(section)).toEqual([]);
    expect(toolbar(section)).toBeNull();
  });

  it('ends on Escape in the section search, but not when a folder name field takes it', async () => {
    const section = await activate();
    await selectAlphaAndBeta(section);
    const escape = (field: HTMLInputElement): KeyboardEvent => {
      field.focus();
      const event = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true,
        cancelable: true,
        composed: true,
      });
      field.dispatchEvent(event);
      return event;
    };

    section.root.querySelector<HTMLButtonElement>('.gv-chatgpt-folder-section__create')!.click();
    escape(section.view.nameInput()!);
    expect(section.view.nameInput()).toBeNull();
    expect(selectedTitles(section)).toEqual(['Alpha', 'Beta']);

    escape(section.root.querySelector<HTMLInputElement>('input[type="search"]')!);
    expect(selectedTitles(section)).toEqual([]);
    expect(toolbar(section)).toBeNull();
  });

  it('ends when ChatGPT remounts the sidebar the section sits in', async () => {
    const section = await activate();
    await selectAlphaAndBeta(section);

    sidebar.replaceSidebar();
    await nextPass();

    expect(section.root.host.isConnected).toBe(true);
    expect(selectedTitles(section)).toEqual([]);
    expect(toolbar(section)).toBeNull();
    // A plain drag afterwards moves only the chat it holds.
    dropInto(section.view.folderRow('Personal'), section.view.dragRow('work', 'Gamma'));
    await nextPass();
    expect(titles('personal')).toEqual(['Delta', 'Gamma']);
    expect(titles('work')).toEqual(['Alpha', 'Beta']);
  });
});
