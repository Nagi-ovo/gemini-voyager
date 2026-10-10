/**
 * The default menu behind a folder header button: a body-level popover below
 * the button, so a scrolling, clipping sidebar cannot cut it. The popover layer
 * owns Escape, Tab, outside presses and following the button.
 */
import { openPopover } from '@/core/ui/layer';

import type { FolderHeaderMenuItem } from './folderHeader';
import menuCss from './folderHeaderMenu.css?raw';

const ITEM_CLASS = 'gv-folder-header-menu-item';

let open: { anchor: HTMLElement; close: () => void } | null = null;

function moveFocus(items: HTMLButtonElement[], from: Element | null, step: number): void {
  const index = items.findIndex((item) => item === from);
  const next = (index + step + items.length) % items.length;
  items[next]?.focus({ preventScroll: true });
}

/**
 * Opens a popover below a header button, holding what `fill` puts in its
 * container (classed `gv-folder-header-menu`); pressing the same button again
 * closes it. One is open at a time, across every header. `fill` returns what
 * to focus first.
 */
export function openFolderHeaderPopover(
  anchor: HTMLButtonElement,
  options: {
    popup: 'menu' | 'dialog';
    /** Its own sheet, after the menu's. */
    css?: string;
    fill: (container: HTMLElement, close: () => void, root: ShadowRoot) => HTMLElement | null;
  },
): void {
  const wasOpen = open?.anchor === anchor;
  closeFolderHeaderMenu();
  if (wasOpen) return;

  const finish = (): void => {
    anchor.setAttribute('aria-expanded', 'false');
    // Compare the entry, not popover.close: `open` holds the wrapper below, and a
    // stale entry made the button's next press "close" it instead of opening.
    if (open === entry) open = null;
  };
  const popover = openPopover({
    anchor,
    side: 'below',
    align: 'end',
    css: options.css ? `${menuCss}\n${options.css}` : menuCss,
    anchorToggles: true,
    onDismiss: finish,
  });
  const close = (): void => {
    popover.close();
    finish();
  };
  const entry = { anchor, close };
  open = entry;
  anchor.setAttribute('aria-haspopup', options.popup);
  anchor.setAttribute('aria-expanded', 'true');

  const container = document.createElement('div');
  container.className = 'gv-folder-header-menu';
  container.setAttribute('role', options.popup);
  const first = options.fill(container, close, popover.root);
  popover.root.append(container);
  popover.place();
  first?.focus({ preventScroll: true });
}

/** Opens `items` below `anchor`; pressing the same button again closes the menu. */
export function openFolderHeaderMenu(
  anchor: HTMLButtonElement,
  items: readonly FolderHeaderMenuItem[],
): void {
  if (items.length === 0) {
    closeFolderHeaderMenu();
    return;
  }
  openFolderHeaderPopover(anchor, {
    popup: 'menu',
    fill: (menu, close, root) => {
      const buttons = items.map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = ITEM_CLASS;
        button.setAttribute('role', 'menuitem');
        // Icons are the module's own constant SVG markup, never page text.
        if (item.iconHtml) button.insertAdjacentHTML('afterbegin', item.iconHtml);
        button.append(item.label);
        button.addEventListener('click', () => {
          close();
          item.action();
        });
        return button;
      });
      menu.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
        if (step === 0) return;
        event.preventDefault();
        moveFocus(buttons, root.activeElement, step);
      });
      menu.append(...buttons);
      return buttons[0] ?? null;
    },
  });
}

/** Closes the open header menu, if any. */
export function closeFolderHeaderMenu(): void {
  open?.close();
  open = null;
}
