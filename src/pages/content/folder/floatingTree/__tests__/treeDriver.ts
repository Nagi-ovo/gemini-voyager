/**
 * Drives a mounted folder tree the way a user does, and reads back what a user
 * sees. Every DOM query of the characterization suites lives here, so a rewrite
 * that changes the tree's markup updates this file and leaves the cases alone.
 *
 * Elements are found by accessible name (the translated `aria-label` or text),
 * by role, and by `dir="auto"` on the two name elements. The few structural
 * hooks the current markup forces are marked `DOM HOOK` below:
 *
 * - `data-folder-id` / `data-conversation-id` tell a row's folder and its
 *   conversation apart, since the same conversation can sit in several folders;
 * - `data-depth` on a folder's block is the nesting depth, the same value the
 *   stylesheet's tree-guide lines read through `--gv-folder-depth`. A flat,
 *   virtualized tree would expose it as `aria-level` instead.
 */
import { getTranslationSyncUnsafe } from '@/utils/i18n';

import type { MountedTree } from './treeConsumers';

export const label = (key: string): string => getTranslationSyncUnsafe(key);

/** Lets deferred work run: microtasks, one animation frame, then microtasks again. */
export async function settle(): Promise<void> {
  for (let i = 0; i < 3; i++) await Promise.resolve();
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  for (let i = 0; i < 3; i++) await Promise.resolve();
}

/** Connected, and neither it nor an ancestor up to its root is hidden. */
export function isShown(element: Element): boolean {
  if (!element.isConnected) return false;
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node instanceof HTMLElement && (node.hidden || node.style.display === 'none')) {
      return false;
    }
  }
  return true;
}

/** The focused element, followed into open shadow roots. */
export function deepActiveElement(): Element | null {
  let active: Element | null = document.activeElement;
  while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
  return active;
}

/** Every open shadow root on the page, the surfaces Voyager mounts included. */
function shadowRoots(): ShadowRoot[] {
  return Array.from(document.querySelectorAll('*'), (element) => element.shadowRoot).filter(
    (root): root is ShadowRoot => !!root,
  );
}

export type FakeTransfer = {
  readonly types: string[];
  getData: (type: string) => string;
  setData: (type: string, value: string) => void;
  setDragImage: () => void;
  effectAllowed: string;
  dropEffect: string;
};

export function fakeTransfer(data: Record<string, string> = {}): FakeTransfer {
  const store = new Map(Object.entries(data));
  return {
    get types() {
      return [...store.keys()];
    },
    getData: (type) => store.get(type) ?? '',
    setData: (type, value) => void store.set(type, value),
    setDragImage: () => {},
    effectAllowed: 'all',
    dropEffect: 'none',
  };
}

function dragEvent(type: string, transfer: FakeTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return event;
}

function mouse(type: string, target: Element, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent(type, { bubbles: true, cancelable: true, composed: true, ...init });
  target.dispatchEvent(event);
  return event;
}

export function keydown(target: Element, key: string): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
}

/** A primary-button press and release on `target`, with every event a library may listen for. */
export function press(target: Element): void {
  mouse('pointerdown', target);
  mouse('mousedown', target);
  mouse('pointerup', target);
  mouse('mouseup', target);
  mouse('click', target);
}

/** Escape from wherever focus is, as a user presses it. */
export function pressEscape(): KeyboardEvent {
  return keydown(deepActiveElement() ?? document.body, 'Escape');
}

/** The folder menu wherever it renders: in the tree, a body-level layer, or the page. */
export function openMenu(): HTMLElement | null {
  for (const scope of [document, ...shadowRoots()]) {
    const menu = scope.querySelector<HTMLElement>('[role="menu"]');
    if (menu && isShown(menu)) return menu;
  }
  return null;
}

/** The labelled actions in the open menu, in order; color swatches have no text. */
export function menuItemLabels(): string[] {
  return menuItems()
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean);
}

export function menuItems(): HTMLElement[] {
  const menu = openMenu();
  if (!menu) return [];
  return Array.from(menu.querySelectorAll<HTMLElement>('button, [role="menuitem"]'));
}

export function menuItem(text: string): HTMLElement {
  const item = menuItems().find((candidate) => candidate.textContent?.trim() === text);
  if (!item) throw new Error(`no menu item "${text}" in [${menuItemLabels().join(', ')}]`);
  return item;
}

/** The light-DOM element on the page that contains `node`, across shadow roots. */
export function topLevelHost(node: Node): Element | null {
  let current: Node | null = node;
  while (current) {
    const root = current.getRootNode();
    if (root instanceof ShadowRoot) current = root.host;
    else break;
  }
  let element = current instanceof Element ? current : null;
  while (element?.parentElement && element.parentElement !== document.body) {
    element = element.parentElement;
  }
  return element;
}

/** Drives the tree rendered in `tree.root`; any host's shadow root will do. */
export function treeDriver(tree: Pick<MountedTree, 'root' | 'rootBucketId'>) {
  const { root } = tree;
  const expandLabels = () => [
    label('floatingPanelExpandFolder'),
    label('floatingPanelCollapseFolder'),
  ];

  /** Each folder's row, in document order. */
  const folderRows = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label]'))
      .filter((button) => expandLabels().includes(button.getAttribute('aria-label') ?? ''))
      // DOM HOOK: the row that owns the expand control carries the folder id.
      .map((button) => button.closest<HTMLElement>('[data-folder-id]'))
      .filter((row): row is HTMLElement => !!row);

  const nameOf = (row: Element): string =>
    row.querySelector('[dir="auto"]')?.textContent?.trim() ?? '';

  const folderRow = (name: string): HTMLElement => {
    const row = folderRows().find((candidate) => nameOf(candidate) === name);
    if (!row) throw new Error(`no folder "${name}"`);
    return row;
  };

  // DOM HOOK: a folder's nesting depth, see the header comment.
  const depthOf = (row: Element): number =>
    Number(row.closest('[data-depth]')?.getAttribute('data-depth') ?? 0);

  // DOM HOOK: a conversation row names its conversation and the folder it is shown in.
  const conversationRows = (): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>('[data-conversation-id]'));

  // A site with conversation links (Gemini) renders the title as a link.
  const titleButton = (row: Element): HTMLElement => {
    const button = row.querySelector<HTMLElement>('button[dir="auto"], a[dir="auto"]');
    if (!button) throw new Error('conversation row has no title');
    return button;
  };

  const conversationRow = (bucketId: string, title: string): HTMLElement => {
    const row = conversationRows().find(
      (candidate) =>
        candidate.dataset.folderId === bucketId &&
        titleButton(candidate).textContent?.trim() === title,
    );
    if (!row) throw new Error(`no conversation "${title}" in ${bucketId}`);
    return row;
  };

  const buttonLabelled = (scope: Element, key: string): HTMLButtonElement | null =>
    scope.querySelector<HTMLButtonElement>(`button[aria-label="${label(key)}"]`);

  const requireButton = (scope: Element, key: string): HTMLButtonElement => {
    const button = buttonLabelled(scope, key);
    if (!button) throw new Error(`no button labelled "${label(key)}"`);
    return button;
  };

  const nameInput = (): HTMLInputElement | null =>
    root.querySelector<HTMLInputElement>(
      `input[placeholder="${label('floatingPanelFolderNamePlaceholder')}"]`,
    );

  const requireNameInput = (): HTMLInputElement => {
    const input = nameInput();
    if (!input) throw new Error('no folder name input is open');
    return input;
  };

  return {
    root,
    text: (): string => root.textContent ?? '',

    /**
     * What the tree shows, one line per row in order: two spaces per level, a
     * folder by its name and a conversation as `· title`, under the folder that
     * shows it. Collapsed contents are left out.
     */
    outline: (): string[] => {
      const folderDepth = new Map<string, number>();
      for (const row of folderRows()) folderDepth.set(row.dataset.folderId ?? '', depthOf(row));
      const lines: string[] = [];
      // DOM HOOK: folder rows and conversation rows are the elements with a folder id.
      for (const row of root.querySelectorAll<HTMLElement>('[data-folder-id]')) {
        if (!isShown(row)) continue;
        if (row.dataset.conversationId !== undefined) {
          const owner = folderDepth.get(row.dataset.folderId ?? '');
          const depth = owner === undefined ? 0 : owner + 1;
          lines.push(`${'  '.repeat(depth)}· ${titleButton(row).textContent?.trim()}`);
        } else if (folderRows().includes(row)) {
          lines.push(`${'  '.repeat(depthOf(row))}${nameOf(row)}`);
        }
      }
      return lines;
    },

    folderNames: (): string[] => folderRows().map(nameOf),
    folderRow,
    folderNameElement: (name: string): HTMLElement => {
      const element = folderRow(name).querySelector<HTMLElement>('[dir="auto"]');
      if (!element) throw new Error(`folder "${name}" shows no name`);
      return element;
    },
    folderIdOf: (name: string): string => folderRow(name).dataset.folderId ?? '',
    isExpanded: (name: string): boolean =>
      folderRow(name).querySelector(
        `button[aria-label="${label('floatingPanelCollapseFolder')}"]`,
      ) !== null,
    expandControl: (name: string): HTMLButtonElement => {
      const button = Array.from(folderRow(name).querySelectorAll('button')).find((candidate) =>
        expandLabels().includes(candidate.getAttribute('aria-label') ?? ''),
      );
      if (!button) throw new Error(`folder "${name}" has no expand control`);
      return button;
    },
    toggle: (name: string): void => {
      const row = folderRow(name);
      const button = Array.from(row.querySelectorAll('button')).find((candidate) =>
        expandLabels().includes(candidate.getAttribute('aria-label') ?? ''),
      );
      button?.click();
    },
    /** The folder's own "add subfolder" button, or null where it cannot have one. */
    addSubfolderButton: (name: string): HTMLButtonElement | null =>
      buttonLabelled(folderRow(name), 'floatingPanelCreateSubfolder'),
    /** The folder's menu button, or null where the menu opens on right-click only. */
    menuButton: (name: string): HTMLButtonElement | null =>
      buttonLabelled(folderRow(name), 'folder_settings'),
    openMenuByRightClick: (name: string, at = { x: 40, y: 50 }): void => {
      mouse('contextmenu', folderRow(name), { clientX: at.x, clientY: at.y });
    },
    /** Opens the menu from its button; `keyboard` is Enter or Space on it (a click with no pointer). */
    openMenuByButton: (name: string, keyboard = false): void => {
      const button = buttonLabelled(folderRow(name), 'folder_settings');
      if (!button) throw new Error(`folder "${name}" has no menu button`);
      mouse('click', button, { detail: keyboard ? 0 : 1 });
    },
    startRename: (name: string): void => {
      const element = folderRow(name).querySelector('[dir="auto"]');
      if (!element) throw new Error(`folder "${name}" shows no name`);
      mouse('dblclick', element);
    },

    nameInput,
    /** Replaces the draft in the open name field, as typing does. */
    typeName: (value: string): void => {
      const input = requireNameInput();
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    },
    pressInInput: (key: string): KeyboardEvent => keydown(requireNameInput(), key),
    formButton: (key: 'floatingPanelSave' | 'floatingPanelCancel'): HTMLButtonElement => {
      const form = requireNameInput().parentElement;
      if (!form) throw new Error('the name field has no form');
      return requireButton(form, key);
    },

    conversationRow,
    /** Every shown row of `title`, as `bucketId` of the folder it is shown in. */
    bucketsShowing: (title: string): string[] =>
      conversationRows()
        .filter((row) => isShown(row) && titleButton(row).textContent?.trim() === title)
        .map((row) => row.dataset.folderId ?? ''),
    titleButton: (bucketId: string, title: string): HTMLElement =>
      titleButton(conversationRow(bucketId, title)),
    openConversation: (bucketId: string, title: string): void =>
      titleButton(conversationRow(bucketId, title)).click(),
    isStarred: (bucketId: string, title: string): boolean =>
      buttonLabelled(conversationRow(bucketId, title), 'floatingPanelUnstarConversation') !== null,
    toggleStar: (bucketId: string, title: string): void => {
      const row = conversationRow(bucketId, title);
      (
        buttonLabelled(row, 'floatingPanelStarConversation') ??
        requireButton(row, 'floatingPanelUnstarConversation')
      ).click();
    },
    removeButton: (bucketId: string, title: string): HTMLButtonElement =>
      requireButton(conversationRow(bucketId, title), 'floatingPanelRemoveConversation'),

    /** Starts a drag on a shown row and returns what the row put on the drag. */
    dragRow: (bucketId: string, title: string): FakeTransfer => {
      const transfer = fakeTransfer();
      conversationRow(bucketId, title).dispatchEvent(dragEvent('dragstart', transfer));
      return transfer;
    },
    /** Drags over, then drops on `target`; returns whether dragover accepted the drag. */
    drop: (target: Element, transfer: FakeTransfer): boolean => {
      target.dispatchEvent(dragEvent('dragenter', transfer));
      const over = dragEvent('dragover', transfer);
      target.dispatchEvent(over);
      target.dispatchEvent(dragEvent('drop', transfer));
      return over.defaultPrevented;
    },
    /** Only drags over `target`; returns whether it accepted the drag. */
    dragOver: (target: Element, transfer: FakeTransfer): boolean => {
      const over = dragEvent('dragover', transfer);
      target.dispatchEvent(over);
      target.dispatchEvent(dragEvent('dragleave', transfer));
      return over.defaultPrevented;
    },
    /** The target that files a drop at the root, or null where the tree has none. */
    rootDropTarget: (): HTMLElement | null =>
      // DOM HOOK: the root target carries the root bucket id and holds no conversation.
      root.querySelector<HTMLElement>(
        `[data-folder-id="${tree.rootBucketId}"]:not([data-conversation-id])`,
      ),
  };
}

export type TreeDriver = ReturnType<typeof treeDriver>;
