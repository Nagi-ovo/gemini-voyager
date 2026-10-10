import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import type { ConversationSortMode } from '@/features/folder/model/folderData';

import { hasSeenCoachmark } from '../coachmark';
import type { FolderViewMode } from './activityView';
import { FOLDER_TREE_INDENT, clampFolderDisplay } from './folderDisplay';

export const FOLDER_ONLY_SEARCH_HINT_ID = 'folder-only-search-prefix-hint';

export const FOLDER_TREE_INDENT_DEFAULT = FOLDER_TREE_INDENT.defaultValue;

export function clampFolderTreeIndent(value: unknown): number {
  return clampFolderDisplay(FOLDER_TREE_INDENT, value);
}

export function toSortMode(value: unknown): ConversationSortMode {
  return value === 'recent' ? 'recent' : 'manual';
}

export function toViewMode(value: unknown): FolderViewMode {
  return value === 'activity' ? 'activity' : 'folders';
}

/** The Gemini folder section's own preferences, as stored. */
export type SidebarPrefs = {
  foldersCollapsed: boolean;
  folderViewMode: FolderViewMode;
  filterCurrentUserOnly: boolean;
  folderSearchEnabled: boolean;
  folderOnlySearchHintSeen: boolean;
  folderTreeIndent: number;
  folderProjectEnabled: boolean;
  conversationSortMode: ConversationSortMode;
};

export function defaultSidebarPrefs(): SidebarPrefs {
  return {
    foldersCollapsed: false,
    folderViewMode: 'folders',
    filterCurrentUserOnly: false,
    folderSearchEnabled: true,
    folderOnlySearchHintSeen: false,
    folderTreeIndent: FOLDER_TREE_INDENT_DEFAULT,
    folderProjectEnabled: false,
    conversationSortMode: 'manual',
  };
}

/**
 * Collapsed state and view mode, migrating the legacy "hidden" flag (in
 * extension storage or page localStorage) to collapsed.
 */
async function loadCollapsedAndViewMode(prefs: SidebarPrefs): Promise<void> {
  try {
    const result = await browser.storage.local.get({
      [StorageKeys.FOLDERS_COLLAPSED]: false,
      [StorageKeys.FOLDERS_HIDDEN]: false,
      [StorageKeys.FOLDERS_VIEW_MODE]: 'folders',
    });
    let legacyHidden = result[StorageKeys.FOLDERS_HIDDEN] === true;
    try {
      legacyHidden ||= localStorage.getItem(StorageKeys.FOLDERS_HIDDEN) === 'true';
    } catch {
      // Local storage is only a legacy fallback and may be unavailable.
    }

    prefs.foldersCollapsed = legacyHidden || result[StorageKeys.FOLDERS_COLLAPSED] === true;
    prefs.folderViewMode = toViewMode(result[StorageKeys.FOLDERS_VIEW_MODE]);

    if (legacyHidden) {
      await browser.storage.local.set({
        [StorageKeys.FOLDERS_HIDDEN]: false,
        [StorageKeys.FOLDERS_COLLAPSED]: true,
      });
      try {
        localStorage.removeItem(StorageKeys.FOLDERS_HIDDEN);
      } catch {
        // Ignore legacy fallback cleanup failures.
      }
    }
  } catch (error) {
    console.error('[FolderManager] Failed to load folder collapsed preference:', error);
    prefs.foldersCollapsed = false;
    prefs.folderViewMode = 'folders';
  }
}

/** One sync setting, or `fallback` when it cannot be read. */
async function readSync<T>(key: string, fallback: T, read: (value: unknown) => T): Promise<T> {
  try {
    const result = await browser.storage.sync.get({ [key]: fallback });
    return read(result[key]);
  } catch (error) {
    console.error(`[FolderManager] Failed to load ${key}:`, error);
    return fallback;
  }
}

export async function loadSidebarPrefs(): Promise<SidebarPrefs> {
  const prefs = defaultSidebarPrefs();
  await loadCollapsedAndViewMode(prefs);
  prefs.filterCurrentUserOnly = await readSync(
    StorageKeys.GV_FOLDER_FILTER_USER_ONLY,
    false,
    (value) => !!value,
  );
  prefs.folderSearchEnabled = await readSync(
    StorageKeys.FOLDER_SEARCH_ENABLED,
    true,
    (value) => value !== false,
  );
  prefs.folderOnlySearchHintSeen = await hasSeenCoachmark(FOLDER_ONLY_SEARCH_HINT_ID);
  prefs.folderTreeIndent = await readSync(
    StorageKeys.GV_FOLDER_TREE_INDENT,
    FOLDER_TREE_INDENT_DEFAULT,
    clampFolderTreeIndent,
  );
  prefs.folderProjectEnabled = await readSync(
    StorageKeys.FOLDER_PROJECT_ENABLED,
    false,
    (value) => value === true,
  );
  prefs.conversationSortMode = await readSync(
    StorageKeys.FOLDER_CONVERSATION_SORT_MODE,
    'manual' as ConversationSortMode,
    toSortMode,
  );
  return prefs;
}

/** Writes a preference; a failed write keeps the in-page value and is only logged. */
export function persistPref(area: 'local' | 'sync', values: Record<string, unknown>): void {
  void browser.storage[area].set(values).catch((error: unknown) => {
    console.error('[FolderManager] Failed to persist folder preference:', error);
  });
}
