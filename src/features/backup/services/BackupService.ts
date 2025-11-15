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
   * Creates two separate files: one for prompts, one for folders
   * @param prompts - Optional prompts array (must be provided from popup/content script since service worker can't access localStorage)
   */
  async createBackup(prompts?: PromptItem[]): Promise<BackupResult> {
    try {
      this.logger.info('Creating backup...');

      // Generate timestamp for consistent filenames
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-');

      const folderName = (await this.getConfig()).folderName;
      const results: string[] = [];

      // 1. Backup prompts if provided
      if (prompts && prompts.length > 0) {
        const promptsFilename = `gemini-voyager-prompts-${timestamp}.json`;
        await this.savePromptsBackup(prompts, promptsFilename, folderName);
        results.push(promptsFilename);
        this.logger.info('Prompts backup created', { filename: promptsFilename, count: prompts.length });
      } else {
        this.logger.warn('No prompts provided for backup');
      }

      // 2. Backup folders
      const foldersFilename = `gemini-voyager-folders-${timestamp}.json`;
      await this.saveFoldersBackup(foldersFilename, folderName);
      results.push(foldersFilename);
      this.logger.info('Folders backup created', { filename: foldersFilename });

      // Update last backup time
      await this.updateLastBackupTime();

      this.logger.info('Backup completed successfully', { files: results });
      return {
        success: true,
        timestamp: Date.now(),
        filename: results.join(', '), // Return comma-separated list of files
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
   * Save prompts backup
   * Format: Direct JSON array compatible with prompt manager import
   */
  private async savePromptsBackup(
    prompts: PromptItem[],
    filename: string,
    folderName?: string
  ): Promise<void> {
    const json = JSON.stringify(prompts, null, 2);
    await this.downloadJSON(json, filename, folderName);
  }

  /**
   * Save folders backup
   * Format: FolderExportPayload compatible with folder manager import
   */
  private async saveFoldersBackup(
    filename: string,
    folderName?: string
  ): Promise<void> {
    // Collect folder data from chrome.storage.sync
    const folderData = await browser.storage.sync.get([
      StorageKeys.FOLDER_DATA,
      StorageKeys.FOLDER_DATA_AISTUDIO,
    ]);

    const geminiData = folderData[StorageKeys.FOLDER_DATA] as FolderData | undefined;
    const aiStudioData = folderData[StorageKeys.FOLDER_DATA_AISTUDIO] as FolderData | undefined;

    // Create export payload using folder manager's format
    const exportPayload = {
      format: 'gemini-voyager.folders.v1' as const,
      exportedAt: new Date().toISOString(),
      version: this.getExtensionVersion(),
      gemini: geminiData || { folders: [], folderContents: {} },
      aiStudio: aiStudioData || { folders: [], folderContents: {} },
    };

    const json = JSON.stringify(exportPayload, null, 2);
    await this.downloadJSON(json, filename, folderName);
  }

  /**
   * Download JSON file using downloads API
   */
  private async downloadJSON(
    json: string,
    filename: string,
    folderName?: string
  ): Promise<void> {
    const downloadFilename = folderName
      ? `${folderName}/${filename}`
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
