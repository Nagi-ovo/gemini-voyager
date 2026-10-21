import { CLAUDE_IDENTITY } from '@/features/folder/sites/claudeIdentity';

/**
 * Reads Claude's own sidebar, by its test ids and row keys rather than its
 * utility classes. Observed live (2026-10-19), `aside[aria-label="Sidebar"]`:
 *
 *   [data-testid="sidebar"]
 *     [data-testid="sidebar-pinned"]       pinned chats and Projects
 *     [data-testid="sidebar-recents"]      "Recents"
 *       [data-row-key="chat:<id>"]         one row per chat, here and in a Project
 *         a[href="/chat/<id>"][aria-current="page"?]  [data-row-label] title
 *         button[aria-haspopup="menu"][id] "More options for …"
 *
 * The row menu is a Base UI menu portaled to `body`: `[role="menu"]` labelled by
 * its trigger, `[data-open]` while open, with `role="menuitem"` items that carry
 * test ids (`rename-chat-trigger`, `move-to-project-trigger`, …).
 */
import type { SidebarConversation } from '../siteFolders/types';

const SIDEBAR_SELECTOR = '[data-testid="sidebar"]';
const RECENTS_SELECTOR = '[data-testid="sidebar-recents"]';
export const CLAUDE_ROW_SELECTOR = '[data-row-key^="chat:"]';
export const CLAUDE_RECENT_ROW_SELECTOR = `${RECENTS_SELECTOR} ${CLAUDE_ROW_SELECTOR}`;
const ROW_LINK_SELECTOR = 'a[href]';
const MENU_ITEM_SELECTOR = '[role="menuitem"]';

/** Claude's sidebar, or `null` while it is not rendered. */
export function findClaudeSidebar(doc: Document = document): HTMLElement | null {
  return doc.querySelector<HTMLElement>(SIDEBAR_SELECTOR);
}

/** Where the folder section goes: just before Recents, below the pinned chats and Projects. */
export function findRecentsAnchor(sidebar: HTMLElement): HTMLElement | null {
  return sidebar.querySelector<HTMLElement>(RECENTS_SELECTOR);
}

/** The conversation a sidebar link opens, or `null` for any other link. */
export function readSidebarLink(link: Element): SidebarConversation | null {
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.target && link.target !== '_self') return null;
  const route = CLAUDE_IDENTITY.readPath(link.getAttribute('href'));
  return route ? { ...route, link } : null;
}

/** Every conversation row the sidebar renders right now, in sidebar order. */
export function listSidebarConversations(root: ParentNode): SidebarConversation[] {
  const rows: SidebarConversation[] = [];
  for (const link of root.querySelectorAll(ROW_LINK_SELECTOR)) {
    const row = readSidebarLink(link);
    if (row) rows.push(row);
  }
  return rows;
}

/** A row's title as Claude shows it; empty while it has none. */
export function readSidebarTitle(row: SidebarConversation): string {
  const label = row.link.querySelector('[data-row-label]') ?? row.link;
  return (label.textContent ?? '').trim();
}

/** The sidebar row a press landed on: a conversation link inside Claude's sidebar. */
export function sidebarConversationAt(
  target: EventTarget | null,
  doc: Document = document,
): SidebarConversation | null {
  const link = target instanceof Element ? target.closest(ROW_LINK_SELECTOR) : null;
  if (!link || !findClaudeSidebar(doc)?.contains(link)) return null;
  return readSidebarLink(link);
}

/** The sidebar link for conversation `id`, wherever it is listed. */
export function findSidebarLink(id: string, doc: Document = document): HTMLAnchorElement | null {
  const sidebar = findClaudeSidebar(doc);
  return sidebar
    ? (listSidebarConversations(sidebar).find((row) => row.id === id)?.link ?? null)
    : null;
}

/** `menu`'s own items, in order, leaving out those of a submenu inside it. */
export function menuItemsOf(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR)].filter(
    (item) => item.closest('[role="menu"]') === menu,
  );
}

/**
 * Every open row menu: the menu, its trigger, and the conversation whose row
 * holds that trigger. A Project's, a group's or the account menu is left out.
 */
export function openRowMenus(
  doc: Document = document,
): { menu: HTMLElement; trigger: HTMLElement; row: SidebarConversation }[] {
  const sidebar = findClaudeSidebar(doc);
  if (!sidebar) return [];
  const open = [];
  for (const menu of doc.querySelectorAll<HTMLElement>(
    '[role="menu"][data-open][aria-labelledby]',
  )) {
    const triggerId = menu.getAttribute('aria-labelledby');
    const trigger = triggerId ? doc.getElementById(triggerId) : null;
    const rowElement =
      trigger && sidebar.contains(trigger) ? trigger.closest(CLAUDE_ROW_SELECTOR) : null;
    const row = rowElement ? listSidebarConversations(rowElement)[0] : undefined;
    if (trigger && row) open.push({ menu, trigger, row });
  }
  return open;
}

/** Closes a menu with the Escape it listens for, which returns focus to its trigger. */
export function closeMenu(menu: HTMLElement): void {
  menu.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
  );
}
