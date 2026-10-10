/**
 * What a user can do in the shared folder tree in each of its consumers:
 * open a chat, star and remove one, create, rename and delete folders, and use
 * the folder menu. Pinned through `treeDriver` against each consumer's own
 * entry point, ahead of moving the tree's internals to open-source packages.
 *
 * Today's keyboard support is native buttons plus Enter/Escape in the name
 * field, Escape on the menu, and focus into and back out of a menu opened from
 * the keyboard (AI Studio's menu button). There are no arrow keys and no
 * menu item roles; the cases below pin only what exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FolderData } from '../../types';
import { MAX_FOLDER_NAME_LENGTH } from '../shared';
import { CONSUMERS, type ConsumerId, destroyMountedTrees, mountConsumer } from './treeConsumers';
import {
  deepActiveElement,
  label,
  menuItem,
  menuItemLabels,
  menuItems,
  openMenu,
  press,
  pressEscape,
  settle,
  topLevelHost,
  treeDriver,
} from './treeDriver';
import { calledSpies, conv, folder, sharedFixture, spyActions } from './treeFixtures';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

afterEach(() => {
  destroyMountedTrees();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

const rootOf = (consumer: ConsumerId) =>
  consumer === 'aistudio' ? '__uncategorized__' : '__root_conversations__';

/** Alpha (Shared, Solo) and Beta (Shared) at the root; Alpha › Inner; Shared also at the root. */
function data(rootBucketId: string): FolderData {
  const shared = sharedFixture(rootBucketId);
  shared.folders.push(folder('i', 'Inner', { parentId: 'a', sortIndex: 0, createdAt: 3 }));
  shared.folderContents.i = [];
  return shared;
}

function mount(consumer: ConsumerId, extra: Parameters<typeof mountConsumer>[2] = {}) {
  const actions = spyActions();
  const stored = data(rootOf(consumer));
  const tree = mountConsumer(consumer, structuredClone(stored), { ...actions, ...extra });
  return { tree, view: treeDriver(tree), actions, stored };
}

describe.each(CONSUMERS)('$name: chats', ({ consumer }) => {
  it('opens a chat through onNavigate with its stored record, without leaving the page', () => {
    const { tree, view, actions, stored } = mount(consumer);
    const before = location.href;

    view.openConversation('b', 'Shared');

    expect(actions.onNavigate.mock.calls).toEqual([[stored.folderContents.b[0]]]);
    expect(calledSpies(actions)).toEqual(['onNavigate']);
    expect(location.href).toBe(before);
    expect(view.bucketsShowing('Shared').sort()).toEqual([tree.rootBucketId, 'a', 'b'].sort());
  });

  it('shows a chat starred in one folder as starred in every folder, and one click unstars it', () => {
    const { tree, view, actions, stored } = mount(consumer);

    view.toggleStar('b', 'Shared');
    expect(actions.onToggleStar.mock.calls).toEqual([['shared', true]]);

    stored.folderContents.b[0].starred = true;
    tree.update(structuredClone(stored));
    expect(view.isStarred('b', 'Shared')).toBe(true);
    expect(view.isStarred('a', 'Shared')).toBe(true);
    expect(view.isStarred(tree.rootBucketId, 'Shared')).toBe(true);
    expect(view.isStarred('a', 'Solo')).toBe(false);

    view.toggleStar('a', 'Shared');
    expect(actions.onToggleStar.mock.calls.at(-1)).toEqual(['shared', false]);
  });

  it('removes a chat from the folder whose row was used, at once without a confirm', () => {
    const { tree, view, actions } = mount(consumer);

    view.removeButton(tree.rootBucketId, 'Shared').click();
    expect(actions.onRemoveConversation.mock.calls).toEqual([[tree.rootBucketId, 'shared']]);
  });

  it('asks through the host confirm before removing, naming the chat', () => {
    const confirmConversationRemoval =
      vi.fn<(title: string, anchor: HTMLElement, onConfirm: () => void) => void>();
    const { view, actions } = mount(consumer, { confirmConversationRemoval });

    view.removeButton('a', 'Solo').click();
    expect(confirmConversationRemoval).toHaveBeenCalledTimes(1);
    const [title, anchor, onConfirm] = confirmConversationRemoval.mock.calls[0];
    expect(title).toBe('Solo');
    expect(anchor).toBeInstanceOf(HTMLElement);
    expect(actions.onRemoveConversation).not.toHaveBeenCalled();

    onConfirm();
    expect(actions.onRemoveConversation.mock.calls).toEqual([['a', 'solo']]);
  });
});

describe.each(CONSUMERS)('$name: naming folders', ({ consumer }) => {
  it('creates a top-level folder from a focused, capped name field, trimming the name', async () => {
    const { tree, view, actions } = mount(consumer);
    tree.startCreateRootFolder();
    await settle();

    const input = view.nameInput()!;
    expect(input.value).toBe('');
    expect(input.maxLength).toBe(MAX_FOLDER_NAME_LENGTH);
    expect(deepActiveElement()).toBe(input);

    view.typeName('  Fresh  ');
    view.pressInInput('Enter');
    expect(actions.onCreateFolder.mock.calls).toEqual([['Fresh', null]]);
    expect(view.nameInput()).toBeNull();
  });

  it('creates from the Save button too', () => {
    const { tree, view, actions } = mount(consumer);
    tree.startCreateRootFolder();
    view.typeName('Saved');
    view.formButton('floatingPanelSave').click();
    expect(actions.onCreateFolder.mock.calls).toEqual([['Saved', null]]);
  });

  it.each([
    ['Escape', (view: ReturnType<typeof treeDriver>) => void view.pressInInput('Escape')],
    [
      'the Cancel button',
      (view: ReturnType<typeof treeDriver>) => view.formButton('floatingPanelCancel').click(),
    ],
    ['a press outside the tree', () => press(document.body)],
  ])('creates nothing after %s', (_how, cancel) => {
    const { tree, view, actions } = mount(consumer);
    tree.startCreateRootFolder();
    view.typeName('Abandoned');
    cancel(view);
    expect(view.nameInput()).toBeNull();
    expect(calledSpies(actions)).toEqual([]);
  });

  it('creates nothing from an empty or blank name', () => {
    const { tree, view, actions } = mount(consumer);
    tree.startCreateRootFolder();
    view.typeName('   ');
    view.pressInInput('Enter');
    expect(view.nameInput()).toBeNull();
    expect(actions.onCreateFolder).not.toHaveBeenCalled();
  });

  it('creates a subfolder from the folder row, opening a collapsed parent first', () => {
    const { tree, view, actions, stored } = mount(consumer);
    stored.folders.find((f) => f.id === 'b')!.isExpanded = false;
    tree.update(structuredClone(stored));

    view.addSubfolderButton('Beta')!.click();
    expect(actions.onToggleFolderExpanded.mock.calls).toEqual([['b']]);
    view.typeName('Sub');
    view.pressInInput('Enter');
    expect(actions.onCreateFolder.mock.calls).toEqual([['Sub', 'b']]);
  });

  it('offers no subfolder under a subfolder', () => {
    const { view } = mount(consumer);
    expect(view.addSubfolderButton('Alpha')).not.toBeNull();
    expect(view.addSubfolderButton('Inner')).toBeNull();

    view.openMenuByRightClick('Inner');
    expect(menuItemLabels()).not.toContain(label('floatingPanelCreateSubfolder'));
  });

  it('renames from a double-click on the name, starting from the current name', async () => {
    const { view, actions } = mount(consumer);
    view.startRename('Beta');
    await settle();

    const input = view.nameInput()!;
    expect(input.value).toBe('Beta');
    expect(deepActiveElement()).toBe(input);
    view.typeName(' Gamma ');
    view.pressInInput('Enter');
    expect(actions.onRenameFolder.mock.calls).toEqual([['b', 'Gamma']]);
    expect(view.nameInput()).toBeNull();
  });

  it('renames from the folder menu', () => {
    const { view, actions } = mount(consumer);
    view.openMenuByRightClick('Beta');
    menuItem(label('floatingPanelRenameFolder')).click();
    expect(openMenu()).toBeNull();
    expect(view.nameInput()!.value).toBe('Beta');
    view.typeName('Delta');
    view.pressInInput('Enter');
    expect(actions.onRenameFolder.mock.calls).toEqual([['b', 'Delta']]);
  });

  it('renames nothing after Escape or with a blank name', () => {
    const { view, actions } = mount(consumer);
    view.startRename('Beta');
    view.typeName('Discarded');
    view.pressInInput('Escape');
    expect(view.nameInput()).toBeNull();
    expect(view.folderNames()).toContain('Beta');

    view.startRename('Beta');
    view.typeName('  ');
    view.pressInInput('Enter');
    expect(actions.onRenameFolder).not.toHaveBeenCalled();
  });

  it('keeps the typed draft when the host pushes new data meanwhile', async () => {
    const { tree, view, stored } = mount(consumer);
    view.startRename('Beta');
    await settle();
    view.typeName('Half-typed');

    stored.folders.push(folder('n', 'Newcomer', { sortIndex: 5, createdAt: 9 }));
    stored.folderContents.n = [];
    tree.update(structuredClone(stored));

    expect(view.nameInput()?.value).toBe('Half-typed');
    expect(deepActiveElement()).toBe(view.nameInput());
  });
});

describe.each(CONSUMERS)('$name: rename with the name the folder already has', ({ consumer }) => {
  it('does not ask to rename', () => {
    const { view, actions } = mount(consumer);
    view.startRename('Beta');
    view.pressInInput('Enter');
    expect(actions.onRenameFolder).not.toHaveBeenCalled();
  });
});

describe.each(CONSUMERS)('$name: deleting a folder', ({ consumer }) => {
  it('closes the menu and asks the host beside the folder’s row, deleting only on its answer', () => {
    const { view, actions } = mount(consumer);
    view.openMenuByRightClick('Alpha');
    menuItem(label('floatingPanelDeleteFolder')).click();

    expect(openMenu()).toBeNull();
    expect(calledSpies(actions)).toEqual(['confirmFolderRemoval']);
    const [anchor, onConfirm] = actions.confirmFolderRemoval.mock.calls[0];
    // The menu item is gone by now; a confirm anchored to it would close at once.
    expect(anchor.isConnected).toBe(true);
    expect(anchor.dataset.folderId).toBe('a');

    onConfirm();
    // Only the chosen folder: its subtree is the host’s to remove.
    expect(actions.onDeleteFolder.mock.calls).toEqual([['a']]);
  });

  it('offers no Delete when the host has no confirm', () => {
    const { view } = mount(consumer, { confirmFolderRemoval: undefined });
    view.openMenuByRightClick('Alpha');
    expect(menuItemLabels()).not.toContain(label('floatingPanelDeleteFolder'));
  });
});

describe.each(CONSUMERS)('$name: the folder menu', ({ consumer }) => {
  it('lists its actions in order and runs each on the chosen folder, then closes', () => {
    const { view, actions } = mount(consumer);
    view.openMenuByRightClick('Beta');
    expect(menuItemLabels()).toEqual([
      label('floatingPanelAddCurrentHere'),
      label('floatingPanelPinFolder'),
      label('floatingPanelCreateSubfolder'),
      label('floatingPanelRenameFolder'),
      label('floatingPanelDeleteFolder'),
    ]);

    menuItem(label('floatingPanelPinFolder')).click();
    expect(actions.onToggleFolderPinned.mock.calls).toEqual([['b']]);
    expect(openMenu()).toBeNull();

    view.openMenuByRightClick('Beta');
    menuItem(label('floatingPanelAddCurrentHere')).click();
    expect(actions.onAddCurrentConversation.mock.calls).toEqual([['b']]);

    view.openMenuByRightClick('Beta');
    const swatch = menuItems().find((item) => item.getAttribute('aria-label'))!;
    swatch.click();
    expect(actions.onSetFolderColor).toHaveBeenCalledTimes(1);
    expect(actions.onSetFolderColor.mock.calls[0][0]).toBe('b');
    expect(openMenu()).toBeNull();
  });

  it('offers Unpin on a pinned folder, and no color without a color callback', () => {
    const { onSetFolderColor: _color, ...actions } = spyActions();
    const pinned = data(rootOf(consumer));
    pinned.folders.find((f) => f.id === 'b')!.pinned = true;
    const view = treeDriver(mountConsumer(consumer, pinned, actions));

    view.openMenuByRightClick('Beta');
    expect(menuItemLabels()).toContain(label('floatingPanelUnpinFolder'));
    expect(menuItems().filter((item) => !item.textContent?.trim())).toEqual([]);
  });

  it('makes every menu action a focusable button, in order, for Tab', () => {
    const { view } = mount(consumer);
    view.openMenuByRightClick('Beta');
    const items = menuItems();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.tagName).toBe('BUTTON');
      expect(item.tabIndex).toBeGreaterThanOrEqual(0);
      expect((item as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it('closes on a press outside, and stays open for a press elsewhere in the tree or menu', () => {
    const { view } = mount(consumer);
    view.openMenuByRightClick('Beta');

    press(openMenu()!);
    expect(openMenu()).not.toBeNull();
    press(view.folderRow('Alpha').parentElement!);
    expect(openMenu()).not.toBeNull();

    const outside = document.createElement('button');
    document.body.appendChild(outside);
    press(outside);
    expect(openMenu()).toBeNull();
  });

  it('shows one menu at a time, for the folder last asked', () => {
    const { view, actions } = mount(consumer);
    view.openMenuByRightClick('Alpha');
    view.openMenuByRightClick('Beta');
    menuItem(label('floatingPanelPinFolder')).click();
    expect(actions.onToggleFolderPinned.mock.calls).toEqual([['b']]);
  });

  it('closes when the host pushes data without its folder', () => {
    const { tree, view, stored } = mount(consumer);
    view.openMenuByRightClick('Beta');
    tree.update({
      ...structuredClone(stored),
      folders: stored.folders.filter((f) => f.id !== 'b'),
    });
    expect(openMenu()).toBeNull();
  });
});

describe('where the folder menu renders', () => {
  it('the floating panel keeps it inside its own shadow root', () => {
    const { tree, view } = mount('panel');
    view.openMenuByRightClick('Beta');
    expect(openMenu()!.getRootNode()).toBe(tree.root);
  });

  // The nav or sidebar may transform, scroll or clip, which would capture a fixed menu.
  it.each(['aistudio', 'chatgpt'] as const)(
    '%s renders it in a body-level layer, outside its sidebar and the tree',
    (consumer) => {
      const { tree, view } = mount(consumer);
      view.openMenuByButton('Beta');
      const menu = openMenu()!;
      expect(menu.getRootNode()).not.toBe(tree.root);
      const host = topLevelHost(menu)!;
      expect(host.parentElement).toBe(document.body);
      expect(host.contains(tree.host)).toBe(false);
      expect(host.hasAttribute('data-gv-shadow-surface')).toBe(true);
    },
  );

  it.each(['aistudio', 'chatgpt'] as const)(
    '%s opens it from a labelled button and from a right-click alike',
    (consumer) => {
      const { view } = mount(consumer);
      expect(view.menuButton('Beta')!.getAttribute('aria-label')).toBe(label('folder_settings'));
      view.openMenuByRightClick('Beta');
      expect(openMenu()).not.toBeNull();
    },
  );
});

describe('Escape and focus on the folder menu', () => {
  it.each(['panel', 'aistudio', 'chatgpt'] as const)('%s closes the menu on Escape', (consumer) => {
    const { view } = mount(consumer);
    view.openMenuByRightClick('Beta');
    pressEscape();
    expect(openMenu()).toBeNull();
  });

  it.each(['aistudio', 'chatgpt'] as const)(
    '%s moves focus into a menu opened from the keyboard and back on Escape',
    (consumer) => {
      const { view } = mount(consumer);
      const button = view.menuButton('Beta')!;
      button.focus();
      view.openMenuByButton('Beta', true);

      expect(deepActiveElement()).toBe(menuItems()[0]);
      pressEscape();
      expect(openMenu()).toBeNull();
      expect(deepActiveElement()).toBe(button);
    },
  );

  it.each(['aistudio', 'chatgpt'] as const)(
    '%s leaves focus alone for a menu opened with the pointer',
    (consumer) => {
      const { view } = mount(consumer);
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      outside.focus();
      view.openMenuByButton('Beta');
      expect(deepActiveElement()).toBe(outside);
    },
  );
});

describe('folder menu near the viewport edge', () => {
  const MENU = { width: 180, height: 160 };

  /**
   * jsdom has no layout: a menu box sits where its style puts it, everything
   * else is at 0,0, and the viewport fills the window. Floating UI sizes the
   * menu from its offset box and the viewport from the root element.
   */
  function layOut() {
    const isMenu = (el: Element) => el.getAttribute('role') === 'menu';
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
      function (this: HTMLElement) {
        if (isMenu(this)) {
          return DOMRect.fromRect({
            x: parseFloat(this.style.left),
            y: parseFloat(this.style.top),
            ...MENU,
          });
        }
        return DOMRect.fromRect();
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(
      function (this: HTMLElement) {
        return isMenu(this) ? MENU.width : 0;
      },
    );
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(
      function (this: HTMLElement) {
        return isMenu(this) ? MENU.height : 0;
      },
    );
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this === document.documentElement ? window.innerWidth : 0;
    });
    vi.spyOn(Element.prototype, 'clientHeight', 'get').mockImplementation(function (this: Element) {
      return this === document.documentElement ? window.innerHeight : 0;
    });
  }

  it.each(['panel', 'aistudio'] as const)(
    '%s moves a menu opened by the bottom-right corner inside the viewport',
    async (consumer) => {
      layOut();
      const { view } = mount(consumer);
      view.openMenuByRightClick('Beta', { x: window.innerWidth - 10, y: window.innerHeight - 10 });
      await settle();

      const box = openMenu()!.getBoundingClientRect();
      expect(box.right).toBeLessThanOrEqual(window.innerWidth - 8);
      expect(box.bottom).toBeLessThanOrEqual(window.innerHeight - 8);
      expect(box.left).toBeGreaterThanOrEqual(8);
      expect(box.top).toBeGreaterThanOrEqual(8);
    },
  );

  it.each(CONSUMERS)('$name opens a menu that fits where the pointer was', async ({ consumer }) => {
    layOut();
    const { view } = mount(consumer);
    view.openMenuByRightClick('Beta', { x: 100, y: 120 });
    await settle();
    const box = openMenu()!.getBoundingClientRect();
    expect({ x: box.left, y: box.top }).toEqual({ x: 100, y: 120 });
  });
});

describe.each(CONSUMERS)('$name: controls a keyboard reaches', ({ consumer }) => {
  it('makes expand, star, remove and title controls native, labelled buttons', () => {
    const { view } = mount(consumer);
    const row = view.conversationRow('a', 'Solo');
    const buttons = [view.expandControl('Alpha'), ...row.querySelectorAll('button')];
    for (const button of buttons) {
      expect(button.tagName).toBe('BUTTON');
      expect(button.tabIndex).toBeGreaterThanOrEqual(0);
    }
    expect(view.titleButton('a', 'Solo').textContent).toBe('Solo');
    expect(
      Array.from(row.querySelectorAll('button[aria-label]'), (b) => b.getAttribute('aria-label')),
    ).toEqual([label('floatingPanelStarConversation'), label('floatingPanelRemoveConversation')]);
  });

  it('opens a chat from its title button by keyboard activation', () => {
    const { view, actions } = mount(consumer);
    const title = view.titleButton('a', 'Solo');
    title.focus();
    title.click();
    expect(actions.onNavigate).toHaveBeenCalledTimes(1);
    expect(actions.onNavigate.mock.calls[0][0]).toMatchObject(conv('solo', 'Solo', { addedAt: 0 }));
  });
});
