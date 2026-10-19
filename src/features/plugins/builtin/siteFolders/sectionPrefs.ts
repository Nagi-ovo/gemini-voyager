import browser from 'webextension-polyfill';

import type { StorageKey } from '@/core/types/common';
import type { ConversationSortMode } from '@/features/folder/model/folderData';
import type { FolderViewMode } from '@/pages/content/folder/activityView';
import { toSortMode } from '@/pages/content/folder/sidebarPrefs';

/**
 * The sidebar section's own view state on this device; Gemini's keys stay
 * Gemini's. Older builds drop `viewMode` on their next save and show folders.
 * `sortMode` is chosen in the folder settings popover.
 */
export type SiteFolderSectionPrefs = {
  collapsed: boolean;
  sortMode: ConversationSortMode;
  viewMode: FolderViewMode;
};

function parseSectionPrefs(value: unknown): SiteFolderSectionPrefs {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    collapsed: raw.collapsed === true,
    sortMode: toSortMode(raw.sortMode),
    viewMode: raw.viewMode === 'activity' ? 'activity' : 'folders',
  };
}

/** Before the user changes anything; the parser's own fallbacks. */
export const DEFAULT_SECTION_PREFS: Readonly<SiteFolderSectionPrefs> = parseSectionPrefs(undefined);

export async function loadSectionPrefs(key: StorageKey): Promise<SiteFolderSectionPrefs> {
  try {
    const stored = await browser.storage.local.get(key);
    return parseSectionPrefs(stored[key]);
  } catch {
    return parseSectionPrefs(undefined);
  }
}

export async function saveSectionPrefs(
  key: StorageKey,
  prefs: SiteFolderSectionPrefs,
): Promise<void> {
  try {
    await browser.storage.local.set({ [key]: prefs });
  } catch {
    // A view preference; an invalidated context or full quota loses only that.
  }
}
