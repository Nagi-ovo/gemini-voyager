/**
 * Sync-related type definitions for Google Drive sync feature
 * Provides type safety for sync state management and data transfer
 */
import type { StarredMessagesData } from '@/pages/content/timeline/starredTypes';

import type { FolderData } from './folder';

/**
 * Sync mode configuration
 * - disabled: Sync feature is off
 * - manual: User must click "Sync Now" to trigger sync
 * - auto: Sync happens automatically on startup and periodically
 */
export type SyncMode = 'disabled' | 'manual' | 'auto';

/**
 * Platform identifier for sync operations
 * - gemini: Main Gemini website (gemini.google.com)
 * - aistudio: AI Studio website (aistudio.google.com, aistudio.google.cn)
 */
export type SyncPlatform = 'gemini' | 'aistudio';

/**
 * Current sync state for UI display
 */
export interface SyncState {
  /** Current sync mode setting */
  mode: SyncMode;
  /** Timestamp of last successful sync/download (null if never synced) - Gemini */
  lastSyncTime: number | null;
  /** Timestamp of last successful upload (null if never uploaded) - Gemini */
  lastUploadTime: number | null;
  /** Timestamp of last successful sync/download for AI Studio */
  lastSyncTimeAIStudio: number | null;
  /** Timestamp of last successful upload for AI Studio */
  lastUploadTimeAIStudio: number | null;
  /** Whether a sync operation is currently in progress */
  isSyncing: boolean;
  /** Last error message (null if no error) */
  error: string | null;
  /** Whether user is authenticated with Google */
  isAuthenticated: boolean;
}

/**
 * Prompt item structure (mirrored from prompt manager for type safety)
 */
export interface PromptItem {
  id: string;
  text: string;
  tags: string[];
  createdAt: number;
  updatedAt?: number;
}

/**
 * Folder export payload format (matches existing export format)
 */
export interface FolderExportPayload {
  format: 'gemini-voyager.folders.v1';
  exportedAt: string;
  version: string;
  data: FolderData;
}

/**
 * Prompt export payload format (matches existing export format)
 */
export interface PromptExportPayload {
  format: 'gemini-voyager.prompts.v1';
  exportedAt: string;
  version?: string;
  items: PromptItem[];
}
/**
 * Re-export starred message types from their canonical source
 * These are used for Google Drive sync
 */
export type {
  StarredMessage as StarredMessageSync,
  StarredMessagesData as StarredMessagesDataSync,
} from '@/pages/content/timeline/starredTypes';

/**
 * Starred messages export payload format
 */
export interface StarredExportPayload {
  format: 'gemini-voyager.starred.v1';
  exportedAt: string;
  version?: string;
  data: StarredMessagesData;
}

/**
 * Data payload synced to Google Drive
 * Uses embedded export formats for compatibility with import/export feature
 */
export interface SyncData {
  /** Extension version that created this sync data */
  version: string;
  /** Format identifier for backward compatibility */
  format: 'gemini-voyager.sync.v1';
  /** Folder data in export format */
  folders: FolderExportPayload;
  /** Prompt data in export format */
  prompts: PromptExportPayload;
  /** Timestamp when this data was synced */
  syncedAt: number;
}

/**
 * Storage keys for sync-related settings
 */
export const SyncStorageKeys = {
  MODE: 'gvSyncMode',
  LAST_SYNC_TIME: 'gvLastSyncTime',
  SYNC_ERROR: 'gvSyncError',
} as const;

/**
 * Default sync state for initial load
 */
export const DEFAULT_SYNC_STATE: SyncState = {
  mode: 'disabled',
  lastSyncTime: null,
  lastUploadTime: null,
  lastSyncTimeAIStudio: null,
  lastUploadTimeAIStudio: null,
  isSyncing: false,
  error: null,
  isAuthenticated: false,
};

/**
 * Sync message types for background script communication
 */
export type SyncMessageType =
  | 'gv.sync.authenticate'
  | 'gv.sync.signOut'
  | 'gv.sync.upload'
  | 'gv.sync.download'
  | 'gv.sync.getState'
  | 'gv.sync.setMode';

/**
 * Message payload for sync operations
 */
export interface SyncMessage {
  type: SyncMessageType;
  payload?: {
    mode?: SyncMode;
    data?: SyncData;
  };
}

/**
 * Response from sync operations
 */
export interface SyncResponse {
  ok: boolean;
  error?: string;
  state?: SyncState;
  data?: SyncData;
}
