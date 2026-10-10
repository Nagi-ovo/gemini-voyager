import { highlightAnnotationService } from '@/core/services/HighlightAnnotationService';
import { StorageKeys } from '@/core/types/common';

import { resolveOptionalHighlightSetting } from './highlightOptionalSetting';

const RETIRED_TAB_TITLE_UPDATE_SETTING = { [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: false };

export async function disableRetiredTabTitleUpdateSetting(): Promise<void> {
  try {
    const stored = await chrome.storage.sync.get(RETIRED_TAB_TITLE_UPDATE_SETTING);
    if (stored[StorageKeys.TAB_TITLE_UPDATE_ENABLED] !== false) {
      await chrome.storage.sync.set(RETIRED_TAB_TITLE_UPDATE_SETTING);
    }
  } catch (error) {
    console.warn('[Background] Failed to disable retired tab-title sync setting:', error);
  }
}

/**
 * Resolve the new optional Highlight default exactly once.
 *
 * Existing explicit choices always win. Users with live saved highlights keep
 * the feature enabled; users who never used it start with the feature disabled.
 */
export async function migrateOptionalHighlightSetting(): Promise<void> {
  try {
    const stored = await chrome.storage.sync.get(StorageKeys.HIGHLIGHT_ENABLED);
    const storedValue = stored[StorageKeys.HIGHLIGHT_ENABLED];
    if (typeof storedValue === 'boolean') return;

    const hasExistingHighlights = (await highlightAnnotationService.getAllAccounts()).length > 0;
    const resolution = resolveOptionalHighlightSetting(storedValue, hasExistingHighlights);
    if (!resolution.shouldPersist) return;
    await chrome.storage.sync.set({
      [StorageKeys.HIGHLIGHT_ENABLED]: resolution.enabled,
    });
  } catch (error) {
    console.warn('[Background] Failed to migrate optional Highlight setting:', error);
  }
}
