import { StorageKeys } from '@/core/types/common';
import { compareVersions } from '@/core/utils/version';
import {
  WATERMARK_STORAGE_KEYS,
  hasSavedWatermarkPreference,
} from '@/core/utils/watermarkSettings';

/**
 * The last release whose unset watermark preference resolved to removal on.
 * Later releases resolve an unset preference to off.
 */
export const LAST_VERSION_WITH_WATERMARK_REMOVAL_ON_BY_DEFAULT = '1.9.0';

interface InstallDetails {
  reason: string;
  previousVersion?: string;
}

interface SyncStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

function updatedFromDefaultOnRelease(previousVersion: string | undefined): boolean {
  // An update without a readable previous version still comes from an existing
  // install. Keeping its old behavior is safer than silently turning it off.
  if (!previousVersion) return true;
  try {
    return compareVersions(previousVersion, LAST_VERSION_WITH_WATERMARK_REMOVAL_ON_BY_DEFAULT) <= 0;
  } catch {
    return true;
  }
}

/**
 * Keep watermark removal on for installs that relied on the old default.
 *
 * Runs on updates from a release whose unset preference meant "on". When no
 * watermark key is saved, both split keys become explicit `true`, so the
 * resolved value no longer depends on the default. The write is the marker:
 * later runs, fresh installs and any saved choice leave storage untouched.
 */
export async function keepWatermarkRemovalForUpdatedInstall(
  details: InstallDetails,
  storage: SyncStorage = chrome.storage.sync,
): Promise<boolean> {
  if (details.reason !== 'update' || !updatedFromDefaultOnRelease(details.previousVersion)) {
    return false;
  }
  try {
    const stored = await storage.get([...WATERMARK_STORAGE_KEYS]);
    if (hasSavedWatermarkPreference(stored)) return false;
    await storage.set({
      [StorageKeys.WATERMARK_DOWNLOAD_ENABLED]: true,
      [StorageKeys.WATERMARK_PREVIEW_ENABLED]: true,
    });
    return true;
  } catch (error) {
    console.warn('[Background] Failed to keep watermark removal for an updated install:', error);
    return false;
  }
}

export function registerWatermarkDefaultMigrationOnInstall(): void {
  chrome.runtime?.onInstalled?.addListener?.((details) => {
    void keepWatermarkRemovalForUpdatedInstall(details);
  });
}
