/**
 * Renaming a filed conversation with ChatGPT's own rename, as Gemini's folders
 * use Gemini's: the sidebar row's "Chat actions" menu, then Rename, which puts
 * ChatGPT's name field in the row. ChatGPT saves the name and title sync brings
 * it into the folders, so the name stays ChatGPT's. Nothing reloads.
 *
 * The trigger is a Radix menu trigger, which opens on a primary pointerdown,
 * not on click. Rename is the menu's first plain item; "Move to project" is a
 * submenu and "Move to folder" is Voyager's own (see `chatgptMoveMenu.ts`).
 * Position is all there is to go on: the labels are translated and the
 * captured items carry no attribute that names them. So only ChatGPT's name
 * field taking focus in the row confirms the item was Rename; anything else
 * reports no rename, and the folders keep their titles.
 */
import { MOVE_ENTRY_ATTR } from './chatgptMoveMenu';
import {
  closeMenu,
  findMenuOf,
  findSidebarRow,
  menuItemsOf,
  readSidebarTitle,
} from './chatgptSidebarDom';

const TRIGGER_SELECTOR = 'button[aria-haspopup="menu"][id]';
/** Frames to wait for the menu, as "Move to folder" does. */
const MENU_WAIT_FRAMES = 10;
/** Frames the row stays revealed while ChatGPT's name field takes focus. */
const FIELD_WAIT_FRAMES = 30;

export interface NativeRenameOptions {
  readonly sidebar: () => HTMLElement | null;
  /**
   * Shows the row while "hide filed chats" hides it, until the release: a
   * hidden row's name field cannot take focus.
   */
  readonly reveal: (id: string) => () => void;
  /** False once the plugin is off; the wait stops. */
  readonly active: () => boolean;
}

const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

async function waitFor<T>(
  read: () => T | null,
  frames: number,
  active: () => boolean,
): Promise<T | null> {
  for (let frame = 0; frame <= frames && active(); frame += 1) {
    const value = read();
    if (value) return value;
    await nextFrame();
  }
  return null;
}

/** ChatGPT's name field for conversation `id`: focused, editable, and in its row. */
function focusedNameField(sidebar: HTMLElement | null, id: string): HTMLElement | null {
  const field = document.activeElement;
  if (!(field instanceof HTMLElement)) return null;
  const editable =
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field.isContentEditable;
  // Radix gives focus back to the trigger, which is in the row too, after any other item.
  return editable && findSidebarRow(sidebar, id)?.row.contains(field) ? field : null;
}

function renameItemOf(menu: HTMLElement): HTMLElement | null {
  return (
    menuItemsOf(menu).find(
      (item) => !item.hasAttribute('aria-haspopup') && !item.hasAttribute(MOVE_ENTRY_ATTR),
    ) ?? null
  );
}

/**
 * Opens ChatGPT's name field for conversation `id` (its bare id). Resolves to
 * the title the row showed before once the field has focus, or `null` when the
 * row, its menu or the field never appeared: a chat on a history page the
 * sidebar has not loaded, or a menu whose first plain item is not Rename.
 */
export async function openNativeRename(
  id: string,
  options: NativeRenameOptions,
): Promise<string | null> {
  const found = findSidebarRow(options.sidebar(), id);
  const trigger = found?.row.querySelector<HTMLElement>(TRIGGER_SELECTOR);
  if (!found || !trigger) return null;
  const nativeTitle = readSidebarTitle(found.conversation);
  const release = options.reveal(id);
  try {
    trigger.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        button: 0,
        isPrimary: true,
        pointerType: 'mouse',
      }),
    );
    const menu = await waitFor(() => findMenuOf(trigger), MENU_WAIT_FRAMES, options.active);
    if (!menu) return null;
    const rename = renameItemOf(menu);
    if (!rename || !options.active()) {
      closeMenu(menu);
      return null;
    }
    rename.click();
    // Keep the row shown until the field has focus. React may render the row
    // again, so look it up by id each frame.
    const field = await waitFor(
      () => focusedNameField(options.sidebar(), id),
      FIELD_WAIT_FRAMES,
      options.active,
    );
    return field ? nativeTitle : null;
  } finally {
    // The hiding rule spares a row that holds focus, so the field stays shown.
    release();
  }
}
