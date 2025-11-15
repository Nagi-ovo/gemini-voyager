/**
 * Backup feature type definitions
 * Supports periodic backup of prompt library and folder data
 */

import type { FolderData } from '@/core/types/folder';

/**
 * Backup interval options
 */
export enum BackupInterval {
  DISABLED = 'disabled',
  HOURLY = 'hourly',
  DAILY = 'daily',
  WEEKLY = 'weekly',
}

/**
 * Backup interval info for UI
 */
export interface BackupIntervalInfo {
  interval: BackupInterval;
  label: string;
  description: string;
  minutes?: number; // For chrome.alarms API
}

/**
 * Backup configuration
 */
export interface BackupConfig {
  enabled: boolean;
  interval: BackupInterval;
  lastBackupTime?: number; // timestamp
  folderName?: string; // subfolder name in downloads
}

/**
 * Backup data payload
 */
export interface BackupData {
  format: 'gemini-voyager.backup.v1';
  createdAt: string;
  version: string; // Extension version
  data: {
    prompts: PromptItem[];
    folders: {
      gemini: FolderData | null;
      aiStudio: FolderData | null;
    };
  };
}

/**
 * Prompt item (matches prompt manager schema)
 */
export interface PromptItem {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
}

/**
 * Backup result
 */
export interface BackupResult {
  success: boolean;
  timestamp?: number;
  filename?: string;
  error?: string;
}

/**
 * Restore result
 */
export interface RestoreResult {
  success: boolean;
  promptsRestored?: number;
  foldersRestored?: boolean;
  error?: string;
}
