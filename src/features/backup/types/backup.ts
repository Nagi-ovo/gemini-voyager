/**
 * Types for auto-backup functionality
 * Follows enterprise best practices with comprehensive type safety
 */
import type { Result } from '@/core/types/common';

/**
 * Prompt item structure (matches prompt manager schema)
 */
export interface PromptItem {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
}

/**
 * Prompt export payload format
 */
export interface PromptExportPayload {
  format: 'gemini-voyager.prompts.v1';
  exportedAt: string;
  version?: string;
  items: PromptItem[];
}

/**
 * Backup configuration stored in chrome.storage
 */
export interface BackupConfig {
  /** Enable auto-backup feature */
  enabled: boolean;
  /** Auto-backup interval in hours (0 = manual only) */
  intervalHours: number;
  /** Last backup timestamp (ISO 8601) */
  lastBackupAt?: string;
  /** Whether to include prompts in backup */
  includePrompts: boolean;
  /** Whether to include folders in backup */
  includeFolders: boolean;
}

/**
 * Backup metadata stored in backup folder
 */
export interface BackupMetadata {
  version: string;
  timestamp: string;
  includesPrompts: boolean;
  includesFolders: boolean;
  promptCount?: number;
  folderCount?: number;
  conversationCount?: number;
}

/**
 * Result of backup operation
 * Note: Wrapped in Result<T> type, so no need for success/error fields here
 */
export interface BackupResult {
  /** Timestamp of backup (ISO 8601) */
  timestamp: string;
  /** Number of prompts backed up */
  promptCount: number;
  /** Number of folders backed up */
  folderCount: number;
  /** Number of conversations backed up */
  conversationCount: number;
}

/**
 * File handle with name and content
 */
export interface BackupFile {
  name: string;
  content: string;
}

/**
 * Backup service interface
 */
export interface IBackupService {
  /**
   * Create a backup with timestamp-based folder
   * @param directoryHandle - File System Access API directory handle
   * @param config - Backup configuration
   * @returns Result with backup statistics
   */
  createBackup(
    directoryHandle: FileSystemDirectoryHandle,
    config: BackupConfig,
  ): Promise<Result<BackupResult>>;

  /**
   * Generate backup files without writing to filesystem
   * Useful for testing or preview
   * @param config - Backup configuration
   * @returns Array of backup files
   */
  generateBackupFiles(config: BackupConfig): Promise<Result<BackupFile[]>>;

  /**
   * Check if backup is needed based on config
   * @param config - Backup configuration
   * @returns true if backup should be performed
   */
  shouldBackup(config: BackupConfig): boolean;
}

/**
 * Storage keys for backup configuration
 */
export const BACKUP_STORAGE_KEYS = {
  CONFIG: 'gvBackupConfig',
} as const;

/**
 * Default backup configuration
 */
export const DEFAULT_BACKUP_CONFIG: BackupConfig = {
  enabled: false,
  intervalHours: 24, // Daily by default
  includePrompts: true,
  includeFolders: true,
};
