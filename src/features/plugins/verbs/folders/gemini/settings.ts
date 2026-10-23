/**
 * The Gemini folder view's own settings: floating mode and its open-on-start
 * choice, the hide-archived nudge flag, the anchor preference, and the section
 * preferences the sidebar view applies. The folders switch and hide-archived
 * reach the view through the plugin instead (enable and value bindings).
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { folderDebug } from '@/pages/content/folder/folderManagerDebug';

type StorageChanges = Record<string, browser.Storage.StorageChange>;

export type FloatingModeSetting = { enabled: boolean; openOnStart: boolean };

export type GeminiFolderSettingHandlers = {
  isDestroyed(): boolean;
  /** Every change, before the specific handlers below (sidebar view prefs). */
  onAnyChange(changes: StorageChanges, areaName: string): void;
  onFloatingOpenOnStart(openOnStart: boolean): void;
  onFloatingMode(enabled: boolean): void;
  onHideArchivedNudgeShown(shown: boolean): void;
  /** Folder anchor preference (local-only): which native section to sit above. */
  onAnchor(value: unknown): void;
};

/**
 * Opt-in toggle that puts the folders into "floating window" mode: no sidebar
 * injection, a body-level floating panel or its button instead. Off by
 * default. Null when the extension context is gone.
 */
export async function readFloatingModeSetting(): Promise<FloatingModeSetting | null> {
  try {
    const result = await browser.storage.sync.get({
      [StorageKeys.FOLDER_FLOATING_MODE_ENABLED]: false,
      [StorageKeys.FOLDER_FLOATING_OPEN_ON_START]: true,
    });
    const setting = {
      enabled: result[StorageKeys.FOLDER_FLOATING_MODE_ENABLED] === true,
      openOnStart: result[StorageKeys.FOLDER_FLOATING_OPEN_ON_START] !== false,
    };
    folderDebug('Loaded floating-mode setting:', setting);
    return setting;
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return null;
    console.error('[FolderManager] Failed to load floating-mode setting:', error);
    return { enabled: false, openOnStart: true };
  }
}

function dispatchSyncChanges(changes: StorageChanges, handlers: GeminiFolderSettingHandlers): void {
  const openOnStart = changes[StorageKeys.FOLDER_FLOATING_OPEN_ON_START];
  if (openOnStart) handlers.onFloatingOpenOnStart(openOnStart.newValue !== false);
  const floatingMode = changes[StorageKeys.FOLDER_FLOATING_MODE_ENABLED];
  if (floatingMode) handlers.onFloatingMode(floatingMode.newValue === true);
  const nudgeShown = changes[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN];
  if (nudgeShown) handlers.onHideArchivedNudgeShown(!!nudgeShown.newValue);
}

/** Routes the view's setting changes to `handlers`; returns the listener's removal. */
export function listenForGeminiFolderSettings(handlers: GeminiFolderSettingHandlers): () => void {
  const listener = (changes: StorageChanges, areaName: string): void => {
    if (handlers.isDestroyed()) return;
    handlers.onAnyChange(changes, areaName);
    if (areaName === 'sync') dispatchSyncChanges(changes, handlers);
    if (areaName === 'local' && changes[StorageKeys.FOLDERS_ANCHOR]) {
      handlers.onAnchor(changes[StorageKeys.FOLDERS_ANCHOR].newValue);
    }
  };
  browser.storage.onChanged.addListener(listener);
  return () => browser.storage.onChanged.removeListener(listener);
}
