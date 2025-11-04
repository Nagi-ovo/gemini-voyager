/**
 * Folder Storage Service
 * Handles folder data persistence with proper error handling
 */

import type { FolderData, Result } from '@/core';
import { storageService, StorageError, ErrorCode, logger } from '@/core';

const STORAGE_KEY = 'gvFolderData' as const;

export class FolderStorageService {
  private readonly logger = logger.createChild('FolderStorage');

  /**
   * Load folder data from storage
   */
  async load(): Promise<Result<FolderData>> {
    try {
      this.logger.debug('Loading folder data');

      // Try localStorage first
      const raw = localStorage.getItem(STORAGE_KEY);

      if (!raw) {
        this.logger.debug('No folder data found, returning empty data');

        return {
          success: true,
          data: { folders: [], folderContents: {} },
        };
      }

      const data = JSON.parse(raw) as FolderData;

      this.logger.debug('Folder data loaded', {
        folderCount: data.folders.length,
      });

      return { success: true, data };
    } catch (error) {
      this.logger.error('Failed to load folder data', { error });

      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_READ_FAILED,
          'Failed to load folder data',
          {},
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  /**
   * Save folder data to storage
   */
  async save(data: FolderData): Promise<Result<void>> {
    try {
      this.logger.debug('Saving folder data', {
        folderCount: data.folders.length,
      });

      const raw = JSON.stringify(data);
      localStorage.setItem(STORAGE_KEY, raw);

      this.logger.debug('Folder data saved successfully');

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to save folder data', { error });

      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          'Failed to save folder data',
          {},
          error instanceof Error ? error : undefined
        ),
      };
    }
  }

  /**
   * Clear all folder data
   */
  async clear(): Promise<Result<void>> {
    try {
      this.logger.debug('Clearing folder data');

      localStorage.removeItem(STORAGE_KEY);

      this.logger.debug('Folder data cleared');

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to clear folder data', { error });

      return {
        success: false,
        error: new StorageError(
          ErrorCode.STORAGE_WRITE_FAILED,
          'Failed to clear folder data',
          {},
          error instanceof Error ? error : undefined
        ),
      };
    }
  }
}
