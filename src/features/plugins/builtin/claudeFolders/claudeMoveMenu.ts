/**
 * "Move to folder" in a Claude sidebar row's "More options" menu, next to
 * Claude's own "Add to project" and "Move to group".
 *
 * Observed live (2026-10-19): opening the menu changes nothing inside the
 * sidebar (its trigger keeps `aria-expanded="false"`), and the menu is
 * portaled to `body`, so no sidebar pass sees it open. Instead a press or key
 * inside the sidebar starts a short frame-by-frame look for an open row menu
 * (`openRowMenus`). A closed menu stays mounted with `data-closed`, and Base UI
 * may reuse it, so an entry is kept only while it names that menu's row.
 */
import type { ConversationReference } from '@/core/types/folder';
import { CLAUDE_IDENTITY } from '@/features/folder/sites/claudeIdentity';

import { MenuCloseWait, buildMenuEntry, wireMenuKeyboard } from '../siteFolders/moveMenuEntry';
import type { SidebarConversation, SiteMoveMenu, SiteMoveMenuOptions } from '../siteFolders/types';
import {
  closeMenu,
  findClaudeSidebar,
  menuItemsOf,
  openRowMenus,
  readSidebarTitle,
} from './claudeSidebarDom';

export const CLAUDE_MOVE_ENTRY_ATTR = 'data-gv-claude-move-to-folder';
/** Frames to look for the menu a press in the sidebar opens. */
const MENU_WAIT_FRAMES = 20;
const OPENING_EVENTS = ['pointerdown', 'keydown', 'contextmenu'] as const;

/** Base UI's folder icon is a sized `[data-cds="Icon"]` span; keep its size, drop its glyph. */
function swapInFolderIcon(entry: HTMLElement): void {
  const holder = entry.querySelector<HTMLElement>('[data-cds="Icon"]');
  const icon = entry.querySelector('svg');
  if (!holder || !icon) return;
  const span = document.createElement('span');
  span.setAttribute('aria-hidden', 'true');
  span.setAttribute('style', holder.getAttribute('style') ?? '');
  span.style.display = 'inline-flex';
  icon.setAttribute('width', '1em');
  icon.setAttribute('height', '1em');
  span.append(icon);
  holder.replaceWith(span);
  entry.querySelector('[data-cds="Shortcut"]')?.remove();
}

export class ClaudeMoveMenu implements SiteMoveMenu {
  private readonly closeWait: MenuCloseWait;
  private frame: number | null = null;
  private framesLeft = 0;
  private listening = false;
  /** Entries this menu added, each with the removal of its listener on Claude's menu. */
  private readonly entries = new Map<Element, () => void>();

  constructor(
    private readonly options: SiteMoveMenuOptions,
    private readonly doc: Document = document,
  ) {
    this.closeWait = new MenuCloseWait(doc);
  }

  /** The sidebar is (re)found; listen for presses that may open a row menu. */
  check(sidebar: HTMLElement | null): boolean {
    if (sidebar && !this.listening) {
      this.listening = true;
      for (const type of OPENING_EVENTS) this.doc.addEventListener(type, this.onPress, true);
    }
    return false;
  }

  dispose(): void {
    this.closeWait.cancel();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.listening) {
      for (const type of OPENING_EVENTS) this.doc.removeEventListener(type, this.onPress, true);
      this.listening = false;
    }
    for (const entry of this.entries.keys()) this.drop(entry);
  }

  /** Removes `entry` and, when it is one of ours, its listener on the menu Base UI keeps. */
  private drop(entry: Element): void {
    this.entries.get(entry)?.();
    this.entries.delete(entry);
    entry.remove();
  }

  private readonly onPress = (event: Event): void => {
    const target = event.target;
    if (!(target instanceof Node) || !findClaudeSidebar(this.doc)?.contains(target)) return;
    this.framesLeft = MENU_WAIT_FRAMES;
    if (this.frame === null) this.frame = requestAnimationFrame(this.look);
  };

  private readonly look = (): void => {
    this.frame = null;
    let injected = false;
    if (this.options.canFile()) {
      for (const { menu, trigger, row } of openRowMenus(this.doc)) {
        injected = this.inject(menu, trigger, row) || injected;
      }
    }
    this.framesLeft -= 1;
    if (!injected && this.framesLeft > 0) this.frame = requestAnimationFrame(this.look);
  };

  /** Adds the entry to `menu` unless it already holds one for this row; true once it has one. */
  private inject(menu: HTMLElement, trigger: HTMLElement, row: SidebarConversation): boolean {
    for (const stale of menu.querySelectorAll(`[${CLAUDE_MOVE_ENTRY_ATTR}]`)) {
      if (stale.getAttribute(CLAUDE_MOVE_ENTRY_ATTR) === row.id) return true;
      this.drop(stale);
    }
    const items = menuItemsOf(menu);
    const template =
      items.find((item) => item.dataset.testid === 'rename-chat-trigger') ??
      items.find((item) => !item.hasAttribute('aria-haspopup'));
    if (!template) return false;

    const conversation: ConversationReference = {
      conversationId: `${CLAUDE_IDENTITY.prefix}${row.id}`,
      title: readSidebarTitle(row) || this.options.untitled(),
      url: `${this.doc.location.origin}${row.path}`,
      addedAt: 0,
    };
    const entry = buildMenuEntry(template, this.options.label(), CLAUDE_MOVE_ENTRY_ATTR, [
      'data-testid',
      'aria-keyshortcuts',
    ]);
    entry.setAttribute(CLAUDE_MOVE_ENTRY_ATTR, row.id);
    swapInFolderIcon(entry);
    const activate = (): void => {
      closeMenu(menu);
      this.closeWait.run(trigger, () =>
        this.options.onMove({ ...conversation, addedAt: Date.now() }),
      );
    };
    entry.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    });
    this.entries.set(
      entry,
      wireMenuKeyboard(menu, entry, () => menuItemsOf(menu), activate),
    );
    // After Claude's own "Move to group" or "Add to project" (its submenus), else last.
    const submenus = items.filter((item) => item.hasAttribute('aria-haspopup'));
    const anchor = submenus.at(-1) ?? items.at(-1) ?? null;
    if (!anchor) return false;
    anchor.after(entry);
    return true;
  }
}
