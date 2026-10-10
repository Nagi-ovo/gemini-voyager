/**
 * Drives AI Studio's folder tree the way a user does, so the characterization
 * suite states behaviour once and survives a change of tree DOM. The tree is
 * the shared folder tree in the `.gv-aistudio-folder-tree` shadow root; its
 * folder menu renders in a popover layer on `document.body`.
 */
import { AISTUDIO_ROOT_BUCKET_ID } from '@/features/folder/constants';
import { confirmDriver } from '@/tests/confirmDriver';

import { AISTUDIO_TREE_HOST_CLASS } from '../aistudioTree';
import { POPOVER_LAYER_HOST_CLASS } from '../floatingTree/popoverLayer';
import { cls, t } from '../floatingTree/shared';

export const ROOT = AISTUDIO_ROOT_BUCKET_ID;

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

/** What AI Studio's own binding puts on a drag from a native prompt row. */
export function nativeRowTransfer(conversationId: string, title: string): FakeTransfer {
  const json = JSON.stringify({
    type: 'conversation',
    conversationId,
    title,
    url: `https://aistudio.google.com/prompts/${conversationId}`,
  });
  return fakeTransfer({ 'application/json': json, 'text/plain': json });
}

function dragEvent(type: string, transfer: FakeTransfer): Event {
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  return event;
}

const part = (name: string) => `.${cls(name)}`;

function mountedTreeRoot(): ShadowRoot | null {
  return document.querySelector(`.${AISTUDIO_TREE_HOST_CLASS}`)?.shadowRoot ?? null;
}

export function treeRoot(): ShadowRoot {
  const root = mountedTreeRoot();
  if (!root) throw new Error('folder tree is not mounted');
  return root;
}

/** Where the folder menu renders: the tree's popover layer. */
export function menuRoot(): ShadowRoot {
  const root = document.querySelector(`.${POPOVER_LAYER_HOST_CLASS}`)?.shadowRoot;
  if (!root) throw new Error('folder menu layer is not mounted');
  return root;
}

/** The tree's text, or '' while no tree is mounted. */
export function treeText(): string {
  return mountedTreeRoot()?.textContent ?? '';
}

function folderHeader(folderId: string): HTMLElement {
  const header = treeRoot().querySelector<HTMLElement>(
    `${part('folder-header')}[data-folder-id="${folderId}"]`,
  );
  if (!header) throw new Error(`folder ${folderId} is not rendered`);
  return header;
}

function conversationRow(bucketId: string, conversationId: string): HTMLElement {
  const row = treeRoot().querySelector<HTMLElement>(
    `${part('conv')}[data-folder-id="${bucketId}"][data-conversation-id="${conversationId}"]`,
  );
  if (!row) throw new Error(`conversation ${bucketId}/${conversationId} is not rendered`);
  return row;
}

function openMenu(folderId: string): void {
  folderHeader(folderId).querySelector<HTMLButtonElement>(part('icon-button--menu'))!.click();
}

function menuItem(labelKey: string): HTMLButtonElement | null {
  const label = t(labelKey);
  return (
    Array.from(
      menuRoot().querySelectorAll<HTMLButtonElement>(`${part('context-menu')} button`),
    ).find((item) => item.textContent === label) ?? null
  );
}

function closeMenu(): void {
  document.body.click();
}

function submitName(name: string): void {
  const input = nameInput();
  if (!input) throw new Error('no folder name input is open');
  input.value = name;
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
}

function visible(element: Element): boolean {
  for (let node: Element | null = element; node; node = node.parentElement) {
    if (node instanceof HTMLElement && node.style.display === 'none') return false;
  }
  return true;
}

function addButton(): HTMLButtonElement {
  return document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!;
}

export function nameInput(): HTMLInputElement | null {
  return mountedTreeRoot()?.querySelector<HTMLInputElement>(part('inline-input')) ?? null;
}

export const tree = {
  text: (): string => treeRoot().textContent ?? '',

  /**
   * Rendered folders in order; a subfolder reads `Parent › Child`. Rows are
   * flat, so a folder's parent is the nearest row above it one level up.
   */
  folderOrder: (): string[] => {
    const parents: string[] = [];
    return Array.from(treeRoot().querySelectorAll<HTMLElement>(part('folder')))
      .filter(visible)
      .map((item) => {
        const depth = Number(item.dataset.depth ?? 0);
        const name = item.querySelector(part('folder-name'))?.textContent ?? '';
        parents[depth] = name;
        return depth > 0 ? `${parents[depth - 1]} › ${name}` : name;
      });
  },

  isRendered: (folderId: string): boolean =>
    !!treeRoot().querySelector(`${part('folder-header')}[data-folder-id="${folderId}"]`),

  /** Conversations a user can see in a bucket; a collapsed folder shows none. */
  conversationIds: (bucketId: string): string[] =>
    Array.from(
      treeRoot().querySelectorAll<HTMLElement>(`${part('conv')}[data-folder-id="${bucketId}"]`),
    )
      .filter(visible)
      .map((row) => row.dataset.conversationId ?? ''),

  /** The heading over root conversations, or null while that section is hidden. */
  rootSectionLabel: (): string | null =>
    treeRoot().querySelector(part('root-section-title'))?.textContent?.trim() || null,

  /** Whether the root section comes after every folder. */
  rootSectionIsLast: (): boolean => {
    const section = treeRoot().querySelector(part('root-section'));
    const folders = treeRoot().querySelectorAll(part('folder'));
    const last = folders[folders.length - 1];
    return !!section && (!last || !!(last.compareDocumentPosition(section) & 4));
  },

  activeConversationIds: (): string[] =>
    Array.from(
      treeRoot().querySelectorAll<HTMLElement>(part('conv--active')),
      (row) => row.dataset.conversationId ?? '',
    ),

  isStarredInView: (bucketId: string, conversationId: string): boolean =>
    !!conversationRow(bucketId, conversationId).querySelector(part('icon-button--active')),

  openConversation: (bucketId: string, conversationId: string): void =>
    conversationRow(bucketId, conversationId)
      .querySelector<HTMLButtonElement>(part('conv-title'))!
      .click(),

  toggleExpanded: (folderId: string): void =>
    folderHeader(folderId).querySelector<HTMLButtonElement>(part('caret'))!.click(),

  togglePinned: (folderId: string): void => {
    openMenu(folderId);
    (menuItem('floatingPanelPinFolder') ?? menuItem('floatingPanelUnpinFolder'))!.click();
  },

  toggleStar: (bucketId: string, conversationId: string): void =>
    conversationRow(bucketId, conversationId)
      .querySelector<HTMLButtonElement>(part('icon-button--star'))!
      .click(),

  /** Asks to remove a filed conversation; the question must still be answered. */
  requestRemoval: (bucketId: string, conversationId: string): void =>
    conversationRow(bucketId, conversationId)
      .querySelector<HTMLButtonElement>(part('icon-button--remove'))!
      .click(),

  /** Text of the open removal question, or null. */
  pendingQuestion: (): string | null => confirmDriver.message(),

  /** Answers the open removal question or folder deletion confirm. */
  answer: (confirm: boolean): void => {
    const [cancel, accept] = confirmDriver.labels();
    confirmDriver.answer(confirm ? accept : cancel);
  },

  canCreateSubfolder: (folderId: string): boolean => {
    openMenu(folderId);
    const item = menuItem('floatingPanelCreateSubfolder');
    closeMenu();
    return item !== null;
  },

  createSubfolder: (folderId: string, name: string): void => {
    openMenu(folderId);
    menuItem('floatingPanelCreateSubfolder')!.click();
    submitName(name);
  },

  createRootFolder: (name: string): void => {
    addButton().click();
    submitName(name);
  },

  startRootFolder: (): void => addButton().click(),

  /** Opens the name form for a subfolder of `folderId`, from its menu. */
  startSubfolder: (folderId: string): void => {
    openMenu(folderId);
    menuItem('floatingPanelCreateSubfolder')!.click();
  },

  /** Opens the rename form on a folder's name. */
  startRename: (folderId: string): void => {
    folderHeader(folderId)
      .querySelector(part('folder-name'))!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  },

  /** Whether `element` sits inside the folder's own header. */
  headerHolds: (folderId: string, element: Element): boolean =>
    folderHeader(folderId).contains(element),

  /** Whether `element` is shown, not inside a collapsed folder. */
  isShown: (element: Element): boolean => element.isConnected && visible(element),

  rename: (folderId: string, name: string): void => {
    folderHeader(folderId)
      .querySelector(part('folder-name'))!
      .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    submitName(name);
  },

  /** Asks to delete a folder; answer with `answer(true)`. */
  requestFolderDeletion: (folderId: string): void => {
    openMenu(folderId);
    menuItem('floatingPanelDeleteFolder')!.click();
  },

  /** A filed row, as somewhere to drop onto. */
  rowElement: (bucketId: string, conversationId: string): HTMLElement =>
    conversationRow(bucketId, conversationId),

  dropTarget: (bucketId: string): HTMLElement =>
    bucketId === ROOT
      ? treeRoot().querySelector<HTMLElement>(part('root-drop'))!
      : folderHeader(bucketId),

  /** Starts a drag on a filed row and returns what the row put on the drag. */
  dragRow: (bucketId: string, conversationId: string): FakeTransfer => {
    const transfer = fakeTransfer();
    conversationRow(bucketId, conversationId).dispatchEvent(dragEvent('dragstart', transfer));
    return transfer;
  },

  /** Drags over then drops on `target`; returns whether the drag was accepted at dragover. */
  drop: (target: HTMLElement, transfer: FakeTransfer): boolean => {
    target.dispatchEvent(dragEvent('dragenter', transfer));
    const over = dragEvent('dragover', transfer);
    target.dispatchEvent(over);
    target.dispatchEvent(dragEvent('drop', transfer));
    return over.defaultPrevented;
  },

  libraryButton: (): HTMLButtonElement | null =>
    document.querySelector<HTMLButtonElement>('.gv-folder-library-btn'),
};
