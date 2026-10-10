/**
 * A long tree renders only the rows in view of the scroller that already
 * scrolls it (the host's sidebar, not a scrollbar of its own), and keeps an
 * open name field rendered, focused and holding its draft while scrolled away.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FolderData } from '../../types';
import { cls } from '../shared';
import { type FolderTreeController, mountFolderTree } from '../treeController';
import { deepActiveElement, settle, treeDriver } from './treeDriver';
import { conv, folder } from './treeFixtures';

vi.mock('@/utils/i18n', () => ({ getTranslationSyncUnsafe: (key: string) => key }));

const ROOT = '__root__';
const VIEWPORT = 320;
const CHATS = 300;

const mounted: FolderTreeController[] = [];

afterEach(() => {
  for (const tree of mounted.splice(0)) tree.destroy();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

/** Two folders: `Long` with many chats, then `Last` at the very bottom. */
function longData(): FolderData {
  return {
    folders: [
      folder('long', 'Long', { sortIndex: 0 }),
      folder('last', 'Last', { sortIndex: 1, isExpanded: false }),
    ],
    folderContents: {
      long: Array.from({ length: CHATS }, (_, index) => conv(`c${index}`, `Chat ${index}`)),
      last: [],
    },
  };
}

/**
 * Mounts the tree inline, as AI Studio does: inside a shadow root, in a page
 * sidebar that scrolls. jsdom has no layout, so the sidebar gets a height and a
 * scroll offset of its own; rows keep their estimated heights.
 */
function mountInSidebar() {
  const sidebar = document.createElement('nav');
  sidebar.style.overflowY = 'auto';
  let scrollTop = 0;
  Object.defineProperties(sidebar, {
    offsetHeight: { configurable: true, get: () => VIEWPORT },
    offsetWidth: { configurable: true, get: () => 280 },
    clientHeight: { configurable: true, get: () => VIEWPORT },
    scrollTop: {
      configurable: true,
      get: () => scrollTop,
      set: (value: number) => {
        scrollTop = value;
      },
    },
  });
  const host = document.createElement('div');
  sidebar.appendChild(host);
  // The tree's list sits at the top of the sidebar's content and moves up as it scrolls.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return this.classList.contains(cls('tree'))
        ? DOMRect.fromRect({ x: 0, y: -scrollTop, width: 280, height: 0 })
        : DOMRect.fromRect();
    },
  );
  document.body.appendChild(sidebar);
  const root = host.attachShadow({ mode: 'open' });
  const body = document.createElement('div');
  root.appendChild(body);
  const tree = mountFolderTree({
    body,
    boundary: host,
    focusRoot: root,
    data: longData(),
    rootBucketId: ROOT,
    conversationSortMode: 'manual',
    actions: { onRenameFolder: vi.fn() },
  });
  mounted.push(tree);
  const scrollTo = async (top: number) => {
    scrollTop = top;
    sidebar.dispatchEvent(new Event('scroll'));
    await settle();
  };
  return { sidebar, root, view: treeDriver({ root, rootBucketId: ROOT }), scrollTo };
}

const shownTitles = (root: ShadowRoot) =>
  Array.from(root.querySelectorAll('[data-conversation-id]'), (row) => row.textContent ?? '');

const hasFolder = (root: ShadowRoot, id: string) =>
  root.querySelector(`.${cls('folder-header')}[data-folder-id="${id}"]`) !== null;

describe('a long tree', () => {
  it('renders the rows in view between spacers and scrolls with its sidebar', async () => {
    const { root, scrollTo } = mountInSidebar();
    await settle();

    expect(root.querySelector(`.${cls('tree-spacer')}`)).not.toBeNull();
    expect(shownTitles(root).length).toBeLessThan(60);
    expect(hasFolder(root, 'last')).toBe(false);
    // No scroller of its own: the tree's list is never the element that scrolls.
    expect(root.querySelector<HTMLElement>(`.${cls('tree')}`)!.style.overflowY).toBe('');

    await scrollTo(CHATS * 40);
    expect(hasFolder(root, 'last')).toBe(true);
    expect(hasFolder(root, 'long')).toBe(false);
    expect(shownTitles(root)).not.toContain('Chat 0');
  });

  it.each([
    { name: 'above the rows in view', folderId: 'long', start: 0, away: CHATS * 40 },
    { name: 'below the rows in view', folderId: 'last', start: CHATS * 40, away: 0 },
  ])('keeps a rename scrolled $name focused, with its draft', async ({ folderId, start, away }) => {
    const { root, view, scrollTo } = mountInSidebar();
    await settle();
    await scrollTo(start);

    const name = folderId === 'long' ? 'Long' : 'Last';
    view.startRename(name);
    await settle();
    const input = view.nameInput()!;
    expect(deepActiveElement()).toBe(input);
    view.typeName('Draft');
    const blurred = vi.fn();
    input.addEventListener('blur', blurred);
    const inView = shownTitles(root);

    await scrollTo(away);
    // The rows in view moved on; the renaming folder is still rendered.
    expect(shownTitles(root).filter((title) => inView.includes(title))).toEqual([]);
    expect(view.nameInput()).toBe(input);

    await scrollTo(start);
    expect(view.nameInput()).toBe(input);
    expect(input.isConnected).toBe(true);
    expect(input.value).toBe('Draft');
    expect(deepActiveElement()).toBe(input);
    expect(blurred).not.toHaveBeenCalled();
  });
});
