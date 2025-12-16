/**
 * Google Drive Sync Service
 *
 * Enterprise-grade service for syncing extension data to Google Drive
 * Uses Chrome Identity API for OAuth2 and Drive REST API v3 for storage
 *
 * Stores folders and prompts as separate files matching export format:
 * - gemini-voyager-folders.json
 * - gemini-voyager-prompts.json
 */

import type { FolderData } from '@/core/types/folder';
import type {
    SyncState,
    SyncMode,
    PromptItem,
    FolderExportPayload,
    PromptExportPayload,
} from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';
import { EXTENSION_VERSION } from '@/core/utils/version';

const FOLDERS_FILE_NAME = 'gemini-voyager-folders.json';
const PROMPTS_FILE_NAME = 'gemini-voyager-prompts.json';
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
    private promptsFileId: string | null = null;
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

    async authenticate(): Promise<boolean> {
        try {
            this.updateState({ isSyncing: true, error: null });
            const token = await this.getAuthToken(true);
            if (!token) {
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
        this.updateState({ isAuthenticated: false, lastSyncTime: null, error: null });
        await this.saveState();
    }

    /**
     * Upload folders and prompts as separate files to Google Drive
     */
    async upload(folders: FolderData, prompts: PromptItem[]): Promise<boolean> {
        try {
            this.updateState({ isSyncing: true, error: null });

            const token = await this.getAuthToken(true);
            if (!token) {
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

            // Upload folders file
            await this.ensureFileId(token, FOLDERS_FILE_NAME, 'folders');
            await this.uploadFileWithRetry(token, this.foldersFileId!, folderPayload);
            console.log('[GoogleDriveSyncService] Folders uploaded successfully');

            // Upload prompts file
            await this.ensureFileId(token, PROMPTS_FILE_NAME, 'prompts');
            await this.uploadFileWithRetry(token, this.promptsFileId!, promptPayload);
            console.log('[GoogleDriveSyncService] Prompts uploaded successfully');

            const syncTime = Date.now();
            this.updateState({ isSyncing: false, lastSyncTime: syncTime, error: null });
            await this.saveState();

            console.log('[GoogleDriveSyncService] Upload successful - 2 files');
            return true;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Upload failed';
            console.error('[GoogleDriveSyncService] Upload failed:', error);
            this.updateState({ isSyncing: false, error: errorMessage });
            return false;
        }
    }

    /**
     * Download folders and prompts from separate files in Google Drive
     * Returns { folders, prompts } or null if no files exist
     */
    async download(): Promise<{ folders: FolderExportPayload | null; prompts: PromptExportPayload | null } | null> {
        try {
            this.updateState({ isSyncing: true, error: null });

            const token = await this.getAuthToken(true);
            if (!token) {
                throw new Error('Not authenticated');
            }

            // Download folders file
            const foldersFileId = await this.findFile(token, FOLDERS_FILE_NAME);
            let folders: FolderExportPayload | null = null;
            if (foldersFileId) {
                folders = await this.downloadFileWithRetry(token, foldersFileId);
                console.log('[GoogleDriveSyncService] Folders downloaded');
            }

            // Download prompts file
            const promptsFileId = await this.findFile(token, PROMPTS_FILE_NAME);
            let prompts: PromptExportPayload | null = null;
            if (promptsFileId) {
                prompts = await this.downloadFileWithRetry(token, promptsFileId);
                console.log('[GoogleDriveSyncService] Prompts downloaded');
            }

            if (!folders && !prompts) {
                console.log('[GoogleDriveSyncService] No sync files found');
                this.updateState({ isSyncing: false });
                return null;
            }

            const syncTime = Date.now();
            this.updateState({ isSyncing: false, lastSyncTime: syncTime, error: null });
            await this.saveState();

            return { folders, prompts };
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
        this.tokenExpiry = Date.now() + (expiresIn * 1000) - 60000;
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
        const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUrl);
        authUrl.searchParams.set('response_type', 'token');
        authUrl.searchParams.set('scope', scopes);

        try {
            const responseUrl = await new Promise<string>((resolve, reject) => {
                chrome.identity.launchWebAuthFlow({ url: authUrl.toString(), interactive: true }, (response) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (response) {
                        resolve(response);
                    } else {
                        reject(new Error('No response from auth flow'));
                    }
                });
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

    private async ensureFileId(token: string, fileName: string, type: 'folders' | 'prompts'): Promise<void> {
        const currentId = type === 'folders' ? this.foldersFileId : this.promptsFileId;

        if (currentId) {
            const exists = await this.checkFileExists(token, currentId);
            if (exists) return;
        }

        const existingId = await this.findFile(token, fileName);
        if (existingId) {
            if (type === 'folders') this.foldersFileId = existingId;
            else this.promptsFileId = existingId;
            return;
        }

        const newId = await this.createFile(token, fileName);
        if (type === 'folders') this.foldersFileId = newId;
        else this.promptsFileId = newId;
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

    private async createFile(token: string, fileName: string): Promise<string> {
        const metadata = { name: fileName, mimeType: 'application/json' };
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
            const result = await chrome.storage.local.get(['gvSyncMode', 'gvLastSyncTime', 'gvSyncError']);
            this.state = {
                mode: (result.gvSyncMode as SyncMode) || 'disabled',
                lastSyncTime: result.gvLastSyncTime || null,
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
