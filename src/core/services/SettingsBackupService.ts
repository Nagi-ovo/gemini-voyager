import { StorageKeys } from '@/core/types/common';
import type { SettingsExportPayload } from '@/core/types/sync';
import { EXTENSION_VERSION } from '@/core/utils/version';
import { WATERMARK_STORAGE_KEYS } from '@/core/utils/watermarkSettings';
import { LEGACY_ENABLE_BINDINGS } from '@/features/plugins/storage/legacySettingBindings';

import { BACKUPABLE_SYNC_SETTINGS_DEFAULTS } from './settingsBackupDefaults';

export { BACKUPABLE_SYNC_SETTINGS_DEFAULTS } from './settingsBackupDefaults';
export {
  NON_SETTINGS_BACKUP_POLICIES,
  type NonSettingsBackupDisposition,
  type NonSettingsBackupPolicy,
} from './settingsBackupPolicies';

export type BackupableSyncSettings = Record<string, unknown>;
export type SettingsRestoreMode = 'merge' | 'overwrite';

type StorageAreaLike = Pick<chrome.storage.StorageArea, 'get' | 'set'>;

export const BACKUPABLE_SYNC_SETTINGS_KEYS = Object.keys(BACKUPABLE_SYNC_SETTINGS_DEFAULTS);

function getStorageArea(storageArea?: StorageAreaLike): StorageAreaLike {
  if (storageArea) {
    return storageArea;
  }

  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    return chrome.storage.sync;
  }

  return {
    get: async (keys?: unknown) =>
      typeof keys === 'object' && keys !== null && !Array.isArray(keys)
        ? (keys as Record<string, unknown>)
        : {},
    set: async () => undefined,
  } as StorageAreaLike;
}

export function filterBackupableSyncSettings(value: unknown): BackupableSyncSettings {
  if (typeof value !== 'object' || value === null) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const settings = BACKUPABLE_SYNC_SETTINGS_KEYS.reduce<BackupableSyncSettings>((acc, key) => {
    if (Object.prototype.hasOwnProperty.call(record, key)) {
      acc[key] = record[key];
    }
    return acc;
  }, {});

  if (Object.prototype.hasOwnProperty.call(settings, StorageKeys.TAB_TITLE_UPDATE_ENABLED)) {
    settings[StorageKeys.TAB_TITLE_UPDATE_ENABLED] = false;
  }

  return settings;
}

export async function loadBackupableSyncSettings(
  storageArea?: StorageAreaLike,
): Promise<BackupableSyncSettings> {
  const area = getStorageArea(storageArea);
  const snapshot = await area.get<Record<string, unknown>>(BACKUPABLE_SYNC_SETTINGS_KEYS);
  const settings: BackupableSyncSettings = { ...BACKUPABLE_SYNC_SETTINGS_DEFAULTS, ...snapshot };
  for (const bound of Object.values(LEGACY_ENABLE_BINDINGS)) {
    if (
      !bound.derive ||
      !Object.prototype.hasOwnProperty.call(BACKUPABLE_SYNC_SETTINGS_DEFAULTS, bound.key) ||
      Object.prototype.hasOwnProperty.call(snapshot, bound.key)
    )
      continue;
    // Watermark nulls already preserve the resolver's state and mean "no saved choice" on restore.
    if (WATERMARK_STORAGE_KEYS.some((key) => key === bound.key)) continue;
    const effective = bound.derive(snapshot, () => false);
    const defaults: Readonly<Record<string, unknown>> = BACKUPABLE_SYNC_SETTINGS_DEFAULTS;
    const withDefault = bound.derive(
      { ...snapshot, [bound.key]: defaults[bound.key] },
      () => false,
    );
    // Write the derived value only where the static default would change what the page uses now;
    // a gate such as batch delete's folders dependency must stay a default, or it would stick off.
    if (effective !== withDefault) settings[bound.key] = bound.write(effective);
  }
  return filterBackupableSyncSettings(settings);
}

export async function exportBackupableSyncSettings(
  storageArea?: StorageAreaLike,
): Promise<SettingsExportPayload> {
  return {
    format: 'gemini-voyager.settings.v1',
    exportedAt: new Date().toISOString(),
    version: EXTENSION_VERSION,
    data: await loadBackupableSyncSettings(storageArea),
  };
}

export async function restoreBackupableSyncSettings(
  settings: unknown,
  storageArea?: StorageAreaLike,
  mode: SettingsRestoreMode = 'overwrite',
): Promise<BackupableSyncSettings> {
  const filtered = filterBackupableSyncSettings(settings);
  // A backup without a watermark choice exports null. Restoring it must not
  // erase a saved choice, such as the one kept for installs that relied on the
  // old enabled default.
  for (const key of WATERMARK_STORAGE_KEYS) {
    if (typeof filtered[key] !== 'boolean') delete filtered[key];
  }
  if (Object.keys(filtered).length === 0) {
    return filtered;
  }

  const area = getStorageArea(storageArea);
  if (mode === 'merge') {
    const current = await area.get({
      [StorageKeys.COACHMARKS_SEEN]: [],
      [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN]: false,
      [StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO]: false,
    });
    if (Object.prototype.hasOwnProperty.call(filtered, StorageKeys.COACHMARKS_SEEN)) {
      const cloudSeenRaw = filtered[StorageKeys.COACHMARKS_SEEN];
      const localSeenRaw = current[StorageKeys.COACHMARKS_SEEN];
      const cloudSeen = Array.isArray(cloudSeenRaw)
        ? cloudSeenRaw.filter((value: unknown): value is string => typeof value === 'string')
        : [];
      const localSeen = Array.isArray(localSeenRaw)
        ? localSeenRaw.filter((value: unknown): value is string => typeof value === 'string')
        : [];
      filtered[StorageKeys.COACHMARKS_SEEN] = [...new Set([...localSeen, ...cloudSeen])];
    }
    if (
      Object.prototype.hasOwnProperty.call(filtered, StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN)
    ) {
      filtered[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN] =
        current[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN] === true ||
        filtered[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN] === true;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        filtered,
        StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO,
      )
    ) {
      filtered[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO] =
        current[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO] === true ||
        filtered[StorageKeys.FOLDER_HIDE_ARCHIVED_NUDGE_SHOWN_AISTUDIO] === true;
    }
  }
  await area.set(filtered);
  return filtered;
}
