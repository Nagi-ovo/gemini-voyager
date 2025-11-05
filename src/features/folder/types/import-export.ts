/**
 * Types for folder configuration import/export
 */

import type { FolderData } from '@/core/types/folder';

/**
 * Export payload format with versioning
 */
export interface FolderExportPayload {
  format: 'gemini-voyager.folders.v1';
  exportedAt: string; // ISO 8601 timestamp
  version: string; // Extension version
  data: FolderData;
}

/**
 * Import strategy options
 */
export type ImportStrategy = 'merge' | 'overwrite';

/**
 * Import options
 */
export interface ImportOptions {
  strategy: ImportStrategy;
  createBackup?: boolean; // Default: true
}

/**
 * Import result details
 */
export interface ImportResult {
  foldersImported: number;
  conversationsImported: number;
  duplicatesFoldersSkipped?: number;
  duplicatesConversationsSkipped?: number;
  backupCreated?: boolean;
}

/**
 * Validation error types
 */
export enum ValidationErrorType {
  INVALID_FORMAT = 'INVALID_FORMAT',
  INVALID_VERSION = 'INVALID_VERSION',
  MISSING_DATA = 'MISSING_DATA',
  CORRUPTED_DATA = 'CORRUPTED_DATA',
}

/**
 * Validation error
 */
export interface ValidationError {
  type: ValidationErrorType;
  message: string;
  details?: unknown;
}
