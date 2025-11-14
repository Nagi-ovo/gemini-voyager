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
   */
  async createBackup(): Promise<BackupResult> {
    try {
      this.logger.info('Creating backup...');

      // Collect data from various sources
      const data = await this.collectBackupData();

      // Create backup payload
      const backup: BackupData = {
        format: 'gemini-voyager.backup.v1',
        createdAt: new Date().toISOString(),
        version: this.getExtensionVersion(),
        data,
      };

      // Generate filename
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, '-')
        .split('T')[0];
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
   * Restore data from a backup file
   */
  async restoreFromBackup(file: File): Promise<RestoreResult> {
    try {
      this.logger.info('Restoring from backup...');

      // Parse backup file
      const text = await file.text();
      const backup = JSON.parse(text) as BackupData;

      // Validate backup format
      if (backup.format !== 'gemini-voyager.backup.v1') {
        throw new Error('Invalid backup format');
      }

      // Restore prompts
      let promptsRestored = 0;
      if (backup.data.prompts && Array.isArray(backup.data.prompts)) {
        await this.restorePrompts(backup.data.prompts);
        promptsRestored = backup.data.prompts.length;
      }

      // Restore folders
      let foldersRestored = false;
      if (backup.data.folders) {
        await this.restoreFolders(backup.data.folders);
        foldersRestored = true;
      }

      this.logger.info('Backup restored successfully', {
        promptsRestored,
        foldersRestored,
      });

      return {
        success: true,
        promptsRestored,
        foldersRestored,
      };
    } catch (error) {
      this.logger.error('Backup restoration failed', { error });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

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
   */
  private async collectBackupData(): Promise<BackupData['data']> {
    // Collect prompts from localStorage
    const prompts = await this.getPromptsFromLocalStorage();

    // Collect folder data from chrome.storage.sync
    const folderData = await browser.storage.sync.get([
      StorageKeys.FOLDER_DATA,
      StorageKeys.FOLDER_DATA_AISTUDIO,
    ]);

    return {
      prompts: prompts || [],
      folders: {
        gemini: folderData[StorageKeys.FOLDER_DATA] || null,
        aiStudio: folderData[StorageKeys.FOLDER_DATA_AISTUDIO] || null,
      },
    };
  }

  /**
   * Get prompts from localStorage
   */
  private async getPromptsFromLocalStorage(): Promise<PromptItem[]> {
    try {
      const raw = localStorage.getItem(BACKUP_STORAGE_KEYS.PROMPTS);
      if (!raw) return [];
      return JSON.parse(raw) as PromptItem[];
    } catch (error) {
      this.logger.warn('Failed to read prompts from localStorage', { error });
      return [];
    }
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

    // Use downloads API with data URL to avoid URL.createObjectURL in service worker
    if (typeof chrome !== 'undefined' && chrome.downloads) {
      // Convert JSON to base64 data URL
      const base64 = btoa(unescape(encodeURIComponent(json)));
      const dataUrl = `data:application/json;base64,${base64}`;

      await chrome.downloads.download({
        url: dataUrl,
        filename: downloadFilename,
        saveAs: false, // Don't prompt user
      });
    } else {
      // Fallback for browsers without downloads API (e.g., during development)
      // This requires DOM environment
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      try {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  /**
   * Restore prompts
   */
  private async restorePrompts(prompts: PromptItem[]): Promise<void> {
    try {
      // Get existing prompts
      const existing = await this.getPromptsFromLocalStorage();

      // Merge: keep existing, add new ones
      const merged = this.mergePrompts(existing, prompts);

      // Save back to localStorage
      localStorage.setItem(
        BACKUP_STORAGE_KEYS.PROMPTS,
        JSON.stringify(merged)
      );

      this.logger.info('Prompts restored', {
        existing: existing.length,
        imported: prompts.length,
        merged: merged.length,
      });
    } catch (error) {
      this.logger.error('Failed to restore prompts', { error });
      throw error;
    }
  }

  /**
   * Restore folder data
   */
  private async restoreFolders(folders: {
    gemini: any;
    aiStudio: any;
  }): Promise<void> {
    try {
      const updates: Record<string, any> = {};

      if (folders.gemini) {
        updates[StorageKeys.FOLDER_DATA] = folders.gemini;
      }

      if (folders.aiStudio) {
        updates[StorageKeys.FOLDER_DATA_AISTUDIO] = folders.aiStudio;
      }

      if (Object.keys(updates).length > 0) {
        await browser.storage.sync.set(updates);
        this.logger.info('Folders restored', { updates });
      }
    } catch (error) {
      this.logger.error('Failed to restore folders', { error });
      throw error;
    }
  }

  /**
   * Merge prompts (avoid duplicates)
   */
  private mergePrompts(
    existing: PromptItem[],
    imported: PromptItem[]
  ): PromptItem[] {
    const map = new Map<string, PromptItem>();

    // Add existing prompts
    for (const item of existing) {
      map.set(item.text.toLowerCase(), item);
    }

    // Add imported prompts (skip duplicates based on text)
    for (const item of imported) {
      const key = item.text.toLowerCase();
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        // Merge tags if prompt already exists
        const existingItem = map.get(key)!;
        const mergedTags = Array.from(
          new Set([...existingItem.tags, ...item.tags])
        );
        existingItem.tags = mergedTags;
        existingItem.updatedAt = Date.now();
      }
    }

    return Array.from(map.values()).sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
    );
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
