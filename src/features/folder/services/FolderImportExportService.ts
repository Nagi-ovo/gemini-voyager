/**
 * Service for importing and exporting folder configurations
 * Follows enterprise best practices with proper validation and error handling
 */
import { AppError, ErrorCode } from '@/core/errors/AppError';
import type { Result } from '@/core/types/common';
import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';
import { LOCK_KEYS, importExportLock } from '@/core/utils/concurrency';
import {
  EXTENSION_VERSION,
  type FormatVersion,
  applyMigrations,
  getCompatibilityInfo,
  isSupportedFormat,
} from '@/core/utils/version';
import { SESSION_BACKUP_KEY, SESSION_BACKUP_TIMESTAMP_KEY } from '@/pages/content/folder/manager';

import {
  type FolderExportPayload,
  type ImportOptions,
  type ImportResult,
  type ValidationError,
  ValidationErrorType,
} from '../types/import-export';

const EXPORT_FORMAT: FormatVersion = 'gemini-voyager.folders.v1' as const;

/**
 * Service for handling folder import/export operations
 */
export class FolderImportExportService {
  /**
   * Export folder data to a downloadable JSON payload
   * Uses centralized version management to ensure consistency
   */
  static exportToPayload(data: FolderData): FolderExportPayload {
    return {
      format: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      version: EXTENSION_VERSION, // Automatically synced from manifest.json
      data: {
        folders: data.folders,
        folderContents: data.folderContents,
      },
    };
  }

  /**
   * Validate import payload format and structure
   * Includes version compatibility checking
   */
  static validatePayload(payload: unknown): Result<FolderExportPayload, ValidationError> {
    // Check if payload is an object
    if (!payload || typeof payload !== 'object') {
      return {
        success: false,
        error: {
          type: ValidationErrorType.INVALID_FORMAT,
          message: 'Invalid payload: expected an object',
          details: payload,
        },
      };
    }

    const p = payload as Record<string, unknown>;

    // Check format version
    if (typeof p.format !== 'string' || !isSupportedFormat(p.format)) {
      return {
        success: false,
        error: {
          type: ValidationErrorType.INVALID_VERSION,
          message: `Unsupported format: expected "${EXPORT_FORMAT}", got "${p.format}"`,
          details: { format: p.format },
        },
      };
    }

    // Check version compatibility
    if (typeof p.version === 'string') {
      const compatInfo = getCompatibilityInfo(p.version, p.format);
      if (!compatInfo.compatible) {
        return {
          success: false,
          error: {
            type: ValidationErrorType.INVALID_VERSION,
            message: compatInfo.reason || 'Version incompatible',
            details: compatInfo,
          },
        };
      }
    }

    // Check required fields
    if (!p.data || typeof p.data !== 'object') {
      return {
        success: false,
        error: {
          type: ValidationErrorType.MISSING_DATA,
          message: 'Missing or invalid "data" field',
          details: p,
        },
      };
    }

    const data = p.data as Record<string, unknown>;

    // Validate folders array
    if (!Array.isArray(data.folders)) {
      return {
        success: false,
        error: {
          type: ValidationErrorType.CORRUPTED_DATA,
          message: 'Invalid "folders" field: expected an array',
          details: data.folders,
        },
      };
    }

    // Validate folderContents object
    if (!data.folderContents || typeof data.folderContents !== 'object') {
      return {
        success: false,
        error: {
          type: ValidationErrorType.CORRUPTED_DATA,
          message: 'Invalid "folderContents" field: expected an object',
          details: data.folderContents,
        },
      };
    }

    // Basic structure validation for folders
    for (const folder of data.folders) {
      if (!folder || typeof folder !== 'object') {
        return {
          success: false,
          error: {
            type: ValidationErrorType.CORRUPTED_DATA,
            message: 'Invalid folder object',
            details: folder,
          },
        };
      }

      const f = folder as Record<string, unknown>;
      if (!f.id || typeof f.id !== 'string') {
        return {
          success: false,
          error: {
            type: ValidationErrorType.CORRUPTED_DATA,
            message: 'Folder missing valid "id" field',
            details: folder,
          },
        };
      }

      if (!f.name || typeof f.name !== 'string') {
        return {
          success: false,
          error: {
            type: ValidationErrorType.CORRUPTED_DATA,
            message: 'Folder missing valid "name" field',
            details: folder,
          },
        };
      }
    }

    return {
      success: true,
      data: payload as FolderExportPayload,
    };
  }

  /**
   * Merge imported data with existing data
   * Skips duplicate folders (by ID) and conversations (by conversationId)
   */
  static mergeData(
    existing: FolderData,
    imported: FolderData,
  ): { merged: FolderData; stats: ImportResult } {
    const existingFolderIds = new Set(existing.folders.map((f) => f.id));
    const newFolders: Folder[] = [];
    let duplicatesFoldersSkipped = 0;

    // Merge folders (skip duplicates)
    for (const folder of imported.folders) {
      if (!existingFolderIds.has(folder.id)) {
        newFolders.push(folder);
      } else {
        duplicatesFoldersSkipped++;
      }
    }

    // Merge folder contents
    const mergedContents: Record<string, ConversationReference[]> = { ...existing.folderContents };
    let conversationsImported = 0;
    let duplicatesConversationsSkipped = 0;

    for (const [folderId, conversations] of Object.entries(imported.folderContents)) {
      if (!mergedContents[folderId]) {
        mergedContents[folderId] = [];
      }

      const existingConvIds = new Set(mergedContents[folderId].map((c) => c.conversationId));

      for (const conv of conversations) {
        if (!existingConvIds.has(conv.conversationId)) {
          mergedContents[folderId].push(conv);
          conversationsImported++;
        } else {
          duplicatesConversationsSkipped++;
        }
      }
    }

    const merged: FolderData = {
      folders: [...existing.folders, ...newFolders],
      folderContents: mergedContents,
    };

    const stats: ImportResult = {
      foldersImported: newFolders.length,
      conversationsImported,
      duplicatesFoldersSkipped,
      duplicatesConversationsSkipped,
    };

    return { merged, stats };
  }

  /**
   * Import folder data from payload
   * @param payload - The import payload
   * @param currentData - Current folder data
   * @param options - Import options (strategy, backup)
   * @returns Result with import statistics
   *
   * Note: This method should be called through importFromPayloadWithLock for concurrency protection
   */
  private static importFromPayloadInternal(
    payload: FolderExportPayload,
    currentData: FolderData,
    options: ImportOptions,
  ): Result<{ data: FolderData; stats: ImportResult }> {
    try {
      const { strategy, createBackup = true } = options;

      // Apply any necessary data migrations
      let importData = payload.data;
      const migrationsApplied: string[] = [];

      if (payload.version) {
        try {
          const migrationResult = applyMigrations(payload.data, payload.version);
          importData = migrationResult.data as FolderData;
          migrationsApplied.push(...migrationResult.migrationsApplied);

          if (migrationsApplied.length > 0) {
            console.log('Applied migrations:', migrationsApplied);
          }
        } catch (error) {
          console.warn('Migration failed, using original data:', error);
        }
      }

      // Create backup if requested
      let backupData: FolderData | null = null;
      if (createBackup) {
        backupData = {
          folders: [...currentData.folders],
          folderContents: { ...currentData.folderContents },
        };
      }

      let resultData: FolderData;
      let stats: ImportResult;

      if (strategy === 'overwrite') {
        // Overwrite: completely replace with imported data
        resultData = {
          folders: [...importData.folders],
          folderContents: { ...importData.folderContents },
        };

        const totalConversations = Object.values(importData.folderContents).reduce(
          (sum, convs) => sum + convs.length,
          0,
        );

        stats = {
          foldersImported: importData.folders.length,
          conversationsImported: totalConversations,
          backupCreated: createBackup,
        };
      } else {
        // Merge: combine with existing data
        const mergeResult = this.mergeData(currentData, importData);
        resultData = mergeResult.merged;
        stats = {
          ...mergeResult.stats,
          backupCreated: createBackup,
        };
      }

      // Store backup in sessionStorage if created
      if (backupData) {
        try {
          sessionStorage.setItem(SESSION_BACKUP_KEY, JSON.stringify(backupData));
          sessionStorage.setItem(SESSION_BACKUP_TIMESTAMP_KEY, new Date().toISOString());
        } catch (error) {
          // Backup storage failed, but continue with import
          console.warn('Failed to store backup in sessionStorage', error);
        }
      }

      return {
        success: true,
        data: { data: resultData, stats },
      };
    } catch (error) {
      return {
        success: false,
        error: new AppError(ErrorCode.UNKNOWN_ERROR, 'Import failed', { originalError: error }),
      };
    }
  }

  /**
   * Import folder data from payload with concurrency protection
   * This is the public method that should be used for imports
   * @param payload - The import payload
   * @param currentData - Current folder data
   * @param options - Import options (strategy, backup)
   * @returns Result with import statistics
   */
  static async importFromPayload(
    payload: FolderExportPayload,
    currentData: FolderData,
    options: ImportOptions,
  ): Promise<Result<{ data: FolderData; stats: ImportResult }>> {
    // Use lock to prevent concurrent imports
    return await importExportLock.withLock(
      LOCK_KEYS.FOLDER_IMPORT,
      () => Promise.resolve(this.importFromPayloadInternal(payload, currentData, options)),
      30000, // 30 second timeout
    );
  }

  /**
   * Generate filename for export with timestamp
   */
  static generateExportFilename(): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    const d = new Date();
    const y = d.getFullYear();
    const m = pad(d.getMonth() + 1);
    const day = pad(d.getDate());
    const hh = pad(d.getHours());
    const mm = pad(d.getMinutes());
    const ss = pad(d.getSeconds());
    return `gemini-voyager-folders-${y}${m}${day}-${hh}${mm}${ss}.json`;
  }

  /**
   * Download JSON file to user's computer
   */
  static downloadJSON(payload: FolderExportPayload, filename?: string): void {
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || this.generateExportFilename();
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        document.body.removeChild(a);
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    }, 0);
  }

  /**
   * Read and parse JSON file from user upload
   */
  static async readJSONFile(file: File): Promise<Result<unknown>> {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      return {
        success: true,
        data: parsed,
      };
    } catch (error) {
      return {
        success: false,
        error: new AppError(ErrorCode.VALIDATION_ERROR, 'Failed to parse JSON file', {
          originalError: error,
        }),
      };
    }
  }

  /**
   * Restore from backup stored in sessionStorage
   */
  static restoreFromBackup(): Result<FolderData> {
    try {
      const backupStr = sessionStorage.getItem(SESSION_BACKUP_KEY);
      if (!backupStr) {
        return {
          success: false,
          error: new AppError(ErrorCode.STORAGE_READ_FAILED, 'No backup found'),
        };
      }

      const backup = JSON.parse(backupStr) as FolderData;
      return {
        success: true,
        data: backup,
      };
    } catch (error) {
      return {
        success: false,
        error: new AppError(ErrorCode.UNKNOWN_ERROR, 'Failed to restore backup', {
          originalError: error,
        }),
      };
    }
  }

  /**
   * Clear backup from sessionStorage
   */
  static clearBackup(): void {
    try {
      sessionStorage.removeItem(SESSION_BACKUP_KEY);
      sessionStorage.removeItem(SESSION_BACKUP_TIMESTAMP_KEY);
    } catch {
      /* ignore */
    }
  }

  /**
   * Check if backup exists
   */
  static hasBackup(): boolean {
    try {
      return sessionStorage.getItem(SESSION_BACKUP_KEY) !== null;
    } catch {
      return false;
    }
  }

  /**
   * Get backup timestamp
   */
  static getBackupTimestamp(): string | null {
    try {
      return sessionStorage.getItem(SESSION_BACKUP_TIMESTAMP_KEY);
    } catch {
      return null;
    }
  }
}
