/**
 * Google Drive Sync Service
 *
 * Enterprise-grade service for syncing extension data to Google Drive
 * Uses Chrome Identity API for OAuth2 and Drive REST API v3 for storage
 *
 * Stores folders, prompts, and starred messages as separate files:
 * - gemini-voyager-folders.json
 * - gemini-voyager-prompts.json
 * - gemini-voyager-starred.json
 */
import type { FolderData } from '@/core/types/folder';
import type {
  FolderExportPayload,
  PromptExportPayload,
  PromptItem,
  StarredExportPayload,
  StarredMessagesDataSync,
  SyncMode,
  SyncPlatform,
  SyncState,
} from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';
import { EXTENSION_VERSION } from '@/core/utils/version';

const FOLDERS_FILE_NAME = 'gemini-voyager-folders.json';
const AISTUDIO_FOLDERS_FILE_NAME = 'gemini-voyager-aistudio-folders.json';
const PROMPTS_FILE_NAME = 'gemini-voyager-prompts.json';
const STARRED_FILE_NAME = 'gemini-voyager-starred.json';
const BACKUP_FOLDER_NAME = 'Gemini Voyager Data';
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_BASE = 'https://www.googleapis.com/upload/drive/v3';

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000;

/**
 * Google Drive Sync Service
 * Handles authentication, upload, and download of sync data as separate files
 */
export class GoogleDriveSyncService {
  private state: SyncState = { ...DEFAULT_SYNC_STATE };
  private foldersFileId: string | null = null;
  private aistudioFoldersFileId: string | null = null;
  private promptsFileId: string | null = null;
  private starredFileId: string | null = null;
  private backupFolderId: string | null = null;
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
    try {
      if (this.accessToken) {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${this.accessToken}`);
      }
    } catch (error) {
      console.warn('[GoogleDriveSyncService] Sign out warning:', error);
    }
    await this.clearToken();
    this.foldersFileId = null;
    this.promptsFileId = null;
    this.starredFileId = null;
    this.backupFolderId = null;
    this.updateState({ isAuthenticated: false, lastSyncTime: null, error: null });
    await this.saveState();
  }

  /**
   * Upload folders, prompts, and starred messages as separate files to Google Drive
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

      // Upload folders file (platform-specific)
      const foldersFileName =
        platform === 'aistudio' ? AISTUDIO_FOLDERS_FILE_NAME : FOLDERS_FILE_NAME;
      const foldersType = platform === 'aistudio' ? 'aistudio-folders' : 'folders';
      await this.ensureFileId(token, foldersFileName, foldersType);
      const foldersFileIdToUse =
        platform === 'aistudio' ? this.aistudioFoldersFileId! : this.foldersFileId!;
      await this.uploadFileWithRetry(token, foldersFileIdToUse, folderPayload);
      console.log(`[GoogleDriveSyncService] ${platform} folders uploaded successfully`);

      // Upload prompts file (shared between Gemini and AI Studio)
      if (prompts.length > 0) {
        await this.ensureFileId(token, PROMPTS_FILE_NAME, 'prompts');
        await this.uploadFileWithRetry(token, this.promptsFileId!, promptPayload);
        console.log('[GoogleDriveSyncService] Prompts uploaded successfully');
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
        await this.ensureFileId(token, STARRED_FILE_NAME, 'starred');
        await this.uploadFileWithRetry(token, this.starredFileId!, starredPayload);
        console.log('[GoogleDriveSyncService] Starred messages uploaded successfully');
      }

      const uploadTime = Date.now();
      // Update platform-specific upload time
      if (platform === 'aistudio') {
        this.updateState({ isSyncing: false, lastUploadTimeAIStudio: uploadTime, error: null });
      } else {
        this.updateState({ isSyncing: false, lastUploadTime: uploadTime, error: null });
      }
      await this.saveState();

      const fileCount = platform === 'gemini' ? (starred ? 3 : 2) : 1;
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
   * Download folders, prompts, and starred messages from separate files in Google Drive
   * Returns { folders, prompts, starred } or null if no files exist
   * @param interactive Whether to show auth prompt if needed
   * @param platform Platform to download for ('gemini' | 'aistudio')
   */
  async download(
    interactive: boolean = true,
    platform: SyncPlatform = 'gemini',
  ): Promise<{
    folders: FolderExportPayload | null;
    prompts: PromptExportPayload | null;
    starred: StarredExportPayload | null;
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

      // Download folders file (platform-specific)
      const foldersFileName =
        platform === 'aistudio' ? AISTUDIO_FOLDERS_FILE_NAME : FOLDERS_FILE_NAME;
      const foldersFileId = await this.findFile(token, foldersFileName);
      let folders: FolderExportPayload | null = null;
      if (foldersFileId) {
        folders = await this.downloadFileWithRetry(token, foldersFileId);
        console.log(`[GoogleDriveSyncService] ${platform} folders downloaded`);
      }

      // Download prompts file (shared between Gemini and AI Studio)
      let prompts: PromptExportPayload | null = null;
      const promptsFileId = await this.findFile(token, PROMPTS_FILE_NAME);
      if (promptsFileId) {
        prompts = await this.downloadFileWithRetry(token, promptsFileId);
        console.log('[GoogleDriveSyncService] Prompts downloaded');
      }

      // Download starred messages file (only for Gemini platform)
      let starred: StarredExportPayload | null = null;
      if (platform === 'gemini') {
        const starredFileId = await this.findFile(token, STARRED_FILE_NAME);
        if (starredFileId) {
          starred = await this.downloadFileWithRetry(token, starredFileId);
          console.log('[GoogleDriveSyncService] Starred messages downloaded');
        }
      }

      if (!folders && !prompts && !starred) {
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

      return { folders, prompts, starred };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('[GoogleDriveSyncService] Download failed:', error);
      this.updateState({ isSyncing: false, error: errorMessage });
      return null;
    }
  }

  // ============== Private Methods ==============

  private async loadCachedToken(): Promise<void> {
    try {
      const result = await chrome.storage.local.get(['gvAccessToken', 'gvTokenExpiry']);
      if (result.gvAccessToken && result.gvTokenExpiry && result.gvTokenExpiry > Date.now()) {
        this.accessToken = result.gvAccessToken;
        this.tokenExpiry = result.gvTokenExpiry;
        console.log('[GoogleDriveSyncService] Loaded cached token');
      }
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to load cached token:', error);
    }
  }

  private async saveToken(token: string, expiresIn: number): Promise<void> {
    this.accessToken = token;
    this.tokenExpiry = Date.now() + expiresIn * 1000 - 60000;
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

  private async getAuthToken(interactive: boolean): Promise<string | null> {
    if (!this.accessToken) {
      await this.loadCachedToken();
    }
    if (this.accessToken && this.tokenExpiry > Date.now()) {
      return this.accessToken;
    }
    if (!interactive) {
      return null;
    }

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

  private async findFile(token: string, fileName: string): Promise<string | null> {
    const query = encodeURIComponent(`name='${fileName}' and trashed=false`);
    const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id,name)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new Error(`Failed to search files: ${response.status}`);
    }
    const result = await response.json();
    return result.files?.[0]?.id || null;
  }

  private async ensureFileId(
    token: string,
    fileName: string,
    type: 'folders' | 'aistudio-folders' | 'prompts' | 'starred',
  ): Promise<void> {
    // 1. Ensure backup folder exists
    const folderId = await this.ensureBackupFolder(token);

    // 2. Check if we have a valid cached file ID
    const currentId =
      type === 'folders'
        ? this.foldersFileId
        : type === 'aistudio-folders'
          ? this.aistudioFoldersFileId
          : type === 'prompts'
            ? this.promptsFileId
            : this.starredFileId;

    if (currentId) {
      const parents = await this.getFileParents(token, currentId);
      if (parents) {
        // File exists
        if (!parents.includes(folderId)) {
          // File exists but not in the backup folder, move it
          console.log(`[GoogleDriveSyncService] Moving ${fileName} to backup folder`);
          await this.moveFile(token, currentId, folderId, parents);
        }
        return;
      }
      // If checkFileParents returns null, the file doesn't exist (e.g. deleted externally), proceed to find/create
    }

    // 3. Search for the file globally (in case it was created before but we lost the ID reference)
    const existingId = await this.findFile(token, fileName);
    if (existingId) {
      // Found existing file
      if (type === 'folders') this.foldersFileId = existingId;
      else if (type === 'aistudio-folders') this.aistudioFoldersFileId = existingId;
      else if (type === 'prompts') this.promptsFileId = existingId;
      else this.starredFileId = existingId;

      // Check if it needs moving
      const parents = await this.getFileParents(token, existingId);
      if (parents && !parents.includes(folderId)) {
        console.log(`[GoogleDriveSyncService] Moving existing ${fileName} to backup folder`);
        await this.moveFile(token, existingId, folderId, parents);
      }
      return;
    }

    // 4. Create new file in the backup folder
    console.log(`[GoogleDriveSyncService] Creating new file ${fileName} in backup folder`);
    const newId = await this.createFile(token, fileName, folderId);
    if (type === 'folders') this.foldersFileId = newId;
    else if (type === 'aistudio-folders') this.aistudioFoldersFileId = newId;
    else if (type === 'prompts') this.promptsFileId = newId;
    else this.starredFileId = newId;
  }

  private async ensureBackupFolder(token: string): Promise<string> {
    if (this.backupFolderId) {
      // Verify it still exists
      const exists = await this.checkFileExists(token, this.backupFolderId);
      if (exists) return this.backupFolderId;
    }

    // Search for folder
    const query = encodeURIComponent(
      `name='${BACKUP_FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    );
    const url = `${DRIVE_API_BASE}/files?q=${query}&fields=files(id)`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error('Failed to search for backup folder');

    const data = await response.json();
    const existingId = data.files?.[0]?.id;

    if (existingId) {
      this.backupFolderId = existingId;
      return existingId;
    }

    // Create folder
    const metadata = {
      name: BACKUP_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
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
    const folderData = await createResponse.json();
    this.backupFolderId = folderData.id;
    console.log('[GoogleDriveSyncService] Created backup folder:', this.backupFolderId);
    return folderData.id;
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
        if (attempt === MAX_RETRIES) throw error;
        await this.sleep(delay);
        delay *= 2;
      }
    }
  }

  private async downloadFileWithRetry<T>(token: string, fileId: string): Promise<T | null> {
    let delay = INITIAL_RETRY_DELAY_MS;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
        const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) {
          if (response.status === 404) return null;
          throw new Error(`Download failed: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (attempt === MAX_RETRIES) throw error;
        await this.sleep(delay);
        delay *= 2;
      }
    }
    return null;
  }

  private async loadState(): Promise<void> {
    try {
      const result = await chrome.storage.local.get([
        'gvSyncMode',
        'gvLastSyncTime',
        'gvLastUploadTime',
        'gvLastSyncTimeAIStudio',
        'gvLastUploadTimeAIStudio',
        'gvSyncError',
      ]);
      this.state = {
        mode: (result.gvSyncMode as SyncMode) || 'disabled',
        lastSyncTime: result.gvLastSyncTime || null,
        lastUploadTime: result.gvLastUploadTime || null,
        lastSyncTimeAIStudio: result.gvLastSyncTimeAIStudio || null,
        lastUploadTimeAIStudio: result.gvLastUploadTimeAIStudio || null,
        error: result.gvSyncError || null,
        isSyncing: false,
        isAuthenticated: false,
      };
      const token = await this.getAuthToken(false);
      this.state.isAuthenticated = !!token;
    } catch (error) {
      console.error('[GoogleDriveSyncService] Failed to load state:', error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await chrome.storage.local.set({
        gvSyncMode: this.state.mode,
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

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const googleDriveSyncService = new GoogleDriveSyncService();
