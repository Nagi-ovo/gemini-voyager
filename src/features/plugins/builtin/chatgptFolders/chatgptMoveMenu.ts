/**
 * "Move to folder" in a sidebar row's "Chat actions" menu: with the row drag in
 * `chatgptRowDrag.ts`, how a conversation gets from the sidebar into a folder
 * without opening it first, and the way that needs no pointer.
 *
 * Observed live (2026-10-01): the menu is a Radix menu portaled under `body` and
 * labelled by the row's trigger, which reads `aria-expanded="true"` while it is
 * open. The entry is a clone of a native item, so it inherits ChatGPT's look and
 * hover. Radix's roving focus only knows the items React registered, so a DOM
 * attribute cannot add the clone to it; `wireKeyboard` steps the arrow keys into
 * and out of the entry instead. Selecting it closes the menu with the Escape
 * Radix listens for, which also returns focus to the trigger.
 */
import type { ConversationReference } from '@/core/types/folder';

import { CHATGPT_CONVERSATION_ID_PREFIX } from './chatgptIdentity';
import {
  closeMenu,
  findMenuOf,
  menuItemsOf,
  readMenuConversation,
  readSidebarTitle,
} from './chatgptSidebarDom';

export const MOVE_ENTRY_ATTR = 'data-gv-chatgpt-move-to-folder';

const OPEN_TRIGGER_SELECTOR = 'button[aria-haspopup="menu"][aria-expanded="true"][id]';
const FOLDER_ICON_PATH =
  'M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h240l80 80h320q33 0 56.5 23.5T880-640v400q0 33-23.5 56.5T800-160H160Zm0-80h640v-400H447l-80-80H160v480Zm0 0v-480 480Z';

function folderIcon(): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 -960 960 960');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', FOLDER_ICON_PATH);
  svg.append(path);
  return svg;
}

/** A native item's look with this entry's icon and label, and no Radix wiring. */
function buildEntry(template: Element, label: string): HTMLElement {
  const entry = template.cloneNode(true) as HTMLElement;
  for (const name of [
    'id',
    'data-radix-collection-item',
    'data-highlighted',
    'data-disabled',
    'aria-disabled',
    'aria-haspopup',
    'aria-expanded',
    'aria-controls',
    'data-state',
  ]) {
    entry.removeAttribute(name);
  }
  entry.setAttribute(MOVE_ENTRY_ATTR, '');
  entry.setAttribute('tabindex', '-1');
  const icon = folderIcon();
  const nativeIcon = entry.querySelector('svg');
  if (nativeIcon) {
    // ChatGPT's native sprite SVG has no aria-hidden wrapper. Keep its sizing class.
    icon.setAttribute('class', nativeIcon.getAttribute('class') ?? '');
    nativeIcon.replaceWith(icon);
  } else {
    const holder = entry.querySelector('[aria-hidden="true"]');
    if (holder) holder.replaceChildren(icon);
    else entry.prepend(icon);
  }
  const texts: Text[] = [];
  const walker = document.createTreeWalker(entry, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeValue?.trim() && !icon.contains(node)) texts.push(node as Text);
  }
  if (texts.length === 0) {
    entry.append(label);
  } else {
    texts[0].nodeValue = label;
    for (const extra of texts.slice(1)) extra.remove();
  }
  return entry;
}

const ACTIVATE_KEYS = new Set(['Enter', ' ']);

function isEnabled(item: Element): boolean {
  return !item.hasAttribute('data-disabled') && item.getAttribute('aria-disabled') !== 'true';
}

function claim(event: KeyboardEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Arrow keys into and out of the entry. Radix handles them in React handlers
 * delegated to an ancestor, so a listener on the menu itself runs first and can
 * keep Radix from moving past the entry. Everything else (Escape, Tab,
 * typeahead) still reaches Radix.
 */
function wireKeyboard(menu: HTMLElement, entry: HTMLElement, activate: () => void): void {
  const neighbour = (step: 1 | -1): HTMLElement | null => {
    const items = menuItemsOf(menu).filter((item) => item === entry || isEnabled(item));
    return items[items.indexOf(entry) + step] ?? null;
  };
  entry.addEventListener('focus', () => entry.setAttribute('data-highlighted', ''));
  entry.addEventListener('blur', () => entry.removeAttribute('data-highlighted'));
  entry.addEventListener('keydown', (event) => {
    if (ACTIVATE_KEYS.has(event.key)) {
      claim(event);
      activate();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      claim(event);
      neighbour(event.key === 'ArrowDown' ? 1 : -1)?.focus();
    }
  });
  menu.addEventListener('keydown', (event) => {
    if (!entry.isConnected || !(event.target instanceof HTMLElement)) return;
    const from = event.key === 'ArrowDown' ? -1 : event.key === 'ArrowUp' ? 1 : 0;
    if (from === 0 || event.target !== neighbour(from)) return;
    claim(event);
    entry.focus();
  });
}

export interface MoveMenuOptions {
  readonly label: () => string;
  readonly untitled: () => string;
  /** Whether a conversation can be filed right now (the store is ready). */
  readonly canFile: () => boolean;
  readonly onMove: (conversation: ConversationReference) => void;
}

/** Frames to wait for a menu whose content was not rendered with its trigger. */
const MENU_WAIT_FRAMES = 10;
/** Frames to wait for a closed menu to hand focus back to its trigger. */
const CLOSE_WAIT_FRAMES = 30;

/**
 * Adds the entry to a row's open "Chat actions" menu. `check` runs after every
 * sidebar change and leaves an entry already in the open menu alone. It returns
 * whether to check again next frame: a trigger is open but its menu is not
 * rendered yet. That wait is bounded per trigger.
 */
export class ChatGptMoveMenu {
  private waitingFor: Element | null = null;
  private waitedFrames = 0;
  private pendingMove: number | null = null;

  constructor(
    private readonly options: MoveMenuOptions,
    private readonly doc: Document = document,
  ) {}

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
    if (this.pendingMove !== null) cancelAnimationFrame(this.pendingMove);
    this.pendingMove = null;
  }

  /**
   * Runs `move` once Radix has returned focus to the closed menu's trigger,
   * which it does a task after unmounting the menu (later still while an exit
   * animation runs). A picker opened before that loses its search box's focus
   * to the trigger. The wait is bounded in case focus never comes back.
   */
  private afterClose(trigger: HTMLElement, move: () => void): void {
    this.cancel();
    let frames = 0;
    const tick = (): void => {
      this.pendingMove = null;
      frames += 1;
      const settled = this.doc.activeElement === trigger || !trigger.isConnected;
      if (settled || frames >= CLOSE_WAIT_FRAMES) {
        move();
        return;
      }
      this.pendingMove = requestAnimationFrame(tick);
    };
    this.pendingMove = requestAnimationFrame(tick);
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
    const entry = buildEntry(template, this.options.label());
    const activate = (): void => {
      closeMenu(menu);
      this.afterClose(trigger, () => this.options.onMove({ ...conversation, addedAt: Date.now() }));
    };
    entry.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      activate();
    });
    wireKeyboard(menu, entry, activate);
    // Next to ChatGPT's own "Move to project" (its only submenu), else last.
    const anchor = items.find((item) => item.hasAttribute('aria-haspopup')) ?? items.at(-1);
    anchor?.after(entry);
  }
}
