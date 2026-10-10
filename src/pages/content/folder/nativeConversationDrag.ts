import { extractConversationData, extractConversationId } from './nativeConversationIds';
import { extractNativeDragTitle } from './nativeConversationTitles';
import { getNativeConversationElements } from './nativeSidebarDom';
import type { ConversationReference, DragData } from './types';

const SELECTED_CLASS = 'gv-conversation-selected';
const ROW_MENU_BUTTON =
  '[data-test-id="actions-menu-button"], [data-test-id="conversation-actions-menu-icon-button"]';

/** What a native sidebar row needs from the selection that owns its state. */
export type NativeRowSelection = {
  longPressMs: number;
  schedule: (callback: () => void, delay: number) => number;
  clearTimer: (timer: number) => void;
  /** A programmatic batch delete is driving Gemini's own menus. */
  isBatchDeleting: () => boolean;
  isMultiSelectMode: () => boolean;
  isSelected: (conversationId: string) => boolean;
  selectedIds: () => readonly string[];
  enterMultiSelect: (conversationId: string) => void;
  toggle: (conversationId: string) => void;
  /** Makes `conversationId` the only selected chat. */
  selectOnly: (conversationId: string) => void;
  /** Marks every row again from the selection. */
  refresh: () => void;
  /** A drag ended: drop the selection it made unless multi-select holds it. */
  endDrag: () => void;
  accountIsolationEnabled: () => boolean;
  findConversationElement: (conversationId: string) => HTMLElement | null;
  setDragImage: (event: DragEvent, label: string) => void;
};

function debug(level: 'log' | 'warn', ...args: unknown[]): void {
  try {
    if (localStorage.getItem('gvFolderDebug') === '1') console[level]('[FolderManager]', ...args);
  } catch {
    /* Debugging must not affect dragging. */
  }
}

/** A selected chat's row: in the folder panel, else in Gemini's own list. */
export function findConversationElement(
  conversationId: string,
  panel: HTMLElement | null,
  sidebar: HTMLElement | null,
): HTMLElement | null {
  const folderConv = panel?.querySelector<HTMLElement>(
    `[data-conversation-id="${conversationId}"]`,
  );
  if (folderConv) return folderConv;
  for (const conv of Array.from(getNativeConversationElements(sidebar))) {
    if (extractConversationId(conv as HTMLElement) === conversationId) return conv as HTMLElement;
  }
  return null;
}

/** A small label under the pointer instead of the browser's snapshot of the row. */
export function setLightweightDragImage(
  event: DragEvent,
  label: string,
  images: Set<HTMLElement>,
  schedule: (callback: () => void, delay: number) => number,
): void {
  const transfer = event.dataTransfer;
  if (!transfer || typeof transfer.setDragImage !== 'function') return;

  const dragImage = document.createElement('div');
  dragImage.className = 'gv-folder-drag-image';
  dragImage.textContent = label;
  document.body.appendChild(dragImage);

  try {
    transfer.setDragImage(dragImage, 12, 12);
  } catch {
    dragImage.remove();
    return;
  }

  images.add(dragImage);
  schedule(() => {
    dragImage.remove();
    images.delete(dragImage);
  }, 0);
}

/** The drag data for every selected chat whose row is still on the page. */
function multiDragData(selection: NativeRowSelection): DragData {
  const conversations: ConversationReference[] = [];
  for (const id of selection.selectedIds()) {
    const row = selection.findConversationElement(id);
    if (!row) continue;
    const data = extractConversationData(row, selection.accountIsolationEnabled());
    conversations.push({
      conversationId: id,
      title: extractNativeDragTitle(row, id),
      url: data.url,
      addedAt: Date.now(),
      isGem: data.isGem,
      gemId: data.gemId,
    });
  }
  return { type: 'conversation', title: `${conversations.length} conversations`, conversations };
}

function setSelectedOpacity(selection: NativeRowSelection, opacity: string): void {
  for (const id of selection.selectedIds()) {
    const row = selection.findConversationElement(id);
    if (row) row.style.opacity = opacity;
  }
}

function onDragStart(
  element: HTMLElement,
  selection: NativeRowSelection,
  e: DragEvent,
  cancelLongPress: () => void,
): void {
  const conversationId = extractConversationId(element);
  // Restrict to move-only to prevent Chrome from triggering split-screen/tab tiling
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';

  // If this conversation is not selected, select it exclusively
  if (!selection.isSelected(conversationId)) {
    selection.selectOnly(conversationId);
    element.classList.add(SELECTED_CLASS);
    selection.refresh();
  }
  cancelLongPress();

  if (selection.selectedIds().length > 1) {
    const dragData = multiDragData(selection);
    e.dataTransfer?.setData('application/json', JSON.stringify(dragData));
    selection.setDragImage(e, dragData.title);
    setSelectedOpacity(selection, '0.5');
    return;
  }

  const title = extractNativeDragTitle(element, conversationId);
  const data = extractConversationData(element, selection.accountIsolationEnabled());
  debug('log', 'Drag start:', { title, isGem: data.isGem, gemId: data.gemId, url: data.url });
  const dragData: DragData = {
    type: 'conversation',
    conversationId,
    title,
    url: data.url,
    isGem: data.isGem,
    gemId: data.gemId,
  };
  e.dataTransfer?.setData('application/json', JSON.stringify(dragData));
  selection.setDragImage(e, title);
  element.style.opacity = '0.5';
}

/**
 * Makes a Gemini sidebar row draggable into folders: a long press enters
 * multi-select, clicks then toggle rows, and a drag carries the selection.
 * Binding the same row again does nothing.
 */
export function bindNativeConversationRow(
  element: HTMLElement,
  selection: NativeRowSelection,
): void {
  // The row can be offered more than once (sidebar success path + document
  // sweep on fallback, MutationObserver re-entry, route change re-scans).
  if (element.dataset.gvConvDragAttached === 'true') return;
  element.dataset.gvConvDragAttached = 'true';
  element.draggable = true;
  element.style.cursor = 'grab';

  let longPressTriggered = false;
  let longPressTimer: number | null = null;
  const cancelLongPress = () => {
    if (longPressTimer) selection.clearTimer(longPressTimer);
    longPressTimer = null;
  };

  element.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    longPressTriggered = false;
    const conversationId = extractConversationId(element);
    longPressTimer = selection.schedule(() => {
      longPressTriggered = true;
      selection.enterMultiSelect(conversationId);
      element.classList.add(SELECTED_CLASS);
    }, selection.longPressMs);
  });
  element.addEventListener('mouseup', cancelLongPress);
  element.addEventListener('mouseleave', cancelLongPress);

  // Capture phase, to intercept before Gemini navigates.
  element.addEventListener(
    'click',
    (e) => {
      // The row's ⋮ menu must open (batch delete clicks it programmatically),
      // and a running batch delete drives every click through Gemini's menus.
      if (e.target instanceof Element && e.target.closest(ROW_MENU_BUTTON)) return;
      if (selection.isBatchDeleting()) return;
      if (longPressTriggered) {
        e.preventDefault();
        e.stopPropagation();
        longPressTriggered = false;
        return;
      }
      if (!selection.isMultiSelectMode()) return;
      e.preventDefault();
      e.stopPropagation();
      const conversationId = extractConversationId(element);
      selection.toggle(conversationId);
      element.classList.toggle(SELECTED_CLASS, selection.isSelected(conversationId));
      selection.refresh();
    },
    true,
  );

  element.addEventListener('dragstart', (e) => onDragStart(element, selection, e, cancelLongPress));

  element.addEventListener('dragend', () => {
    if (selection.selectedIds().length > 1) setSelectedOpacity(selection, '1');
    else element.style.opacity = '1';
    selection.endDrag();
  });
}
