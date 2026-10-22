/**
 * Renaming a filed conversation with the site's own rename, from `rowMenu.rename`
 * in its `folders` section: open the row's menu, choose its rename item, and
 * let the site put its name field in the row. The site saves the name and
 * title sync brings it into the folders, so the name stays the site's. Nothing
 * reloads.
 *
 * The trigger is pressed as a menu library opens on (a primary pointerdown,
 * not a click). The rename item is the menu's `plainItem`-th item without a
 * submenu, leaving out Voyager's own entry: the labels are translated and the
 * site's items carry no attribute that names them, so position is all there is
 * to go on. Only the site's name field taking focus in the row confirms the
 * item was Rename; anything else reports no rename, and the folders keep their
 * titles.
 */
import type { FoldersRowMenu } from '@/features/plugins/sites/sections/foldersData';

import { SUBMENU_ITEM, closeMenu, itemsOf, menuOf, nextFrame } from './rowMenuDom';
import type { SectionDom } from './sectionDom';
import type { NativeRenameOptions } from './types';

/** Frames to wait for the menu, as "Move to folder" does. */
const MENU_WAIT_FRAMES = 10;
/** Frames the row stays revealed while the site's name field takes focus. */
const FIELD_WAIT_FRAMES = 30;

export interface RowRenameSite {
  readonly dom: Pick<SectionDom, 'rowElement' | 'list' | 'title'>;
  /** Marks Voyager's own "Move to folder" entry, which is never the site's rename. */
  readonly entryAttribute: string;
}

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

/** The site's name field in `row`: focused and editable. */
function focusedNameField(row: HTMLElement | null, doc: Document): HTMLElement | null {
  const field = doc.activeElement;
  if (!(field instanceof HTMLElement)) return null;
  const editable =
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    field.isContentEditable;
  // The library gives focus back to the trigger, which is in the row too, after any other item.
  return editable && row?.contains(field) ? field : null;
}

/**
 * The site's rename for bare id `id`: resolves to the title the row showed
 * before once the site's name field has focus, or `null` when the row, its
 * menu or the field never appeared (a chat on a history page the sidebar has
 * not loaded, or a menu whose rename item is elsewhere).
 */
export function createRowRename(
  spec: FoldersRowMenu,
  plainItem: number,
  site: RowRenameSite,
  doc: Document = document,
): (id: string, options: NativeRenameOptions) => Promise<string | null> {
  const renameItemOf = (menu: HTMLElement): HTMLElement | null =>
    itemsOf(menu, spec.item).filter(
      (item) => !item.matches(SUBMENU_ITEM) && !item.hasAttribute(site.entryAttribute),
    )[plainItem] ?? null;

  return async (id, options) => {
    const row = site.dom.rowElement(id, doc);
    const conversation = row ? site.dom.list(row).find((found) => found.id === id) : undefined;
    const trigger = row?.querySelector<HTMLElement>(spec.trigger);
    if (!conversation || !trigger) return null;
    const shownTitle = site.dom.title(conversation);
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
      const menu = await waitFor(
        () => menuOf(spec, trigger, doc),
        MENU_WAIT_FRAMES,
        options.active,
      );
      if (!menu) return null;
      const rename = renameItemOf(menu);
      if (!rename || !options.active()) {
        closeMenu(menu);
        return null;
      }
      rename.click();
      // Keep the row shown until the field has focus. The site may render the row
      // again, so look it up by id each frame.
      const field = await waitFor(
        () => focusedNameField(site.dom.rowElement(id, doc), doc),
        FIELD_WAIT_FRAMES,
        options.active,
      );
      return field ? shownTitle : null;
    } finally {
      // The hiding rule spares a row that holds focus, so the field stays shown.
      release();
    }
  };
}
