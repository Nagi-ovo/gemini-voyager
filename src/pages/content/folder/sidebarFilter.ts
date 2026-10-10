import { type ConversationSortMode, ownBucket } from '@/features/folder/model/folderData';
import type { FolderLayout } from '@/features/folder/model/folderIndex';

import type { TreeFilter, TreeSiteOptions } from './floatingTree/shared';
import type { ConversationReference, Folder, FolderData } from './types';

export type FolderSearchMode = 'all' | 'folder';

export interface FolderSearchCriteria {
  mode: FolderSearchMode;
  query: string;
}

export function normalizeFolderSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

/** `f:` or `folder:` searches folder names only; anything else searches names and titles. */
export function parseFolderSearchCriteria(value: string): FolderSearchCriteria {
  const normalized = normalizeFolderSearchText(value);
  const folderOnlyMatch = normalized.match(/^(?:f|folder)\s*:\s*(.*)$/);

  return folderOnlyMatch
    ? { mode: 'folder', query: folderOnlyMatch[1] ?? '' }
    : { mode: 'all', query: normalized };
}

/** The search a box's text asks for, or `null` when it is blank. */
export function searchCriteriaOf(query: string): FolderSearchCriteria | null {
  if (normalizeFolderSearchText(query).length === 0) return null;
  return parseFolderSearchCriteria(query);
}

/**
 * What a sidebar tree allows while searched or sorted: positions mean nothing
 * in a filtered list or in recent order, and a search opens every folder.
 */
export function searchAndSortOptions(
  searching: boolean,
  sortMode: ConversationSortMode,
): Pick<TreeSiteOptions, 'reorder' | 'expandAll' | 'emptyLabelKey'> {
  return {
    reorder: searching ? undefined : { folders: true, conversations: sortMode === 'manual' },
    expandAll: searching,
    emptyLabelKey: searching ? 'folder_search_empty' : 'folder_empty',
  };
}

function routeUserId(pathname: string): string | null {
  return pathname.match(/^\/u\/(\d+)\//)?.[1] ?? null;
}

/** The `/u/<n>/` account of the page; the default account is `0`. */
export function getCurrentUserId(): string {
  try {
    return routeUserId(window.location.pathname) ?? '0';
  } catch {
    return '0';
  }
}

/**
 * Whether a chat belongs to the current account. A URL without `/u/<n>/` may
 * open in any account, so it always does.
 */
export function isCurrentUserConversation(
  conversation: ConversationReference,
  currentUserId: string,
): boolean {
  let userId: string | null = null;
  try {
    userId = routeUserId(new URL(conversation.url).pathname);
  } catch {
    userId = null;
  }
  return userId === null || userId === currentUserId;
}

export type SidebarFilterState = {
  /** The search box text; empty or disabled search shows everything. */
  search: FolderSearchCriteria | null;
  currentUserOnly: boolean;
};

/**
 * The sidebar's search and current-account filter over the projection's
 * layout. The layout has cut every parent cycle, so walking its children
 * always ends and keeps a cycle's folders.
 *
 * - The account filter hides other accounts' chats, and folders holding only
 *   those. Empty folders stay.
 * - A search shows chats whose title matches, and folders on the way to a
 *   match or whose name matches, with their visible chats.
 * - A folder-only search (`f:`) shows folders whose name matches with
 *   everything under them, and the folders above them; no other chats.
 */
export function createSidebarFilter(
  state: SidebarFilterState,
  data: () => FolderData,
): ((layout: FolderLayout) => TreeFilter) | undefined {
  const { search, currentUserOnly } = state;
  if (!search && !currentUserOnly) return undefined;
  return (layout) => {
    const currentData = data();
    const currentUserId = getCurrentUserId();
    const childrenOf = (folder: Folder): readonly Folder[] => layout.children.get(folder.id) ?? [];
    const bucketOf = (id: string): readonly ConversationReference[] =>
      ownBucket(currentData.folderContents, id) ?? [];
    const userOk = (conversation: ConversationReference) =>
      !currentUserOnly || isCurrentUserConversation(conversation, currentUserId);
    const textMatches = (value: string) =>
      !search ||
      search.query.length === 0 ||
      normalizeFolderSearchText(value).includes(search.query);
    // A chat shown for its own title, outside a folder-only search's subtree.
    const matchesOwn = (conversation: ConversationReference) =>
      userOk(conversation) && search?.mode !== 'folder' && textMatches(conversation.title);

    const visibleContent = new Map<string, boolean>();
    const hasVisibleContent = (folder: Folder): boolean => {
      if (!currentUserOnly) return true;
      const known = visibleContent.get(folder.id);
      if (known !== undefined) return known;
      const bucket = bucketOf(folder.id);
      const children = childrenOf(folder);
      const result =
        bucket.some(userOk) ||
        children.some(hasVisibleContent) ||
        (bucket.length === 0 && children.length === 0);
      visibleContent.set(folder.id, result);
      return result;
    };

    const treeMatches = new Map<string, boolean>();
    const matchesTree = (folder: Folder): boolean => {
      const known = treeMatches.get(folder.id);
      if (known !== undefined) return known;
      const result =
        (textMatches(folder.name) && hasVisibleContent(folder)) ||
        bucketOf(folder.id).some(matchesOwn) ||
        childrenOf(folder).some(matchesTree);
      treeMatches.set(folder.id, result);
      return result;
    };

    const shown = new Set<string>();
    const whole = new Set<string>();
    const walk = (folder: Folder, inWholeSubtree: boolean): void => {
      const visible = search && !inWholeSubtree ? matchesTree(folder) : hasVisibleContent(folder);
      if (!visible) return;
      shown.add(folder.id);
      const includesSubtree =
        inWholeSubtree || (search?.mode === 'folder' && textMatches(folder.name));
      if (includesSubtree) whole.add(folder.id);
      for (const child of childrenOf(folder)) walk(child, includesSubtree);
    };
    for (const root of layout.roots) walk(root, false);

    return {
      folder: (folder) => shown.has(folder.id),
      conversation: (conversation, bucketId) => {
        if (!userOk(conversation)) return false;
        if (!search) return true;
        if (search.mode === 'folder') return whole.has(bucketId);
        return textMatches(conversation.title);
      },
    };
  };
}
