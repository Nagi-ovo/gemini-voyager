import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { folderDebug } from './folderManagerDebug';

type StorageChanges = Record<string, browser.Storage.StorageChange>;

export type FloatingModeSetting = { enabled: boolean; openOnStart: boolean };

export type FolderSettingHandlers = {
  isDestroyed(): boolean;
  /** Every change, before the specific handlers below (sidebar view prefs). */
  onAnyChange(changes: StorageChanges, areaName: string): void;
  onFolderEnabled(enabled: boolean): void;
  onFloatingOpenOnStart(openOnStart: boolean): void;
  onFloatingMode(enabled: boolean): void;
  onHideArchived(hide: boolean): void;
  onHideArchivedNudgeShown(shown: boolean): void;
  /** Folder anchor preference (local-only): which native section to sit above. */
  onAnchor(value: unknown): void;
};

export async function readFolderEnabled(): Promise<boolean> {
  try {
    const result = await browser.storage.sync.get({ [StorageKeys.FOLDER_ENABLED]: true });
    const enabled = result[StorageKeys.FOLDER_ENABLED] !== false;
    folderDebug('Loaded folder enabled setting:', enabled);
    return enabled;
  } catch (error) {
    console.error('[FolderManager] Failed to load folder enabled setting:', error);
    return true;
  }
}

/**
 * Opt-in toggle that puts the folder feature into "floating window" mode.
 * When on, the sidebar-injection path is skipped entirely and folders live
 * in a body-level floating panel/FAB instead. Off by default — users opt in
 * from the popup's Folder options. Null when the extension context is gone.
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

export async function readHideArchived(): Promise<boolean> {
  try {
    const result = await browser.storage.sync.get({
      [StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS]: false,
    });
    const hide = !!result[StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS];
    folderDebug('Loaded hide archived setting:', hide);
    return hide;
  } catch (error) {
    console.error('[FolderManager] Failed to load hide archived setting:', error);
    return false;
  }
}

/** Auto sync is deprecated: switch a legacy "auto" sync mode to "manual". */
export async function migrateLegacySyncMode(): Promise<void> {
  try {
    const result = await chrome.storage.local.get('gvSyncMode');
    if (result.gvSyncMode === 'auto') {
      console.log('[FolderManager] Migrating legacy "auto" sync mode to "manual"');
      await chrome.storage.local.set({ gvSyncMode: 'manual' });
    }
  } catch (error) {
    console.error('[FolderManager] Migration failed:', error);
  }
}

function dispatchSyncChanges(changes: StorageChanges, handlers: FolderSettingHandlers): void {
  const enabled = changes[StorageKeys.FOLDER_ENABLED];
  if (enabled) handlers.onFolderEnabled(enabled.newValue !== false);
  const openOnStart = changes[StorageKeys.FOLDER_FLOATING_OPEN_ON_START];
  if (openOnStart) handlers.onFloatingOpenOnStart(openOnStart.newValue !== false);
  const floatingMode = changes[StorageKeys.FOLDER_FLOATING_MODE_ENABLED];
  if (floatingMode) handlers.onFloatingMode(floatingMode.newValue === true);
  const hideArchived = changes[StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS];
  if (hideArchived) handlers.onHideArchived(!!hideArchived.newValue);
  const nudgeShown = changes[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN];
  if (nudgeShown) handlers.onHideArchivedNudgeShown(!!nudgeShown.newValue);
}

/** Routes folder setting changes to `handlers`; returns the listener's removal. */
export function listenForFolderSettingChanges(handlers: FolderSettingHandlers): () => void {
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
