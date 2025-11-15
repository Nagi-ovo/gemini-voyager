/**
 * Backup Service
 * Handles backup creation and restoration of prompt library and folder data
 */

import browser from 'webextension-polyfill';
import type {
  BackupData,
  BackupResult,
  RestoreResult,
  PromptItem,
  BackupConfig,
} from '../types/backup';
import { BackupInterval } from '../types/backup';
import type { FolderData } from '@/core/types/folder';
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';

const BACKUP_STORAGE_KEYS = {
  CONFIG: 'gvBackupConfig',
  PROMPTS: 'gvPromptItems', // From prompt manager
} as const;

export class BackupService {
  private readonly logger = logger.createChild('BackupService');

  /**
   * Create a backup of current data
   * @param prompts - Optional prompts array (must be provided from popup/content script since service worker can't access localStorage)
   */
  async createBackup(prompts?: PromptItem[]): Promise<BackupResult> {
    try {
      this.logger.info('Creating backup...');

      // Collect data from various sources
      const data = await this.collectBackupData(prompts);

      // Create backup payload
      const backup: BackupData = {
        format: 'gemini-voyager.backup.v1',
        createdAt: new Date().toISOString(),
        version: this.getExtensionVersion(),
        data,
      };

      // Generate filename with full timestamp to ensure uniqueness
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');
      const filename = `gemini-voyager-backup-${timestamp}.json`;

      // Save to downloads
      const result = await this.saveToDownloads(backup, filename);

      // Update last backup time
      await this.updateLastBackupTime();

      this.logger.info('Backup created successfully', { filename });
      return {
        success: true,
        timestamp: Date.now(),
        filename,
      };
    } catch (error) {
      this.logger.error('Backup creation failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Note: Restore functionality has been moved to popup (Popup.tsx)
   * because it requires access to localStorage which is not available in service workers.
   * The popup can directly access both localStorage (for prompts) and chrome.storage.sync (for folders).
   */

  /**
   * Get backup configuration
   */
  async getConfig(): Promise<BackupConfig> {
    try {
      const result = await browser.storage.sync.get(BACKUP_STORAGE_KEYS.CONFIG);
      const config = result[BACKUP_STORAGE_KEYS.CONFIG];

      if (config && typeof config === 'object' && 'enabled' in config && 'interval' in config) {
        return config as BackupConfig;
      }

      return {
        enabled: false,
        interval: BackupInterval.DISABLED,
      };
    } catch (error) {
      this.logger.error('Failed to get backup config', { error });
      return {
        enabled: false,
        interval: BackupInterval.DISABLED,
      };
    }
  }

  /**
   * Update backup configuration
   */
  async updateConfig(config: Partial<BackupConfig>): Promise<void> {
    try {
      const current = await this.getConfig();
      const updated = { ...current, ...config };
      await browser.storage.sync.set({
        [BACKUP_STORAGE_KEYS.CONFIG]: updated,
      });
      this.logger.info('Backup config updated', { config: updated });
    } catch (error) {
      this.logger.error('Failed to update backup config', { error });
      throw error;
    }
  }

  /**
   * Collect all data to be backed up
   * @param prompts - Prompts from localStorage (must be provided from context with DOM access)
   */
  private async collectBackupData(prompts?: PromptItem[]): Promise<BackupData['data']> {
    // Use provided prompts or empty array
    // Note: Service worker cannot access localStorage, so prompts must be provided from popup/content script
    const promptsData = prompts || [];

    if (!prompts || prompts.length === 0) {
      this.logger.warn('No prompts provided for backup. If this is a service worker context, prompts must be passed from popup/content script.');
    }

    // Collect folder data from chrome.storage.sync
    const folderData = await browser.storage.sync.get([
      StorageKeys.FOLDER_DATA,
      StorageKeys.FOLDER_DATA_AISTUDIO,
    ]);

    return {
      prompts: promptsData,
      folders: {
        gemini: (folderData[StorageKeys.FOLDER_DATA] as FolderData | undefined) || null,
        aiStudio: (folderData[StorageKeys.FOLDER_DATA_AISTUDIO] as FolderData | undefined) || null,
      },
    };
  }

  /**
   * Save backup to downloads folder
   */
  private async saveToDownloads(
    backup: BackupData,
    filename: string
  ): Promise<void> {
    const json = JSON.stringify(backup, null, 2);

    // Get config to check for custom folder
    const config = await this.getConfig();
    const downloadFilename = config.folderName
      ? `${config.folderName}/${filename}`
      : filename;

    // Use downloads API with data URL (works in service worker context)
    if (browser.downloads) {
      // Convert JSON to base64 data URL
      const base64 = btoa(unescape(encodeURIComponent(json)));
      const dataUrl = `data:application/json;base64,${base64}`;

      await browser.downloads.download({
        url: dataUrl,
        filename: downloadFilename,
        saveAs: false, // Don't prompt user
      });
    } else {
      throw new Error('Downloads API not available');
    }
  }

  /**
   * Update last backup timestamp
   */
  private async updateLastBackupTime(): Promise<void> {
    const config = await this.getConfig();
    await this.updateConfig({
      lastBackupTime: Date.now(),
    });
  }

  /**
   * Get extension version
   */
  private getExtensionVersion(): string {
    try {
      return browser.runtime.getManifest().version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }
}

// Export singleton instance
export const backupService = new BackupService();
