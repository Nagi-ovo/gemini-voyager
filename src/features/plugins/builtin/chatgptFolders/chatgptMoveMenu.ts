/**
 * "Move to folder" in a sidebar row's "Chat actions" menu: with the row drag in
 * `../siteFolders/rowDrag.ts`, how a conversation gets from the sidebar into a folder
 * without opening it first, and the way that needs no pointer.
 *
 * Observed live (2026-10-01): the menu is a Radix menu portaled under `body` and
 * labelled by the row's trigger, which reads `aria-expanded="true"` while it is
 * open. The entry is the shared clone of a native item (`../siteFolders/moveMenuEntry.ts`).
 * Selecting it closes the menu with the Escape Radix listens for, which also
 * returns focus to the trigger.
 */
import type { ConversationReference } from '@/core/types/folder';
import { CHATGPT_CONVERSATION_ID_PREFIX } from '@/features/folder/sites/chatgptIdentity';

import { MenuCloseWait, buildMenuEntry, wireMenuKeyboard } from '../siteFolders/moveMenuEntry';
import type { SiteMoveMenu, SiteMoveMenuOptions } from '../siteFolders/types';
import {
  closeMenu,
  findMenuOf,
  menuItemsOf,
  readMenuConversation,
  readSidebarTitle,
} from './chatgptSidebarDom';

export const MOVE_ENTRY_ATTR = 'data-gv-chatgpt-move-to-folder';

const OPEN_TRIGGER_SELECTOR = 'button[aria-haspopup="menu"][aria-expanded="true"][id]';
/** Frames to wait for a menu whose content was not rendered with its trigger. */
const MENU_WAIT_FRAMES = 10;

/**
 * Adds the entry to a row's open "Chat actions" menu. `check` runs after every
 * sidebar change and leaves an entry already in the open menu alone. It returns
 * whether to check again next frame: a trigger is open but its menu is not
 * rendered yet. That wait is bounded per trigger.
 */
export class ChatGptMoveMenu implements SiteMoveMenu {
  private waitingFor: Element | null = null;
  private waitedFrames = 0;
  private readonly closeWait: MenuCloseWait;

  constructor(
    private readonly options: SiteMoveMenuOptions,
    private readonly doc: Document = document,
  ) {
    this.closeWait = new MenuCloseWait(doc);
  }

  check(sidebar: HTMLElement | null): boolean {
    const trigger = sidebar?.querySelector<HTMLElement>(OPEN_TRIGGER_SELECTOR) ?? null;
    if (!trigger || !this.options.canFile()) {
      this.waitingFor = null;
      return false;
    }
    const menu = findMenuOf(trigger, this.doc);
    if (!menu) {
      if (this.waitingFor !== trigger) {
        this.waitingFor = trigger;
        this.waitedFrames = 0;
      }
      this.waitedFrames += 1;
      return this.waitedFrames <= MENU_WAIT_FRAMES;
    }
    this.waitingFor = null;
    if (!menu.querySelector(`[${MOVE_ENTRY_ATTR}]`)) this.inject(menu, trigger);
    return false;
  }

  /** Drops a move that is still waiting for its menu to close. */
  cancel(): void {
    this.closeWait.cancel();
  }

  /** Turning the folders off: no pending move, and no entry left in an open menu. */
  dispose(): void {
    this.cancel();
    for (const entry of this.doc.querySelectorAll(`[${MOVE_ENTRY_ATTR}]`)) entry.remove();
  }

  private inject(menu: HTMLElement, trigger: HTMLElement): void {
    const row = readMenuConversation(menu, this.doc);
    if (!row) return;
    const items = menuItemsOf(menu);
    const template = items.find((item) => !item.hasAttribute('aria-haspopup'));
    if (!template) return;

    const conversation: ConversationReference = {
      conversationId: `${CHATGPT_CONVERSATION_ID_PREFIX}${row.id}`,
      title: readSidebarTitle(row) || this.options.untitled(),
      url: `${this.doc.location.origin}${row.path}`,
      addedAt: 0,
    };
    const entry = buildMenuEntry(template, this.options.label(), MOVE_ENTRY_ATTR, [
      'data-radix-collection-item',
    ]);
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
    wireMenuKeyboard(menu, entry, () => menuItemsOf(menu), activate);
    // Next to ChatGPT's own "Move to project" (its only submenu), else last.
    const anchor = items.find((item) => item.hasAttribute('aria-haspopup')) ?? items.at(-1);
    anchor?.after(entry);
  }
}
