/**
 * Reads DeepSeek's own sidebar. Its classes are build hashes, so only the
 * conversation links (`/a/chat/s/<id>`) and its design system's `ds-*` names
 * are used. Observed live (2026-10-19):
 *
 *   <sidebar>
 *     .ds-scroll-area > .ds-scroll-area     the history's scroll area
 *       <list>                              one child per date group
 *         <group>  <heading>  a[href="/a/chat/s/<id>"] …
 *                              (the link is the whole row: title, then its
 *                               "…" button, a `role="button"` with no label)
 *
 * The row menu is a `.ds-dropdown-menu` with no link to its row, so DeepSeek
 * gets no "Move to folder" entry; a row is filed by dragging it onto a folder.
 */
import type { SidebarConversation } from '../siteFolders/types';
import { DEEPSEEK_IDENTITY } from './deepseekIdentity';

export const DEEPSEEK_ROW_SELECTOR = 'a[href^="/a/chat/s/"]';
const SCROLL_AREA = '.ds-scroll-area';
/** The conversation's own message list is a scroll area too. */
const MESSAGE_LIST = '.ds-virtual-list';

function historyLink(root: ParentNode): HTMLAnchorElement | null {
  for (const link of root.querySelectorAll<HTMLAnchorElement>(
    `${SCROLL_AREA} ${DEEPSEEK_ROW_SELECTOR}`,
  )) {
    if (!link.closest(MESSAGE_LIST)) return link;
  }
  return null;
}

/**
 * DeepSeek's sidebar: the element around the history's outermost scroll area,
 * or `null` while no conversation is listed (DeepSeek shows no history then).
 */
export function findDeepSeekSidebar(doc: Document = document): HTMLElement | null {
  let area = historyLink(doc)?.closest<HTMLElement>(SCROLL_AREA) ?? null;
  let outer = area?.parentElement?.closest<HTMLElement>(SCROLL_AREA) ?? null;
  while (outer) {
    area = outer;
    outer = outer.parentElement?.closest<HTMLElement>(SCROLL_AREA) ?? null;
  }
  return area?.parentElement ?? null;
}

/**
 * Where the folder section goes: inside the history's scroll area, just before
 * the list of date groups, so it scrolls with the history.
 */
export function findHistoryAnchor(sidebar: HTMLElement): HTMLElement | null {
  const group = historyLink(sidebar)?.parentElement ?? null;
  const list = group?.parentElement ?? null;
  return list?.parentElement?.matches(SCROLL_AREA) ? list : group;
}

/** The conversation a sidebar link opens, or `null` for any other link. */
export function readSidebarLink(link: Element): SidebarConversation | null {
  if (!(link instanceof HTMLAnchorElement)) return null;
  if (link.target && link.target !== '_self') return null;
  const route = DEEPSEEK_IDENTITY.readPath(link.getAttribute('href'));
  return route ? { ...route, link } : null;
}

/** Every conversation row under `root`, which may itself be a row, in sidebar order. */
export function listSidebarConversations(root: ParentNode): SidebarConversation[] {
  const links =
    root instanceof Element && root.matches(DEEPSEEK_ROW_SELECTOR)
      ? [root]
      : [...root.querySelectorAll(DEEPSEEK_ROW_SELECTOR)];
  return links.flatMap((link) => readSidebarLink(link) ?? []);
}

/** A row's title as DeepSeek shows it (its "…" button has no text); empty while it has none. */
export function readSidebarTitle(row: SidebarConversation): string {
  return (row.link.textContent ?? '').trim();
}

/** The sidebar row a press landed on, which a drag onto a folder files. */
export function sidebarConversationAt(
  target: EventTarget | null,
  doc: Document = document,
): SidebarConversation | null {
  const link = target instanceof Element ? target.closest(DEEPSEEK_ROW_SELECTOR) : null;
  if (!link || !findDeepSeekSidebar(doc)?.contains(link)) return null;
  return readSidebarLink(link);
}

/** The sidebar link for conversation `id`, or `null` while it is not listed. */
export function findSidebarLink(id: string, doc: Document = document): HTMLAnchorElement | null {
  const sidebar = findDeepSeekSidebar(doc);
  return sidebar
    ? (listSidebarConversations(sidebar).find((row) => row.id === id)?.link ?? null)
    : null;
}
