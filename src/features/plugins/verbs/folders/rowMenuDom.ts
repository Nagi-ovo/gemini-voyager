/**
 * Reading a site's own row menu from the `rowMenu` part of its `folders`
 * section: the open menu a trigger labels, its own items, and closing it the
 * way its library listens for. Shared by "Move to folder" (`rowMenu.ts`) and
 * the site's own rename (`rowRename.ts`).
 */
import type { FoldersRowMenu } from '@/features/plugins/sites/sections/foldersData';

/** An item that opens a submenu ("Move to project", "Add to project"). */
export const SUBMENU_ITEM = '[aria-haspopup]';

/** `menu`'s own items, in order, leaving out those of a submenu inside it. */
export function itemsOf(menu: HTMLElement, selector: string): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(selector)].filter((item) => {
    const nested = item.parentElement?.closest('[role="menu"]');
    return !nested || nested === menu || nested.contains(menu);
  });
}

/** Closes a menu with the Escape its library listens for, which returns focus to its trigger. */
export function closeMenu(menu: HTMLElement): void {
  menu.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
}

/** The open menu `spec` describes that `trigger` labels, wherever it is portaled. */
export function menuOf(
  spec: FoldersRowMenu,
  trigger: Element,
  doc: Document = document,
): HTMLElement | null {
  if (!trigger.id) return null;
  // Library ids (`radix-:r1a:`) need escaping in a selector; compare instead.
  for (const menu of doc.querySelectorAll<HTMLElement>(spec.menu)) {
    const ids = (menu.getAttribute('aria-labelledby') ?? '').split(/\s+/);
    if (ids.includes(trigger.id)) return menu;
  }
  return null;
}

/** One animation frame. */
export const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));
