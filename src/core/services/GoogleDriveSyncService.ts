/**
 * Google Drive Sync Service
 *
 * Enterprise-grade service for syncing extension data to Google Drive
 * Uses Chrome Identity API for OAuth2 and Drive REST API v3 for storage
 *
 * Stores folders, prompts, and other sync data as separate files:
 * - gemini-voyager-folders.json
 * - gemini-voyager-prompts.json
 * - gemini-voyager-settings.json
 * - gemini-voyager-plugins.json
 * - gemini-voyager-starred.json
 * - gemini-voyager-highlights.json (account-scoped; independent from legacy sync data)
 */
import type { FolderData } from '@/core/types/folder';
import { isHighlightExportPayloadV1 } from '@/core/types/highlight';
import type {
  FolderExportPayload,
  ForkExportPayload,
  ForkNodesDataSync,
  HighlightExportPayload,
  PluginStateExportPayload,
  PromptExportPayload,
  PromptItem,
  SettingsExportPayload,
  StarredExportPayload,
  StarredMessagesDataSync,
  SyncAccountScope,
  SyncMode,
  SyncPlatform,
  SyncProvider,
  SyncState,
  TimelineHierarchyDataSync,
  TimelineHierarchyExportPayload,
} from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';
import { getVoyagerBuildTarget, isBrave, isSafari } from '@/core/utils/browser';
import { hashString } from '@/core/utils/hash';
import {
  downloadSafariGoogleDriveFile,
  ensureSafariGoogleDriveFile,
  findSafariGoogleDriveFile,
  getSafariGoogleDriveRetryDelay,
  isSafariGoogleDriveAuthError,
  requestSafariGoogleDriveSession,
  signOutSafariGoogleDrive,
  uploadSafariGoogleDriveFile,
} from '@/core/utils/safariGoogleDrive';
import {
  checkSafariICloudAccount,
  getSafariICloudRetryDelay,
  isSafariICloudConflictError,
  readSafariICloudFile,
  writeSafariICloudFile,
} from '@/core/utils/safariICloudSync';
import { EXTENSION_VERSION } from '@/core/utils/version';
import type { PluginStateMap } from '@/features/plugins/storage/pluginState';

const FOLDERS_FILE_NAME = 'gemini-voyager-folders.json';
const AISTUDIO_FOLDERS_FILE_NAME = 'gemini-voyager-aistudio-folders.json';
const PROMPTS_FILE_NAME = 'gemini-voyager-prompts.json';
const SETTINGS_FILE_NAME = 'gemini-voyager-settings.json';
const PLUGINS_FILE_NAME = 'gemini-voyager-plugins.json';
const STARRED_FILE_NAME = 'gemini-voyager-starred.json';
const FORKS_FILE_NAME = 'gemini-voyager-forks.json';
const TIMELINE_HIERARCHY_FILE_NAME = 'gemini-voyager-timeline-hierarchy.json';
const HIGHLIGHTS_FILE_NAME = 'gemini-voyager-highlights.json';
const BACKUP_FOLDER_NAME = 'Voyager Data';
const LEGACY_BACKUP_FOLDER_NAME = 'Gemini Voyager Data';
const BACKUP_FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
const BACKUP_FOLDER_MARKER_KEY = 'voyagerDataFolder';
const BACKUP_FOLDER_MARKER_VALUE = '1';
const BACKUP_FOLDER_RECOVERY_FILE_NAMES = [
  FOLDERS_FILE_NAME,
  AISTUDIO_FOLDERS_FILE_NAME,
  PROMPTS_FILE_NAME,
  SETTINGS_FILE_NAME,
  PLUGINS_FILE_NAME,
  STARRED_FILE_NAME,
] as const;
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;
const IDENTITY_TOKEN_TTL_SECONDS = 55 * 60;

function getStringValue(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function getNumberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function isSafariRuntime(): boolean {
  return getVoyagerBuildTarget() === 'safari' || isSafari();
}

interface DriveFolderMetadata {
  id: string;
  name: string;
  mimeType?: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  trashed?: boolean;
}

interface DriveSyncFileMetadata {
  id: string;
  name: string;
  parents?: string[];
}

/**
 * Google Drive Sync Service
 * Handles authentication, upload, and download of sync data as separate files
 */
export class GoogleDriveSyncService {
  private state: SyncState = { ...DEFAULT_SYNC_STATE };
  private foldersFileId: string | null = null;
  private aistudioFoldersFileId: string | null = null;
  private promptsFileId: string | null = null;
  private settingsFileId: string | null = null;
  private pluginsFileId: string | null = null;
  private starredFileId: string | null = null;
  private forksFileId: string | null = null;
  private timelineHierarchyFileId: string | null = null;
  private highlightsFileId: string | null = null;
  private backupFolderId: string | null = null;
  private backupFolderResolutionPromise: Promise<string | null> | null = null;
  private fileIdByName: Record<string, string> = {};
  private stateChangeCallback: ((state: SyncState) => void) | null = null;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private stateLoadPromise: Promise<void> | null = null;

  constructor() {
    this.stateLoadPromise = this.loadState();
  }

  onStateChange(callback: (state: SyncState) => void): void {
    this.stateChangeCallback = callback;
  }

  /**
   * Ensure state is loaded before returning
   */
  async getState(): Promise<SyncState> {
    if (this.stateLoadPromise) {
      await this.stateLoadPromise;
    }
    return { ...this.state };
  }

  async setMode(mode: SyncMode): Promise<void> {
    this.state.mode = mode;
    await this.saveState();
    this.notifyStateChange();
  }

  async setProvider(provider: SyncProvider): Promise<void> {
    if (provider === 'icloud' && !isSafariRuntime()) {
      throw new Error('iCloud sync is available only in Safari');
    }
    if (provider === this.state.provider) return;

    await this.clearToken();
    this.state.provider = provider;
    this.state.isAuthenticated = false;
    this.state.error = null;
    this.resetDriveFileCache();
    await this.saveState();
    this.notifyStateChange();
  }

  async authenticate(interactive: boolean = true): Promise<boolean> {
    try {
      this.updateState({ isSyncing: true, error: null });
      const token = await this.getAuthToken(interactive);
      if (!token) {
        // If not interactive and no token, just return false silently
        if (!interactive) {
          this.updateState({ isAuthenticated: false, isSyncing: false });
          return false;
        }
        throw new Error('Failed to obtain auth token');
      }
      this.updateState({ isAuthenticated: true, isSyncing: false });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
      console.error('[GoogleDriveSyncService] Authentication failed:', error);
      this.updateState({ isAuthenticated: false, isSyncing: false, error: errorMessage });
      return false;
    }
  }

  async signOut(): Promise<void> {
    if (this.state.provider === 'icloud') {
      this.updateState({ isAuthenticated: false, error: null });
      await this.saveState();
      return;
    }

    try {
      if (isSafariRuntime()) {
        await signOutSafariGoogleDrive();
      } else if (this.accessToken) {
        await this.removeCachedAuthToken(this.accessToken);
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.accessToken}`);
      }
    } catch (error) {
      console.warn('[GoogleDriveSyncService] Sign out warning:', error);
    }
    await this.clearToken();
    this.resetDriveFileCache();
    this.updateState({ isAuthenticated: false, lastSyncTime: null, error: null });
    await this.saveState();
  }

  /**
   * Upload folders, prompts, and timeline data as separate files to Google Drive
   * @param folders Folder data to upload
   * @param prompts Prompt items (only for Gemini platform)
   * @param starred Starred messages (only for Gemini platform)
   * @param interactive Whether to show auth prompt if needed
   * @param platform Platform to upload for ('gemini' | 'aistudio')
   */
  async upload(
    folders: FolderData,
    prompts: PromptItem[],
    starred: StarredMessagesDataSync | null = null,
    interactive: boolean = true,
    platform: SyncPlatform = 'gemini',
    forks: ForkNodesDataSync | null = null,
    timelineHierarchy: TimelineHierarchyDataSync | null = null,
    accountScope: SyncAccountScope | null = null,
    timelineHierarchyAccountScope: SyncAccountScope | null = null,
    settings: Record<string, unknown> | null = null,
    plugins: PluginStateMap | null = null,
  ): Promise<boolean> {
    try {
      this.updateState({ isSyncing: true, error: null });

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          console.log(
            '[GoogleDriveSyncService] Upload skipped: Not authenticated (non-interactive)',
          );
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return false;
        }
        throw new Error('Not authenticated');
      }

      const now = new Date();

      // Create folder payload
      const folderPayload: FolderExportPayload = {
        format: 'gemini-voyager.folders.v1',
        exportedAt: now.toISOString(),
        version: EXTENSION_VERSION,
        data: folders,
      };

      // Create prompt payload
      const promptPayload: PromptExportPayload = {
        format: 'gemini-voyager.prompts.v1',
        exportedAt: now.toISOString(),
        version: EXTENSION_VERSION,
        items: prompts,
      };

      const settingsPayload: SettingsExportPayload | null = settings
        ? {
            format: 'gemini-voyager.settings.v1',
            exportedAt: now.toISOString(),
            version: EXTENSION_VERSION,
            data: settings,
          }
        : null;

      const pluginsPayload: PluginStateExportPayload | null = plugins
        ? {
            format: 'gemini-voyager.plugins.v1',
            exportedAt: now.toISOString(),
            version: EXTENSION_VERSION,
            data: plugins,
          }
        : null;

      // Upload folders file (platform-specific)
      const foldersBaseFileName =
        platform === 'aistudio' ? AISTUDIO_FOLDERS_FILE_NAME : FOLDERS_FILE_NAME;
      const foldersFileName = this.getFileNameForScope(foldersBaseFileName, accountScope);
      const foldersType = platform === 'aistudio' ? 'aistudio-folders' : 'folders';
      const foldersFileIdToUse = await this.ensureFileId(token, foldersFileName, foldersType);
      await this.uploadFileWithRetry(token, foldersFileIdToUse, folderPayload);
      console.log(`[GoogleDriveSyncService] ${platform} folders uploaded successfully`);

      // Upload prompts file (shared between Gemini and AI Studio)
      if (prompts.length > 0) {
        const promptsFileName = this.getFileNameForScope(PROMPTS_FILE_NAME, accountScope);
        const promptsFileId = await this.ensureFileId(token, promptsFileName, 'prompts');
        await this.uploadFileWithRetry(token, promptsFileId, promptPayload);
        console.log('[GoogleDriveSyncService] Prompts uploaded successfully');
      }

      if (settingsPayload) {
        const settingsFileId = await this.ensureFileId(token, SETTINGS_FILE_NAME, 'settings');
        await this.uploadFileWithRetry(token, settingsFileId, settingsPayload);
        console.log('[GoogleDriveSyncService] Settings uploaded successfully');
      }

      if (pluginsPayload) {
        const pluginsFileId = await this.ensureFileId(token, PLUGINS_FILE_NAME, 'plugins');
        await this.uploadFileWithRetry(token, pluginsFileId, pluginsPayload);
      }

      // Upload starred messages file (only for Gemini platform)
      if (platform === 'gemini' && starred) {
        // Truncate content in starred messages to save storage space
        const MAX_CONTENT_LENGTH = 60;
        const truncatedStarred: StarredMessagesDataSync = {
          messages: Object.fromEntries(
            Object.entries(starred.messages).map(([convId, messages]) => [
              convId,
              messages.map((msg) => ({
                ...msg,
                content:
                  msg.content.length > MAX_CONTENT_LENGTH
                    ? msg.content.slice(0, MAX_CONTENT_LENGTH) + '...'
                    : msg.content,
              })),
            ]),
          ),
        };

        const starredPayload: StarredExportPayload = {
          format: 'gemini-voyager.starred.v1',
          exportedAt: now.toISOString(),
          version: EXTENSION_VERSION,
          data: truncatedStarred,
        };
        const starredFileName = this.getFileNameForScope(STARRED_FILE_NAME, accountScope);
        const starredFileId = await this.ensureFileId(token, starredFileName, 'starred');
        await this.uploadFileWithRetry(token, starredFileId, starredPayload);
        console.log('[GoogleDriveSyncService] Starred messages uploaded successfully');
      }

      // Upload fork nodes file (only for Gemini platform)
      if (platform === 'gemini' && forks) {
        const forksPayload: ForkExportPayload = {
          format: 'gemini-voyager.forks.v1',
          exportedAt: now.toISOString(),
          version: EXTENSION_VERSION,
          data: forks,
        };
        const forksFileName = this.getFileNameForScope(FORKS_FILE_NAME, accountScope);
        const forksFileId = await this.ensureFileId(token, forksFileName, 'forks');
        await this.uploadFileWithRetry(token, forksFileId, forksPayload);
        console.log('[GoogleDriveSyncService] Fork nodes uploaded successfully');
      }

      // Upload timeline hierarchy file (only for Gemini platform)
      if (platform === 'gemini' && timelineHierarchy) {
        const timelineHierarchyScope = timelineHierarchyAccountScope ?? accountScope;
        const timelineHierarchyPayload: TimelineHierarchyExportPayload = {
          format: 'gemini-voyager.timeline-hierarchy.v1',
          exportedAt: now.toISOString(),
          version: EXTENSION_VERSION,
          data: timelineHierarchy,
        };
        const timelineHierarchyFileName = this.getFileNameForScope(
          TIMELINE_HIERARCHY_FILE_NAME,
          timelineHierarchyScope,
        );
        const timelineHierarchyFileId = await this.ensureFileId(
          token,
          timelineHierarchyFileName,
          'timeline-hierarchy',
        );
        await this.uploadFileWithRetry(token, timelineHierarchyFileId, timelineHierarchyPayload);
        console.log('[GoogleDriveSyncService] Timeline hierarchy uploaded successfully');
      }

      const uploadTime = Date.now();
      // Update platform-specific upload time
      if (platform === 'aistudio') {
        this.updateState({ isSyncing: false, lastUploadTimeAIStudio: uploadTime, error: null });
      } else {
        this.updateState({ isSyncing: false, lastUploadTime: uploadTime, error: null });
      }
      await this.saveState();

      const fileCount =
        1 +
        (prompts.length > 0 ? 1 : 0) +
        (settingsPayload ? 1 : 0) +
        (pluginsPayload ? 1 : 0) +
        (platform === 'gemini' && starred ? 1 : 0) +
        (platform === 'gemini' && forks ? 1 : 0) +
        (platform === 'gemini' && timelineHierarchy ? 1 : 0);
      console.log(
        `[GoogleDriveSyncService] Upload successful - ${fileCount} file(s) for ${platform}`,
      );
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error('[GoogleDriveSyncService] Upload failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return false;
    }
  }

  /**
   * Upload ONLY the account-scoped prompts file, leaving folders / settings /
   * starred untouched. Used by the popup "cloud merge" buttons, which merge
   * cloud + local locally first and upload the union so both sides converge
   * without data loss.
   */
  async uploadPromptsOnly(
    prompts: PromptItem[],
    accountScope: SyncAccountScope | null = null,
    interactive: boolean = true,
  ): Promise<boolean> {
    try {
      this.updateState({ isSyncing: true, error: null });

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return false;
        }
        throw new Error('Not authenticated');
      }

      const promptPayload: PromptExportPayload = {
        format: 'gemini-voyager.prompts.v1',
        exportedAt: new Date().toISOString(),
        version: EXTENSION_VERSION,
        items: prompts,
      };
      const promptsFileName = this.getFileNameForScope(PROMPTS_FILE_NAME, accountScope);
      const promptsFileId = await this.ensureFileId(token, promptsFileName, 'prompts');
      await this.uploadFileWithRetry(token, promptsFileId, promptPayload);

      this.updateState({ isSyncing: false, error: null });
      await this.saveState();
      console.log('[GoogleDriveSyncService] Prompts-only upload successful');
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error('[GoogleDriveSyncService] Prompts-only upload failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return false;
    }
  }

  /**
   * Download ONLY the account-scoped prompts file. Returns the payload, or null
   * when no file exists or the user is not authenticated. The caller is
   * responsible for merging the result into local data.
   */
  async downloadPromptsOnly(
    accountScope: SyncAccountScope | null = null,
    interactive: boolean = true,
  ): Promise<PromptExportPayload | null> {
    try {
      this.updateState({ isSyncing: true, error: null });

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return null;
        }
        throw new Error('Not authenticated');
      }

      await this.migrateBackupFolderIfPresent(token);

      const promptsFileId = await this.findFileForScope(token, PROMPTS_FILE_NAME, accountScope);
      const prompts = promptsFileId
        ? await this.downloadFileWithRetry<PromptExportPayload>(token, promptsFileId)
        : null;

      this.updateState({ isSyncing: false, error: null });
      return prompts;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('[GoogleDriveSyncService] Prompts-only download failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return null;
    }
  }

  /**
   * Upload only the account-scoped highlight payload. Highlights intentionally
   * live in their own file and are never added to the legacy SyncData aggregate.
   *
   * This primitive is last-write-wins. Drive v3's documented media-update API
   * does not expose a reliable compare-and-swap revision contract here, so
   * callers must download/merge before uploading when concurrent edits matter.
   */
  async uploadHighlightsOnly(
    payload: HighlightExportPayload,
    accountScope: SyncAccountScope,
    interactive: boolean = true,
  ): Promise<boolean> {
    try {
      this.updateState({ isSyncing: true, error: null });
      this.assertHighlightPayloadForScope(payload, accountScope);

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return false;
        }
        throw new Error('Not authenticated');
      }

      const fileName = this.getFileNameForScope(HIGHLIGHTS_FILE_NAME, accountScope);
      const fileId = await this.ensureFileId(token, fileName, 'highlights');
      // Upload the canonical payload verbatim. In particular, quote.exact must
      // never be shortened as the exact text is required for anchor recovery.
      await this.uploadFileWithRetry(token, fileId, payload);

      this.updateState({ isSyncing: false, error: null });
      await this.saveState();
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      console.error('[GoogleDriveSyncService] Highlights-only upload failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return false;
    }
  }

  /**
   * Download only the exact account-scoped highlight file. Unlike older sync
   * payloads, there is deliberately no fallback to an unscoped legacy file:
   * highlights have been account-isolated since their first Drive format.
   */
  async downloadHighlightsOnly(
    accountScope: SyncAccountScope,
    interactive: boolean = true,
  ): Promise<HighlightExportPayload | null> {
    try {
      this.updateState({ isSyncing: true, error: null });

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return null;
        }
        throw new Error('Not authenticated');
      }

      await this.migrateBackupFolderIfPresent(token);

      const fileName = this.getFileNameForScope(HIGHLIGHTS_FILE_NAME, accountScope);
      const fileId = await this.findFile(token, fileName);
      if (!fileId) {
        this.updateState({ isSyncing: false, error: null });
        return null;
      }

      const downloaded = await this.downloadFileWithRetry<unknown>(token, fileId);
      if (downloaded === null) {
        this.updateState({ isSyncing: false, error: null });
        return null;
      }
      this.assertHighlightPayloadForScope(downloaded, accountScope);
      this.updateState({ isSyncing: false, error: null });
      return downloaded;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('[GoogleDriveSyncService] Highlights-only download failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return null;
    }
  }

  /**
   * Download folders, prompts, and timeline data from separate files in Google Drive
   * Returns all available payloads or null if no files exist
   * @param interactive Whether to show auth prompt if needed
   * @param platform Platform to download for ('gemini' | 'aistudio')
   */
  async download(
    interactive: boolean = true,
    platform: SyncPlatform = 'gemini',
    accountScope: SyncAccountScope | null = null,
    timelineHierarchyAccountScope: SyncAccountScope | null = null,
  ): Promise<{
    folders: FolderExportPayload | null;
    prompts: PromptExportPayload | null;
    settings: SettingsExportPayload | null;
    plugins: PluginStateExportPayload | null;
    starred: StarredExportPayload | null;
    forks: ForkExportPayload | null;
    timelineHierarchy: TimelineHierarchyExportPayload | null;
  } | null> {
    try {
      this.updateState({ isSyncing: true, error: null });

      const token = await this.getAuthToken(interactive);
      if (!token) {
        if (!interactive) {
          console.log(
            '[GoogleDriveSyncService] Download skipped: Not authenticated (non-interactive)',
          );
          this.updateState({ isSyncing: false, isAuthenticated: false });
          return null;
        }
        throw new Error('Not authenticated');
      }

      await this.migrateBackupFolderIfPresent(token);

      // Download folders file (platform-specific)
      const foldersBaseFileName =
        platform === 'aistudio' ? AISTUDIO_FOLDERS_FILE_NAME : FOLDERS_FILE_NAME;
      const foldersFileId = await this.findFileForScope(token, foldersBaseFileName, accountScope);
      let folders: FolderExportPayload | null = null;
      if (foldersFileId) {
        folders = await this.downloadFileWithRetry(token, foldersFileId);
        console.log(`[GoogleDriveSyncService] ${platform} folders downloaded`);
      }

      // Download prompts file (shared between Gemini and AI Studio)
      let prompts: PromptExportPayload | null = null;
      const promptsFileId = await this.findFileForScope(token, PROMPTS_FILE_NAME, accountScope);
      if (promptsFileId) {
        prompts = await this.downloadFileWithRetry(token, promptsFileId);
        console.log('[GoogleDriveSyncService] Prompts downloaded');
      }

      let settings: SettingsExportPayload | null = null;
      const settingsFileId = await this.findFile(token, SETTINGS_FILE_NAME);
      if (settingsFileId) {
        settings = await this.downloadFileWithRetry(token, settingsFileId);
        console.log('[GoogleDriveSyncService] Settings downloaded');
      }

      let plugins: PluginStateExportPayload | null = null;
      const pluginsFileId = await this.findFile(token, PLUGINS_FILE_NAME);
      if (pluginsFileId) {
        plugins = await this.downloadFileWithRetry(token, pluginsFileId);
      }

      // Download starred messages file (only for Gemini platform)
      let starred: StarredExportPayload | null = null;
      if (platform === 'gemini') {
        const starredFileId = await this.findFileForScope(token, STARRED_FILE_NAME, accountScope);
        if (starredFileId) {
          starred = await this.downloadFileWithRetry(token, starredFileId);
          console.log('[GoogleDriveSyncService] Starred messages downloaded');
        }
      }

      // Download fork nodes file (only for Gemini platform)
      let forks: ForkExportPayload | null = null;
      if (platform === 'gemini') {
        const forksFileId = await this.findFileForScope(token, FORKS_FILE_NAME, accountScope);
        if (forksFileId) {
          forks = await this.downloadFileWithRetry(token, forksFileId);
          console.log('[GoogleDriveSyncService] Fork nodes downloaded');
        }
      }

      // Download timeline hierarchy file (only for Gemini platform)
      let timelineHierarchy: TimelineHierarchyExportPayload | null = null;
      if (platform === 'gemini') {
        const timelineHierarchyScope = timelineHierarchyAccountScope ?? accountScope;
        const timelineHierarchyFileId = await this.findFileForScope(
          token,
          TIMELINE_HIERARCHY_FILE_NAME,
          timelineHierarchyScope,
        );
        if (timelineHierarchyFileId) {
          timelineHierarchy = await this.downloadFileWithRetry(token, timelineHierarchyFileId);
          console.log('[GoogleDriveSyncService] Timeline hierarchy downloaded');
        }
      }

      if (
        !folders &&
        !prompts &&
        !settings &&
        !plugins &&
        !starred &&
        !forks &&
        !timelineHierarchy
      ) {
        console.log(`[GoogleDriveSyncService] No sync files found for ${platform}`);
        this.updateState({ isSyncing: false });
        return null;
      }

      const syncTime = Date.now();
      // Update platform-specific sync time
      if (platform === 'aistudio') {
        this.updateState({ isSyncing: false, lastSyncTimeAIStudio: syncTime, error: null });
      } else {
        this.updateState({ isSyncing: false, lastSyncTime: syncTime, error: null });
      }
      await this.saveState();

      return { folders, prompts, settings, plugins, starred, forks, timelineHierarchy };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('[GoogleDriveSyncService] Download failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return null;
    }
  }

  // ============== Private Methods ==============

  private async loadCachedToken(): Promise<void> {
    if (isSafariRuntime()) return;

    try {
      const result = await chrome.storage.local.get(['gvAccessToken', 'gvTokenExpiry']);
      const cachedAccessToken = getStringValue(result.gvAccessToken);
      const cachedTokenExpiry = getNumberValue(result.gvTokenExpiry);
      if (cachedAccessToken && cachedTokenExpiry && cachedTokenExpiry > Date.now()) {
        this.accessToken = cachedAccessToken;
        this.tokenExpiry = cachedTokenExpiry;
        console.log('[GoogleDriveSyncService] Loaded cached token');
      }
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to load cached token:', error);
    }
  }

  private async saveToken(token: string, expiresIn: number): Promise<void> {
    this.accessToken = token;
    this.tokenExpiry = Date.now() + expiresIn * 1000 - 60000;
    if (isSafariRuntime()) return;

    try {
      await chrome.storage.local.set({ gvAccessToken: token, gvTokenExpiry: this.tokenExpiry });
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to save token:', error);
    }
  }

  private async clearToken(): Promise<void> {
    this.accessToken = null;
    this.tokenExpiry = 0;
    try {
      await chrome.storage.local.remove(['gvAccessToken', 'gvTokenExpiry']);
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to clear token:', error);
    }
  }

  private isUserDeniedAuthError(message: string): boolean {
    const normalized = message.toLowerCase();
    return (
      normalized.includes('did not approve access') ||
      normalized.includes('user denied') ||
      normalized.includes('access_denied')
    );
  }

  private extractIdentityToken(result: unknown): string | null {
    if (typeof result === 'string' && result.trim()) {
      return result;
    }

    if (typeof result === 'object' && result !== null) {
      const token = (result as { token?: unknown }).token;
      if (typeof token === 'string' && token.trim()) {
        return token;
      }
    }

    return null;
  }

  private async requestIdentityAuthToken(
    interactive: boolean,
  ): Promise<{ token: string | null; userDenied: boolean }> {
    const identity = chrome.identity;
    if (!identity?.getAuthToken) {
      return { token: null, userDenied: false };
    }

    try {
      const tokenResult = await new Promise<unknown>((resolve, reject) => {
        identity.getAuthToken({ interactive }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });

      const token = this.extractIdentityToken(tokenResult);
      if (!token) {
        return { token: null, userDenied: false };
      }

      // getAuthToken does not provide expiry; keep a short TTL and persist for worker restarts.
      await this.saveToken(token, IDENTITY_TOKEN_TTL_SECONDS);
      return { token, userDenied: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const userDenied = this.isUserDeniedAuthError(message);
      if (!userDenied) {
        console.warn('[GoogleDriveSyncService] identity.getAuthToken failed:', error);
      }
      return { token: null, userDenied };
    }
  }

  private async getTokenFromIdentity(
    interactive: boolean,
  ): Promise<{ token: string | null; userDenied: boolean }> {
    if (!chrome.identity?.getAuthToken) {
      return { token: null, userDenied: false };
    }

    const nonInteractiveResult = await this.requestIdentityAuthToken(false);
    if (nonInteractiveResult.token) {
      return nonInteractiveResult;
    }

    if (!interactive) {
      return { token: null, userDenied: false };
    }

    return this.requestIdentityAuthToken(true);
  }

  private async removeCachedAuthToken(token: string): Promise<void> {
    const identity = chrome.identity;
    if (!identity?.removeCachedAuthToken) {
      return;
    }

    await new Promise<void>((resolve) => {
      identity.removeCachedAuthToken({ token }, () => resolve());
    });
  }

  private async getTokenFromLegacyWebAuthFlow(): Promise<string | null> {
    const manifest = chrome.runtime.getManifest();
    const clientId = manifest.oauth2?.client_id;
    const scopes = manifest.oauth2?.scopes?.join(' ');

    if (!clientId || !scopes) {
      console.error('[GoogleDriveSyncService] Missing oauth2 config');
      return null;
    }

    const redirectUrl = chrome.identity.getRedirectURL();
    console.log('[GoogleDriveSyncService] Auth flow starting with redirectUrl:', redirectUrl);
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUrl);
    authUrl.searchParams.set('response_type', 'token');
    authUrl.searchParams.set('scope', scopes);

    try {
      const responseUrl = await new Promise<string>((resolve, reject) => {
        chrome.identity.launchWebAuthFlow(
          { url: authUrl.toString(), interactive: true },
          (response) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else if (response) {
              resolve(response);
            } else {
              reject(new Error('No response from auth flow'));
            }
          },
        );
      });

      const url = new URL(responseUrl);
      const hashParams = new URLSearchParams(url.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const expiresIn = parseInt(hashParams.get('expires_in') || '3600', 10);

      if (accessToken) {
        await this.saveToken(accessToken, expiresIn);
        return accessToken;
      }
      return null;
    } catch (error) {
      console.error('[GoogleDriveSyncService] Auth flow failed:', error);
      return null;
    }
  }

  private async getAuthToken(interactive: boolean): Promise<string | null> {
    if (this.state.provider === 'icloud') {
      await checkSafariICloudAccount();
      return 'icloud';
    }

    if (isSafariRuntime()) {
      const nativeSession = await requestSafariGoogleDriveSession(interactive);
      if (nativeSession.signedIn) {
        return 'safari-native';
      }
      if (nativeSession.requiresAppLaunch) {
        throw new Error('Open Voyager to connect Google Drive, then try again.');
      }
      return null;
    }

    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    if (this.accessToken && this.tokenExpiry <= Date.now()) {
      this.accessToken = null;
      this.tokenExpiry = 0;
    }

    await this.loadCachedToken();
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }

    // Brave supports the identity API but chrome.identity.getAuthToken shows
    // an "Access blocked" error popup before failing, causing user confusion.
    // Skip it entirely on Brave and go directly to launchWebAuthFlow.
    const supportsIdentityApi = !!chrome.identity?.getAuthToken && !isBrave();
    if (supportsIdentityApi) {
      const identityResult = await this.getTokenFromIdentity(interactive);
      if (identityResult.token) {
        return identityResult.token;
      }

      if (!interactive) {
        return null;
      }

      // Fallback: always try launchWebAuthFlow when getAuthToken fails.
      // Some browsers (Arc) or Chrome versions may show an OAuth error page
      // during getAuthToken, which looks like "user denied" when dismissed,
      // but launchWebAuthFlow with a registered redirect URI can still succeed.
      return this.getTokenFromLegacyWebAuthFlow();
    }

    if (!interactive) {
      return null;
    }

    return this.getTokenFromLegacyWebAuthFlow();
  }

  private async findFile(token: string, fileName: string): Promise<string | null> {
    if (this.state.provider === 'icloud') {
      return fileName;
    }

    if (isSafariRuntime()) {
      return findSafariGoogleDriveFile(fileName);
    }

    if (this.backupFolderId) {
      const folderFileId = await this.searchDriveFile(token, fileName, this.backupFolderId);
      if (folderFileId) return folderFileId;
    }

    // Backward compatibility: files created by older versions may still live
    // outside the resolved folder. Uploads move this fallback result into the
    // stable folder; downloads can still recover it before that happens.
    return this.searchDriveFile(token, fileName, null);
  }

  private async searchDriveFile(
    token: string,
    fileName: string,
    parentId: string | null,
  ): Promise<string | null> {
    const parentClause = parentId
      ? ` and '${this.escapeDriveQueryValue(parentId)}' in parents`
      : '';
    const query = encodeURIComponent(
      `name='${this.escapeDriveQueryValue(fileName)}' and trashed=false${parentClause}`,
    );
    const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Failed to search files: ${response.status}`);
    }
    const result = await response.json();
    return result.files?.[0]?.id || null;
  }

  private getFileNameForScope(baseFileName: string, accountScope: SyncAccountScope | null): string {
    if (!accountScope) return baseFileName;

    const suffix = `acct-${hashString(accountScope.accountKey)}`;
    const dotIndex = baseFileName.lastIndexOf('.');
    if (dotIndex <= 0) {
      return `${baseFileName}.${suffix}`;
    }
    return `${baseFileName.slice(0, dotIndex)}.${suffix}${baseFileName.slice(dotIndex)}`;
  }

  private assertHighlightPayloadForScope(
    value: unknown,
    accountScope: SyncAccountScope,
  ): asserts value is HighlightExportPayload {
    if (!isHighlightExportPayloadV1(value)) {
      throw new Error('Invalid highlight sync payload');
    }

    const expectedAccountHash = hashString(accountScope.accountKey);
    if (
      value.accountScope.accountHash !== expectedAccountHash ||
      value.items.some(
        (item) =>
          item.accountHash !== expectedAccountHash || item.platform !== value.accountScope.platform,
      )
    ) {
      throw new Error('Highlight sync payload does not match the requested account scope');
    }
  }

  private async findFileForScope(
    token: string,
    baseFileName: string,
    accountScope: SyncAccountScope | null,
  ): Promise<string | null> {
    if (!accountScope) {
      return this.findFile(token, baseFileName);
    }

    const scopedFileName = this.getFileNameForScope(baseFileName, accountScope);
    const scopedFileId = await this.findFile(token, scopedFileName);
    if (scopedFileId) return scopedFileId;

    // Backward compatibility: allow reading legacy shared file before user uploads scoped data.
    return this.findFile(token, baseFileName);
  }

  private async ensureFileId(
    token: string,
    fileName: string,
    type:
      | 'folders'
      | 'aistudio-folders'
      | 'prompts'
      | 'settings'
      | 'plugins'
      | 'starred'
      | 'forks'
      | 'timeline-hierarchy'
      | 'highlights',
  ): Promise<string> {
    if (this.state.provider === 'icloud') {
      return fileName;
    }

    if (isSafariRuntime()) {
      const fileId = await ensureSafariGoogleDriveFile(
        fileName,
        this.fileIdByName[fileName] ?? null,
      );
      this.setFileIdForType(type, fileId);
      this.fileIdByName[fileName] = fileId;
      return fileId;
    }

    // 1. Ensure backup folder exists
    const folderId = await this.ensureBackupFolder(token);

    // 2. Check if we have a valid cached file ID
    const currentId = this.fileIdByName[fileName] ?? null;

    if (currentId) {
      const parents = await this.getFileParents(token, currentId);
      if (parents) {
        // File exists
        if (!parents.includes(folderId)) {
          // File exists but not in the backup folder, move it
          console.log(`[GoogleDriveSyncService] Moving ${fileName} to backup folder`);
          await this.moveFile(token, currentId, folderId, parents);
        }
        return currentId;
      }
      // If checkFileParents returns null, the file doesn't exist (e.g. deleted externally), proceed to find/create
    }

    // 3. Search for the file globally (in case it was created before but we lost the ID reference)
    const existingId = await this.findFile(token, fileName);
    if (existingId) {
      // Found existing file
      this.setFileIdForType(type, existingId);
      this.fileIdByName[fileName] = existingId;

      // Check if it needs moving
      const parents = await this.getFileParents(token, existingId);
      if (parents && !parents.includes(folderId)) {
        console.log(`[GoogleDriveSyncService] Moving existing ${fileName} to backup folder`);
        await this.moveFile(token, existingId, folderId, parents);
      }
      return existingId;
    }

    // 4. Create new file in the backup folder
    console.log(`[GoogleDriveSyncService] Creating new file ${fileName} in backup folder`);
    const newId = await this.createFile(token, fileName, folderId);
    this.setFileIdForType(type, newId);
    this.fileIdByName[fileName] = newId;
    return newId;
  }

  private setFileIdForType(
    type:
      | 'folders'
      | 'aistudio-folders'
      | 'prompts'
      | 'settings'
      | 'plugins'
      | 'starred'
      | 'forks'
      | 'timeline-hierarchy'
      | 'highlights',
    fileId: string,
  ): void {
    switch (type) {
      case 'folders':
        this.foldersFileId = fileId;
        break;
      case 'aistudio-folders':
        this.aistudioFoldersFileId = fileId;
        break;
      case 'prompts':
        this.promptsFileId = fileId;
        break;
      case 'settings':
        this.settingsFileId = fileId;
        break;
      case 'plugins':
        this.pluginsFileId = fileId;
        break;
      case 'starred':
        this.starredFileId = fileId;
        break;
      case 'forks':
        this.forksFileId = fileId;
        break;
      case 'timeline-hierarchy':
        this.timelineHierarchyFileId = fileId;
        break;
      case 'highlights':
        this.highlightsFileId = fileId;
        break;
    }
  }

  private async ensureBackupFolder(token: string): Promise<string> {
    const folderId = await this.resolveBackupFolder(token, true);
    if (!folderId) throw new Error('Failed to create backup folder');
    return folderId;
  }

  /**
   * Resolve the app-owned Drive folder without relying on its display name.
   *
   * Resolution order is deliberately conservative:
   * 1. A folder carrying Voyager's private appProperties marker.
   * 2. The folder containing the largest set of known Voyager sync files.
   * 3. A folder with the canonical or legacy display name.
   *
   * The legacy folder is renamed in place only when no canonical-name conflict
   * exists. We never delete or merge ambiguous folders automatically.
   */
  private async resolveBackupFolder(
    token: string,
    createIfMissing: boolean,
  ): Promise<string | null> {
    if (this.backupFolderResolutionPromise) {
      const activeResult = await this.backupFolderResolutionPromise;
      if (activeResult || !createIfMissing) return activeResult;
    }

    const resolution = this.resolveBackupFolderUncached(token, createIfMissing);
    this.backupFolderResolutionPromise = resolution;
    try {
      return await resolution;
    } finally {
      if (this.backupFolderResolutionPromise === resolution) {
        this.backupFolderResolutionPromise = null;
      }
    }
  }

  private async resolveBackupFolderUncached(
    token: string,
    createIfMissing: boolean,
  ): Promise<string | null> {
    if (this.backupFolderId) {
      const cachedFolder = await this.getDriveFolderMetadata(token, this.backupFolderId);
      if (cachedFolder) return cachedFolder.id;
      this.backupFolderId = null;
    }

    const [markedFolders, namedFolders, syncFileParentScores] = await Promise.all([
      this.listDriveFolders(
        token,
        `appProperties has { key='${BACKUP_FOLDER_MARKER_KEY}' and value='${BACKUP_FOLDER_MARKER_VALUE}' }`,
      ),
      this.listDriveFolders(
        token,
        `(name='${this.escapeDriveQueryValue(BACKUP_FOLDER_NAME)}' or name='${this.escapeDriveQueryValue(LEGACY_BACKUP_FOLDER_NAME)}')`,
      ),
      this.getSyncFileParentScores(token).catch((error) => {
        // Content-parent recovery is only a fallback for folders renamed before
        // this marker existed. A transient failure here must not block normal
        // name/marker discovery or create a duplicate folder.
        console.warn('[GoogleDriveSyncService] Could not inspect sync-file parents:', error);
        return new Map<string, number>();
      }),
    ]);

    const candidatesById = new Map<string, DriveFolderMetadata>();
    [...markedFolders, ...namedFolders].forEach((folder) => candidatesById.set(folder.id, folder));

    const recoveredParentIds = [...syncFileParentScores.entries()]
      .sort(([, leftScore], [, rightScore]) => rightScore - leftScore)
      .slice(0, 5)
      .map(([parentId]) => parentId)
      .filter((parentId) => !candidatesById.has(parentId));

    const recoveredFolders = await Promise.all(
      recoveredParentIds.map((parentId) => this.getDriveFolderMetadata(token, parentId)),
    );
    recoveredFolders.forEach((folder) => {
      if (folder) candidatesById.set(folder.id, folder);
    });

    const candidates = [...candidatesById.values()];
    const selected = this.selectBackupFolderCandidate(candidates, syncFileParentScores);
    if (selected) {
      const hasCanonicalConflict = candidates.some(
        (folder) => folder.id !== selected.id && folder.name === BACKUP_FOLDER_NAME,
      );
      const prepared = await this.prepareBackupFolder(
        token,
        selected,
        selected.name === LEGACY_BACKUP_FOLDER_NAME && !hasCanonicalConflict,
      );
      this.backupFolderId = prepared.id;
      return prepared.id;
    }

    if (!createIfMissing) return null;

    const metadata = {
      name: BACKUP_FOLDER_NAME,
      mimeType: BACKUP_FOLDER_MIME_TYPE,
      appProperties: {
        [BACKUP_FOLDER_MARKER_KEY]: BACKUP_FOLDER_MARKER_VALUE,
      },
    };
    const createResponse = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });

    if (!createResponse.ok) throw new Error('Failed to create backup folder');
    const folderData = (await createResponse.json()) as { id?: unknown };
    if (typeof folderData.id !== 'string' || !folderData.id) {
      throw new Error('Drive returned an invalid backup folder');
    }
    this.backupFolderId = folderData.id;
    console.log('[GoogleDriveSyncService] Created backup folder:', this.backupFolderId);
    return folderData.id;
  }

  private async migrateBackupFolderIfPresent(token: string): Promise<void> {
    if (this.state.provider === 'icloud' || isSafariRuntime()) return;

    try {
      await this.resolveBackupFolder(token, false);
    } catch (error) {
      // Folder metadata migration must never block a read-only download. Any
      // subsequent upload will retry the same migration before writing files.
      console.warn('[GoogleDriveSyncService] Backup folder migration deferred:', error);
    }
  }

  private async listDriveFolders(
    token: string,
    identityClause: string,
  ): Promise<DriveFolderMetadata[]> {
    const query = `${identityClause} and mimeType='${BACKUP_FOLDER_MIME_TYPE}' and trashed=false`;
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'files(id,name,mimeType,parents,appProperties,trashed)');
    url.searchParams.set('pageSize', '100');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to search for backup folder');
    const data = (await response.json()) as { files?: unknown };
    return this.parseDriveFolders(data.files);
  }

  private async getSyncFileParentScores(token: string): Promise<Map<string, number>> {
    const nameClauses = BACKUP_FOLDER_RECOVERY_FILE_NAMES.map(
      (name) => `name='${this.escapeDriveQueryValue(name)}'`,
    );
    const query = `(${nameClauses.join(' or ')}) and trashed=false`;
    const url = new URL(`${DRIVE_API_BASE}/files`);
    url.searchParams.set('q', query);
    url.searchParams.set('fields', 'files(id,name,parents)');
    url.searchParams.set('pageSize', '1000');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to inspect backup files');
    const data = (await response.json()) as { files?: unknown };
    const files = Array.isArray(data.files)
      ? data.files.filter((file): file is DriveSyncFileMetadata =>
          this.isDriveSyncFileMetadata(file),
        )
      : [];
    const namesByParent = new Map<string, Set<string>>();
    files.forEach((file) => {
      file.parents?.forEach((parentId) => {
        const names = namesByParent.get(parentId) ?? new Set<string>();
        names.add(file.name);
        namesByParent.set(parentId, names);
      });
    });
    return new Map([...namesByParent.entries()].map(([parentId, names]) => [parentId, names.size]));
  }

  private selectBackupFolderCandidate(
    candidates: DriveFolderMetadata[],
    syncFileParentScores: Map<string, number>,
  ): DriveFolderMetadata | null {
    const rank = (folder: DriveFolderMetadata): [number, number, number, string] => [
      folder.appProperties?.[BACKUP_FOLDER_MARKER_KEY] === BACKUP_FOLDER_MARKER_VALUE ? 1 : 0,
      syncFileParentScores.get(folder.id) ?? 0,
      folder.name === BACKUP_FOLDER_NAME ? 2 : folder.name === LEGACY_BACKUP_FOLDER_NAME ? 1 : 0,
      folder.id,
    ];

    return (
      [...candidates].sort((left, right) => {
        const leftRank = rank(left);
        const rightRank = rank(right);
        return (
          rightRank[0] - leftRank[0] ||
          rightRank[1] - leftRank[1] ||
          rightRank[2] - leftRank[2] ||
          leftRank[3].localeCompare(rightRank[3])
        );
      })[0] ?? null
    );
  }

  private async prepareBackupFolder(
    token: string,
    folder: DriveFolderMetadata,
    renameLegacyFolder: boolean,
  ): Promise<DriveFolderMetadata> {
    const needsMarker =
      folder.appProperties?.[BACKUP_FOLDER_MARKER_KEY] !== BACKUP_FOLDER_MARKER_VALUE;
    if (!needsMarker && !renameLegacyFolder) return folder;

    const metadata: {
      name?: string;
      appProperties?: Record<string, string>;
    } = {};
    if (renameLegacyFolder) metadata.name = BACKUP_FOLDER_NAME;
    if (needsMarker) {
      metadata.appProperties = {
        ...folder.appProperties,
        [BACKUP_FOLDER_MARKER_KEY]: BACKUP_FOLDER_MARKER_VALUE,
      };
    }

    const url = new URL(`${DRIVE_API_BASE}/files/${folder.id}`);
    url.searchParams.set('fields', 'id,name,mimeType,parents,appProperties,trashed');
    const response = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(metadata),
    });
    if (!response.ok) {
      console.warn(
        '[GoogleDriveSyncService] Could not rename or mark the existing backup folder; continuing with its stable Drive ID',
      );
      return folder;
    }

    const updated = (await response.json()) as unknown;
    return this.isDriveFolderMetadata(updated)
      ? updated
      : {
          ...folder,
          ...metadata,
        };
  }

  private async getDriveFolderMetadata(
    token: string,
    folderId: string,
  ): Promise<DriveFolderMetadata | null> {
    const url = new URL(`${DRIVE_API_BASE}/files/${folderId}`);
    url.searchParams.set('fields', 'id,name,mimeType,parents,appProperties,trashed');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`Failed to inspect backup folder: ${response.status}`);
    const data = (await response.json()) as unknown;
    if (!this.isDriveFolderMetadata(data) || data.trashed) return null;
    if (data.mimeType && data.mimeType !== BACKUP_FOLDER_MIME_TYPE) return null;
    return data;
  }

  private parseDriveFolders(value: unknown): DriveFolderMetadata[] {
    return Array.isArray(value)
      ? value.filter(
          (folder): folder is DriveFolderMetadata =>
            this.isDriveFolderMetadata(folder) && !folder.trashed,
        )
      : [];
  }

  private isDriveFolderMetadata(value: unknown): value is DriveFolderMetadata {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<DriveFolderMetadata>;
    return typeof candidate.id === 'string' && typeof candidate.name === 'string';
  }

  private isDriveSyncFileMetadata(value: unknown): value is DriveSyncFileMetadata {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = value as Partial<DriveSyncFileMetadata>;
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.name === 'string' &&
      (candidate.parents === undefined ||
        (Array.isArray(candidate.parents) &&
          candidate.parents.every((parent) => typeof parent === 'string')))
    );
  }

  private escapeDriveQueryValue(value: string): string {
    return value.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
  }

  private async getFileParents(token: string, fileId: string): Promise<string[] | null> {
    try {
      // Also check if file is trashed - if so, treat as non-existent
      const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=parents,trashed`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.status === 404) return null;
      if (!response.ok) return null;
      const data = await response.json();
      // If file is in trash, treat as non-existent so we create a new one
      if (data.trashed) {
        console.log(`[GoogleDriveSyncService] File ${fileId} is in trash, will create new one`);
        return null;
      }
      return data.parents || [];
    } catch {
      return null;
    }
  }

  private async moveFile(
    token: string,
    fileId: string,
    targetFolderId: string,
    currentParents: string[],
  ): Promise<void> {
    const previousParents = currentParents.join(',');
    const url = `${DRIVE_API_BASE}/files/${fileId}?addParents=${targetFolderId}&removeParents=${previousParents}&fields=id,parents`;
    const response = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      console.error('[GoogleDriveSyncService] Failed to move file:', await response.text());
      // Don't throw, just log. It's not critical if move fails, as long as we can access the file.
    }
  }

  private async checkFileExists(token: string, fileId: string): Promise<boolean> {
    try {
      const response = await fetch(`${DRIVE_API_BASE}/files/${fileId}?fields=id`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async createFile(token: string, fileName: string, parentId?: string): Promise<string> {
    const metadata: { name: string; mimeType: string; parents?: string[] } = {
      name: fileName,
      mimeType: 'application/json',
    };
    if (parentId) {
      metadata.parents = [parentId];
    }

    const response = await fetch(`${DRIVE_API_BASE}/files`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    if (!response.ok) {
      throw new Error(`Failed to create file: ${response.status}`);
    }
    const result = await response.json();
    return result.id;
  }

  private async uploadFileWithRetry(token: string, fileId: string, data: unknown): Promise<void> {
    let delay = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (this.state.provider === 'icloud') {
          await writeSafariICloudFile(fileId, data);
          return;
        }

        if (isSafariRuntime()) {
          await uploadSafariGoogleDriveFile(fileId, data);
          return;
        }

        const url = `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media`;
        const response = await fetch(url, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) {
          throw new Error(`Upload failed: ${response.status}`);
        }
        return;
      } catch (error) {
        if (isSafariICloudConflictError(error)) throw error;
        if (this.markAuthLostIfNeeded(error)) throw error;
        if (attempt === MAX_RETRIES) throw error;
        await this.sleep(
          Math.max(
            delay,
            getSafariICloudRetryDelay(error) ?? 0,
            getSafariGoogleDriveRetryDelay(error) ?? 0,
          ),
        );
        delay *= 2;
      }
    }
  }

  private async downloadFileWithRetry<T>(token: string, fileId: string): Promise<T | null> {
    let delay = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (this.state.provider === 'icloud') {
          return await readSafariICloudFile<T>(fileId);
        }

        if (isSafariRuntime()) {
          return await downloadSafariGoogleDriveFile<T>(fileId);
        }

        const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`Download failed: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (this.markAuthLostIfNeeded(error)) throw error;
        if (attempt === MAX_RETRIES) throw error;
        await this.sleep(Math.max(delay, getSafariGoogleDriveRetryDelay(error) ?? 0));
        delay *= 2;
      }
    }
    return null;
  }

  /**
   * Safari native bridge signals a permanently revoked/expired Google session
   * with a structured code; retrying it is pointless, so surface it at once
   * and flip the authenticated flag so the UI offers reconnecting.
   */
  private markAuthLostIfNeeded(error: unknown): boolean {
    if (!isSafariGoogleDriveAuthError(error)) return false;
    this.updateState({ isAuthenticated: false });
    return true;
  }

  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        'gvSyncMode',
        'gvSyncProvider',
        'gvLastSyncTime',
        'gvLastUploadTime',
        'gvLastSyncTimeAIStudio',
        'gvLastUploadTimeAIStudio',
        'gvSyncError',
      ]);
      this.state = {
        provider:
          result.gvSyncProvider === 'icloud' && isSafariRuntime() ? 'icloud' : 'googleDrive',
        mode: (result.gvSyncMode as SyncMode) || 'disabled',
        lastSyncTime: getNumberValue(result.gvLastSyncTime),
        lastUploadTime: getNumberValue(result.gvLastUploadTime),
        lastSyncTimeAIStudio: getNumberValue(result.gvLastSyncTimeAIStudio),
        lastUploadTimeAIStudio: getNumberValue(result.gvLastUploadTimeAIStudio),
        error: getStringValue(result.gvSyncError),
        isSyncing: false,
        isAuthenticated: false,
      };
      if (this.state.mode !== 'disabled') {
        const token = await this.getAuthToken(false);
        this.state.isAuthenticated = !!token;
      }
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to load state:', error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        gvSyncMode: this.state.mode,
        gvSyncProvider: this.state.provider,
        gvLastSyncTime: this.state.lastSyncTime,
        gvLastUploadTime: this.state.lastUploadTime,
        gvLastSyncTimeAIStudio: this.state.lastSyncTimeAIStudio,
        gvLastUploadTimeAIStudio: this.state.lastUploadTimeAIStudio,
        gvSyncError: this.state.error,
      });
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to save state:', error);
    }
  }

  private updateState(partial: Partial<SyncState>): void {
    this.state = { ...this.state, ...partial };
    this.notifyStateChange();
  }

  private notifyStateChange(): void {
    if (this.stateChangeCallback) {
      this.stateChangeCallback({ ...this.state });
    }
  }

  private resetDriveFileCache(): void {
    this.foldersFileId = null;
    this.aistudioFoldersFileId = null;
    this.promptsFileId = null;
    this.settingsFileId = null;
    this.pluginsFileId = null;
    this.starredFileId = null;
    this.forksFileId = null;
    this.timelineHierarchyFileId = null;
    this.highlightsFileId = null;
    this.backupFolderId = null;
    this.backupFolderResolutionPromise = null;
    this.fileIdByName = {};
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const googleDriveSyncService = new GoogleDriveSyncService();
