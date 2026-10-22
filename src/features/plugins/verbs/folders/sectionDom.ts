/**
 * A site's sidebar, read from the `folders` section of its `site.json`
 * (`sites/sections/foldersData.ts`): the sidebar root, its conversation rows,
 * each row's link and title, and the anchor the folder section goes before.
 * Only the route identity names a row's conversation; the section says where
 * things are, never how they are stored.
 *
 * Read here, in `siteData.ts` and in `rowMenu.ts`: `sidebar`, `rows.row` /
 * `link` / `title` / `observe`, `mount.anchors` / `default` / `open`,
 * `hideFiled`, `rowMenu` with `open: "press"` (Claude), and
 * `page.placeholderTitles.any` and `page.titleSuffix`. Not read yet:
 * `rows.idSources` and `rows.portaled` (Gemini and AI Studio rows), `rows.drag`
 * (every row is found from the press, `native.rowAt`), `rowMenu` with
 * `open: "expanded"` and `rename` (ChatGPT), `page.placeholderTitles.byLanguage`
 * / `fallbackLanguage` and `page.newChat`.
 */
import type { SiteIdentity } from '@/features/folder/sites/siteIdentity';
import type { FoldersAnchor, FoldersSection } from '@/features/plugins/sites/sections/foldersData';

import type { SidebarConversation } from './types';

export interface SectionDom {
  /** The sidebar, or `null` while it is not rendered (or `mount.open` says it is closed). */
  find(doc?: Document): HTMLElement | null;
  /** Every conversation row under `root`, which may itself be a row, in sidebar order. */
  list(root: ParentNode): SidebarConversation[];
  /** A row's title as the site shows it; empty while it has none. */
  title(row: SidebarConversation): string;
  /** The sidebar row a press landed on: on its link, where the row has one apart from itself. */
  rowAt(target: EventTarget | null, doc?: Document): SidebarConversation | null;
  /** The sidebar row holding `element` anywhere inside it (its menu button, say). */
  rowOf(element: Element, doc?: Document): SidebarConversation | null;
  /** The sidebar link of conversation `id`, or `null` while it is not listed. */
  link(id: string, doc?: Document): HTMLAnchorElement | null;
  /** The element the folder section is inserted before, inside `sidebar`. */
  anchor(sidebar: HTMLElement): HTMLElement | null;
}

/** The first step of `anchor` that finds an element in `sidebar`, lifted to its `closest`. */
function resolveAnchor(sidebar: HTMLElement, anchor: FoldersAnchor): HTMLElement | null {
  for (const step of anchor.steps) {
    const found = sidebar.querySelector<HTMLElement>(step.find);
    if (!found) continue;
    const lifted = step.closest ? found.closest<HTMLElement>(step.closest) : null;
    return lifted && sidebar.contains(lifted) && lifted !== sidebar ? lifted : found;
  }
  return null;
}

export function createSectionDom(section: FoldersSection, identity: SiteIdentity): SectionDom {
  const { rows, mount } = section;

  const find = (doc: Document = document): HTMLElement | null => {
    if (mount?.open && !doc.querySelector(mount.open)) return null;
    return doc.querySelector<HTMLElement>(section.sidebar);
  };

  const conversationOf = (row: Element): SidebarConversation | null => {
    const link = rows.link && !row.matches(rows.link) ? row.querySelector(rows.link) : row;
    if (!(link instanceof HTMLAnchorElement)) return null;
    if (link.target && link.target !== '_self') return null;
    const route = identity.readPath(link.getAttribute('href'));
    return route ? { ...route, link } : null;
  };

  const list = (root: ParentNode): SidebarConversation[] => {
    const found =
      root instanceof Element && root.matches(rows.row) ? [root] : root.querySelectorAll(rows.row);
    return [...found].flatMap((row) => conversationOf(row) ?? []);
  };

  const rowOf = (element: Element, doc: Document = document): SidebarConversation | null => {
    const row = element.closest(rows.row);
    return row && find(doc)?.contains(row) ? conversationOf(row) : null;
  };

  const anchors = mount?.anchors ?? [];
  const preferred = anchors.find((anchor) => anchor.id === mount?.default) ?? anchors[0];

  return {
    find,
    list,
    title: (row) => {
      const holder = row.link.closest(rows.row) ?? row.link;
      for (const selector of rows.title ?? []) {
        const label = holder.matches(selector) ? holder : holder.querySelector(selector);
        const text = label?.textContent?.trim();
        if (text) return text;
      }
      return (row.link.textContent ?? '').trim();
    },
    rowAt: (target, doc = document) => {
      if (!(target instanceof Element)) return null;
      const found = rowOf(target, doc);
      // A press on the row's other controls (its menu button) is no drag of the row.
      return found?.link.contains(target) ? found : null;
    },
    rowOf,
    link: (id, doc = document) => {
      const sidebar = find(doc);
      return sidebar ? (list(sidebar).find((row) => row.id === id)?.link ?? null) : null;
    },
    anchor: (sidebar) => (preferred ? resolveAnchor(sidebar, preferred) : null),
  };
}
