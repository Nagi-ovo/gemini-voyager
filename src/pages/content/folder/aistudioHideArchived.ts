/**
 * AI Studio's "hide archived" setting: /library rows of prompts filed in a
 * folder are hidden while it is on, and a one-time nudge offers to turn it on.
 * Its keys are separate from Gemini's, so turning it on there does not hide
 * anything here. The switch reaches the folders plugin as its `hideFiledChats`
 * setting (a value binding on the same key); the nudge's own key is read here.
 */
import browser, { type Storage } from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { AISTUDIO_ROOT_BUCKET_ID } from '@/features/folder/constants';

import { applyHideArchivedRows } from './aistudioLibraryTable';
import {
  mountHideArchivedNudge,
  shouldShowHideArchivedNudge,
  unmountHideArchivedNudge,
} from './hideArchivedNudge';
import type { FolderData } from './types';

const ENABLED_KEY = StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO;
const NUDGE_SHOWN_KEY = StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO;
const NUDGE_I18N_KEYS = {
  title: 'aistudio_hide_archived_nudge_title',
  body: 'aistudio_hide_archived_nudge_body',
  enable: 'aistudio_hide_archived_nudge_enable',
  dismiss: 'aistudio_hide_archived_nudge_dismiss',
};

/** Whether any real folder (not Uncategorized) holds a prompt: the nudge needs something to hide. */
function hasArchivedPrompt(data: FolderData): boolean {
  return Object.entries(data.folderContents).some(
    ([folderId, conversations]) =>
      folderId !== AISTUDIO_ROOT_BUCKET_ID &&
      Array.isArray(conversations) &&
      conversations.length > 0,
  );
}

export class HideArchivedSetting {
  private nudgeShown = false;

  /** `enabled`: the plugin's `hideFiledChats` setting. */
  constructor(private enabled = false) {}

  async load(): Promise<void> {
    try {
      const result = await browser.storage.sync.get({ [NUDGE_SHOWN_KEY]: false });
      this.nudgeShown = result[NUDGE_SHOWN_KEY] === true;
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to load hide-archived settings:', error);
      this.nudgeShown = false;
    }
  }

  /** The plugin's setting changed; returns whether it changed here. */
  setEnabled(enabled: boolean): boolean {
    if (enabled === this.enabled) return false;
    this.enabled = enabled;
    return true;
  }

  /** Applies a synced nudge change; returns whether it changed here. */
  applyStorageChanges(changes: Record<string, Storage.StorageChange>): boolean {
    if (!changes[NUDGE_SHOWN_KEY]) return false;
    this.nudgeShown = changes[NUDGE_SHOWN_KEY].newValue === true;
    return true;
  }

  /** Hides the /library rows of filed prompts while on, and shows them while off. */
  applyToLibrary(data: FolderData): void {
    applyHideArchivedRows(data, this.enabled);
  }

  /** Shows the nudge in `container` while it can help, and removes it otherwise. */
  syncNudge(container: HTMLElement, data: FolderData): void {
    const eligible =
      shouldShowHideArchivedNudge({
        nudgeShown: this.nudgeShown,
        hideArchivedAlreadyOn: this.enabled,
      }) && hasArchivedPrompt(data);
    if (!eligible) {
      unmountHideArchivedNudge(container);
      return;
    }
    mountHideArchivedNudge({
      container,
      variantClass: 'gv-hide-archived-nudge--aistudio',
      i18nKeys: NUDGE_I18N_KEYS,
      onEnable: () => {
        void this.save(ENABLED_KEY, true).then(() => this.save(NUDGE_SHOWN_KEY, true));
      },
      onDismiss: () => {
        void this.save(NUDGE_SHOWN_KEY, true);
      },
    });
  }

  private async save(key: typeof ENABLED_KEY | typeof NUDGE_SHOWN_KEY, value: true): Promise<void> {
    if (key === ENABLED_KEY) this.enabled = value;
    else this.nudgeShown = value;
    try {
      await browser.storage.sync.set({ [key]: value });
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to save hide-archived setting:', error);
    }
  }
}
