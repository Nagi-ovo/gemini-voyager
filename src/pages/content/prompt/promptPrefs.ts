/**
 * Prompt Manager preferences.
 *
 * Panel lock and position, trigger position and the tag filter live in
 * `promptStorageService`: a missing key reads as the fallback, and a failed
 * write is logged. Choices that follow the user across devices (view mode,
 * panel view) live in sync storage with a local fallback. Neither kind ever
 * breaks the UI over a preference.
 */
import browser from 'webextension-polyfill';

import { logger } from '@/core/services/LoggerService';
import { promptStorageService } from '@/core/services/StorageService';
import type { StorageKey } from '@/core/types/common';

const pmLogger = logger.createChild('PromptManager');

export async function readPromptPref<T>(key: StorageKey, fallback: T): Promise<T> {
  const result = await promptStorageService.get<T>(key);
  if (result.success) {
    return result.data;
  }
  pmLogger.debug(`Key not found: ${key}, using fallback`);
  return fallback;
}

export async function writePromptPref<T>(key: StorageKey, value: T): Promise<void> {
  const result = await promptStorageService.set(key, value);
  if (!result.success) {
    pmLogger.error(`Failed to write key: ${key}`, {
      error: result.error?.message || 'Unknown error',
      errorDetails: result.error,
    });
  }
}

/**
 * Reads a choice kept in sync storage, falling back to local storage when sync
 * holds nothing valid. That mirrors `writeSyncedChoice`, which writes to local
 * when sync is unavailable (Safari, sync-disabled profiles); without the
 * fallback those environments lose the choice on every reload. Null when
 * neither store holds a valid value.
 */
export async function readSyncedChoice<T>(
  key: StorageKey,
  isValid: (value: unknown) => value is T,
): Promise<T | null> {
  let saved: unknown = null;
  try {
    const result = await browser.storage.sync.get(key);
    saved = result[key];
  } catch {
    // Fall through to local
  }
  if (!isValid(saved)) {
    try {
      const result = await browser.storage.local.get(key);
      saved = result[key];
    } catch {
      // Keep default on failure
    }
  }
  return isValid(saved) ? saved : null;
}

/** Writes a choice to sync storage, or to local storage when sync fails. Never rejects. */
export async function writeSyncedChoice(key: StorageKey, value: unknown): Promise<void> {
  try {
    await browser.storage.sync.set({ [key]: value });
  } catch {
    try {
      await browser.storage.local.set({ [key]: value });
    } catch {
      // Ignore persistence failures; the visible state still updates.
    }
  }
}
