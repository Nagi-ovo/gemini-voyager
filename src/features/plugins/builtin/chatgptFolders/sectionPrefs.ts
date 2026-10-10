import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import type { ConversationSortMode } from '@/features/folder/model/folderData';
import type { FolderViewMode } from '@/pages/content/folder/activityView';
import { toSortMode } from '@/pages/content/folder/sidebarPrefs';

/**
 * The sidebar section's own view state on this device; Gemini's keys stay
 * Gemini's. Older builds drop `viewMode` on their next save and show folders.
 * `sortMode` is chosen in the folder settings popover.
 */
export type ChatGptFolderSectionPrefs = {
  collapsed: boolean;
  sortMode: ConversationSortMode;
  viewMode: FolderViewMode;
};

function parseSectionPrefs(value: unknown): ChatGptFolderSectionPrefs {
  const raw = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  return {
    collapsed: raw.collapsed === true,
    sortMode: toSortMode(raw.sortMode),
    viewMode: raw.viewMode === 'activity' ? 'activity' : 'folders',
  };
}

/** Before the user changes anything; the parser's own fallbacks. */
export const DEFAULT_SECTION_PREFS: Readonly<ChatGptFolderSectionPrefs> =
  parseSectionPrefs(undefined);

export async function loadSectionPrefs(): Promise<ChatGptFolderSectionPrefs> {
  try {
    const stored = await browser.storage.local.get(StorageKeys.CHATGPT_FOLDER_SECTION);
    return parseSectionPrefs(stored[StorageKeys.CHATGPT_FOLDER_SECTION]);
  } catch {
    return parseSectionPrefs(undefined);
  }
}

export async function saveSectionPrefs(prefs: ChatGptFolderSectionPrefs): Promise<void> {
  try {
    await browser.storage.local.set({ [StorageKeys.CHATGPT_FOLDER_SECTION]: prefs });
  } catch {
    // A view preference; an invalidated context or full quota loses only that.
  }
}
