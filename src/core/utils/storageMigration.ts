/**
 * Storage Migration Utility
 * Handles migration from localStorage to chrome.storage for cross-domain data sharing
 */
import { logger } from '@/core/services/LoggerService';
import type { IStorageService } from '@/core/services/StorageService';
import type { StorageKey } from '@/core/types/common';

export interface MigrationResult {
  success: boolean;
  migratedKeys: string[];
  skippedKeys: string[];
  errors: Array<{ key: string; error: string }>;
}

/**
 * Migrate data from localStorage to chrome.storage
 *
 * @param keys - Array of localStorage keys to migrate
 * @param targetStorage - Target storage service (e.g., promptStorageService)
 * @param options - Migration options
 * @returns Migration result with details
 *
 * @example
 * ```typescript
 * const result = await migrateFromLocalStorage(
 *   [StorageKeys.PROMPT_ITEMS, StorageKeys.PROMPT_PANEL_LOCKED],
 *   promptStorageService,
 *   { deleteAfterMigration: false }
 * );
 * ```
 */
export async function migrateFromLocalStorage(
  keys: StorageKey[],
  targetStorage: IStorageService,
  options: {
    deleteAfterMigration?: boolean; // Whether to delete from localStorage after successful migration
    skipExisting?: boolean; // Skip keys that already exist in target storage
  } = {},
): Promise<MigrationResult> {
  const migrationLogger = logger.createChild('StorageMigration');
  const result: MigrationResult = {
    success: true,
    migratedKeys: [],
    skippedKeys: [],
    errors: [],
  };

  const { deleteAfterMigration = false, skipExisting = true } = options;

  for (const key of keys) {
    try {
      // Check if already exists in target storage
      if (skipExisting) {
        const existingResult = await targetStorage.get(key);
        if (existingResult.success) {
          migrationLogger.info(`Skipping key "${key}" - already exists in target storage`);
          result.skippedKeys.push(key);
          continue;
        }
      }

      // Read from localStorage
      const localValue = localStorage.getItem(key);
      if (localValue === null) {
        migrationLogger.info(`Skipping key "${key}" - not found in localStorage`);
        result.skippedKeys.push(key);
        continue;
      }

      // Parse the value
      let parsedValue: unknown;
      try {
        parsedValue = JSON.parse(localValue);
      } catch (parseError) {
        migrationLogger.error(`Failed to parse localStorage value for key "${key}"`, {
          parseError,
        });
        result.errors.push({ key, error: 'Failed to parse JSON' });
        result.success = false;
        continue;
      }

      // Write to target storage
      const writeResult = await targetStorage.set(key, parsedValue);
      if (!writeResult.success) {
        migrationLogger.error(`Failed to write to target storage for key "${key}"`, {
          error: writeResult.error,
        });
        result.errors.push({
          key,
          error: writeResult.error?.message || 'Failed to write to target storage',
        });
        result.success = false;
        continue;
      }

      migrationLogger.info(`Successfully migrated key "${key}"`);
      result.migratedKeys.push(key);

      // Delete from localStorage if requested
      if (deleteAfterMigration) {
        try {
          localStorage.removeItem(key);
          migrationLogger.info(`Deleted key "${key}" from localStorage`);
        } catch (deleteError) {
          migrationLogger.warn(`Failed to delete key "${key}" from localStorage`, { deleteError });
          // Don't mark as failure since migration succeeded
        }
      }
    } catch (error) {
      migrationLogger.error(`Unexpected error migrating key "${key}"`, { error });
      result.errors.push({
        key,
        error: error instanceof Error ? error.message : 'Unexpected error',
      });
      result.success = false;
    }
  }

  // Log summary
  migrationLogger.info('Migration completed', {
    migratedCount: result.migratedKeys.length,
    skippedCount: result.skippedKeys.length,
    errorCount: result.errors.length,
  });

  return result;
}

/**
 * Check if migration has been completed for a specific key
 *
 * @param key - Storage key to check
 * @param targetStorage - Target storage service
 * @returns True if data exists in target storage (migration completed)
 */
export async function isMigrationCompleted(
  key: StorageKey,
  targetStorage: IStorageService,
): Promise<boolean> {
  const result = await targetStorage.get(key);
  return result.success;
}

/**
 * Get migration status for multiple keys
 *
 * @param keys - Array of keys to check
 * @param targetStorage - Target storage service
 * @returns Object mapping keys to migration status
 */
export async function getMigrationStatus(
  keys: StorageKey[],
  targetStorage: IStorageService,
): Promise<Record<string, boolean>> {
  const status: Record<string, boolean> = {};

  await Promise.all(
    keys.map(async (key) => {
      status[key] = await isMigrationCompleted(key, targetStorage);
    }),
  );

  return status;
}
