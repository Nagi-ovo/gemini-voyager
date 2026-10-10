/**
 * Reads ChatGPT's own sidebar. Rows are found by their conversation links, not
 * classes: every row link is `/c/<id>` or `/g/<project>/c/<id>`. See the fixture
 * (`__tests__/chatgptSidebarFixture.ts`) for the live structure this follows.
 */
import { readChatGptConversationPath } from './chatgptIdentity';

/** The scroll area that holds Projects and Recents; only the real sidebar has one. */
const SIDEBAR_SCROLL_SELECTOR = '[data-app-action-sidebar-scroll]';
const SIDEBAR_CANDIDATE_SELECTOR = 'nav, #stage-slideover-sidebar';
/** Recents: the history list Voyager's folder section sits above. */
const HISTORY_CONTAINER_SELECTOR = '[data-sidebar-project-container-id="chats"]';
const HISTORY_DROP_TARGET_SELECTOR = '[data-chatgpt-project-conversation-drop-target]';
const ROW_SELECTOR = '[role="listitem"]';
const ROW_LINK_SELECTOR = 'a[href]';
const MENU_ITEM_SELECTOR = '[role="menuitem"]';

export interface SidebarConversation {
  readonly id: string;
  /** The route the row links to, e.g. `/g/g-p-<project>/c/<id>`. */
  readonly path: string;
  readonly link: HTMLAnchorElement;
}

/**
 * ChatGPT's sidebar, or `null` while it is not rendered. The app rail is also a
 * labelled `nav`, so match the one with the sidebar's scroll area.
 */
export function findChatGptSidebar(doc: Document = document): HTMLElement | null {
  for (const candidate of doc.querySelectorAll<HTMLElement>(SIDEBAR_CANDIDATE_SELECTOR)) {
    if (candidate.querySelector(SIDEBAR_SCROLL_SELECTOR)) return candidate;
  }
  return null;
}

/**
 * Where the folder section goes: just before Recents, outside its drop target
 * and list, so ChatGPT's own Project drag never treats it as part of history.
 */
export function findHistoryAnchor(sidebar: HTMLElement): HTMLElement | null {
  const history = sidebar.querySelector<HTMLElement>(HISTORY_CONTAINER_SELECTOR);
  if (!history) return null;
  return history.closest<HTMLElement>(HISTORY_DROP_TARGET_SELECTOR) ?? history;
}

/** The conversation a sidebar link opens, or `null` for any other link. */
export function readSidebarLink(link: Element): SidebarConversation | null {
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.target && link.target !== '_self') return null;
  const route = readChatGptConversationPath(link.getAttribute('href'));
  return route ? { ...route, link } : null;
}

/** Every conversation row the sidebar renders right now, in sidebar order. */
export function listSidebarConversations(sidebar: ParentNode): SidebarConversation[] {
  const rows: SidebarConversation[] = [];
  for (const link of sidebar.querySelectorAll(ROW_LINK_SELECTOR)) {
    const row = readSidebarLink(link);
    if (row) rows.push(row);
  }
  return rows;
}

/** A row's title as ChatGPT shows it; empty while it has none. */
export function readSidebarTitle(row: SidebarConversation): string {
  return (row.link.textContent ?? '').trim();
}

/** The row element (the hover target with its buttons) that holds `link`. */
export function sidebarRowOf(link: Element): HTMLElement | null {
  return link.closest<HTMLElement>(ROW_SELECTOR);
}

/** Conversation `id`'s row in Recents or a Project, or `null` while none is rendered. */
export function findSidebarRow(
  sidebar: ParentNode | null,
  id: string,
): { readonly row: HTMLElement; readonly conversation: SidebarConversation } | null {
  for (const conversation of sidebar ? listSidebarConversations(sidebar) : []) {
    const row = conversation.id === id ? sidebarRowOf(conversation.link) : null;
    if (row) return { row, conversation };
  }
  return null;
}

/** The open menu Radix labels by `trigger`, wherever it is portaled. */
export function findMenuOf(trigger: Element, doc: Document = document): HTMLElement | null {
  // Radix ids (`radix-:r1a:`) need escaping in a selector; compare instead.
  return (
    [...doc.querySelectorAll<HTMLElement>('[role="menu"][aria-labelledby]')].find(
      (menu) => menu.getAttribute('aria-labelledby') === trigger.id,
    ) ?? null
  );
}

/** Closes a Radix menu with the Escape it listens for, which returns focus to its trigger. */
export function closeMenu(menu: HTMLElement): void {
  menu.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
}

/** `menu`'s own items, in order, leaving out those of a submenu inside it. */
export function menuItemsOf(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].filter(
    (item) => item.closest('[role="menu"]') === menu,
  );
}

/**
 * The conversation whose "Chat actions" menu `menu` is: Radix labels the menu by
 * its trigger, which sits in the conversation's sidebar row. `null` for any
 * other menu, including a Project's or the account menu.
 */
export function readMenuConversation(
  menu: Element,
  doc: Document = document,
): SidebarConversation | null {
  const triggerId = menu.getAttribute('aria-labelledby');
  const trigger = triggerId ? doc.getElementById(triggerId) : null;
  if (!trigger?.closest(SIDEBAR_CANDIDATE_SELECTOR)) return null;
  const row = sidebarRowOf(trigger);
  if (!row) return null;
  for (const link of row.querySelectorAll(ROW_LINK_SELECTOR)) {
    const conversation = readSidebarLink(link);
    if (conversation) return conversation;
  }
  return null;
}
