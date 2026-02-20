import React, { useCallback, useEffect, useState } from 'react';

import type { FolderData } from '@/core/types/folder';
import type { PromptItem, SyncMode, SyncPlatform, SyncState } from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';
import { isSafari } from '@/core/utils/browser';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { useLanguage } from '../../../contexts/LanguageContext';
import { mergeFolderData, mergePrompts, mergeStarredMessages } from '../../../utils/merge';

/**
 * CloudSyncSettings component for popup
 * Allows users to configure Google Drive sync settings
 */
export function CloudSyncSettings() {
  const { t } = useLanguage();
  const isSafariBrowser = isSafari();

  const [syncState, setSyncState] = useState<SyncState>(DEFAULT_SYNC_STATE);
  const [statusMessage, setStatusMessage] = useState<{ text: string; kind: 'ok' | 'err' } | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [platform, setPlatform] = useState<SyncPlatform>('gemini');

  // Detect current platform from active tab URL
  const detectPlatform = useCallback(async (): Promise<SyncPlatform> => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.url?.includes('aistudio.google.com') || tab?.url?.includes('aistudio.google.cn')) {
        return 'aistudio';
      }
    } catch (e) {
      console.warn('[CloudSyncSettings] Failed to detect platform:', e);
    }
    return 'gemini';
  }, []);

  // Fetch sync state and detect platform on mount
  useEffect(() => {
    const fetchState = async () => {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'gv.sync.getState' });
        if (response?.ok && response.state) {
          setSyncState(response.state);
        }
      } catch (error) {
        console.error('[CloudSyncSettings] Failed to get sync state:', error);
      }
    };
    const initPlatform = async () => {
      const detected = await detectPlatform();
      setPlatform(detected);
      console.log('[CloudSyncSettings] Detected platform:', detected);
    };
    fetchState();
    initPlatform();
  }, [detectPlatform]);

  // Format timestamp for display
  const formatLastSync = useCallback(
    (timestamp: number | null): string => {
      if (!timestamp) return t('neverSynced');
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let timeStr: string;
      if (diffMins < 1) {
        timeStr = t('justNow');
      } else if (diffMins < 60) {
        timeStr = `${diffMins} ${t('minutesAgo')}`;
      } else if (diffHours < 24) {
        timeStr = `${diffHours} ${t('hoursAgo')}`;
      } else if (diffDays === 1) {
        timeStr = t('yesterday');
      } else {
        timeStr = date.toLocaleDateString();
      }

      return t('lastSynced').replace('{time}', timeStr);
    },
    [t],
  );

  // Format upload timestamp for display
  const formatLastUpload = useCallback(
    (timestamp: number | null): string => {
      if (!timestamp) return t('neverUploaded') || 'Never uploaded';
      const date = new Date(timestamp);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      const diffDays = Math.floor(diffMs / 86400000);

      let timeStr: string;
      if (diffMins < 1) {
        timeStr = t('justNow');
      } else if (diffMins < 60) {
        timeStr = `${diffMins} ${t('minutesAgo')}`;
      } else if (diffHours < 24) {
        timeStr = `${diffHours} ${t('hoursAgo')}`;
      } else if (diffDays === 1) {
        timeStr = t('yesterday');
      } else {
        timeStr = date.toLocaleDateString();
      }

      return (t('lastUploaded') || 'Uploaded {time}').replace('{time}', timeStr);
    },
    [t],
  );

  // Handle mode change
  const handleModeChange = useCallback(async (mode: SyncMode) => {
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'gv.sync.setMode',
        payload: { mode },
      });
      if (response?.ok && response.state) {
        setSyncState(response.state);
      }
    } catch (error) {
      console.error('[CloudSyncSettings] Failed to set sync mode:', error);
    }
  }, []);

  // Handle sign out
  const handleSignOut = useCallback(async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'gv.sync.signOut' });
      if (response?.ok && response.state) {
        setSyncState(response.state);
      }
    } catch (error) {
      console.error('[CloudSyncSettings] Sign out failed:', error);
    }
  }, []);

  // Handle sync now (upload current data)
  const handleSyncNow = useCallback(async () => {
    setStatusMessage(null);
    setIsUploading(true);

    try {
      // First authenticate if needed
      if (!syncState.isAuthenticated) {
        const authResponse = await chrome.runtime.sendMessage({ type: 'gv.sync.authenticate' });
        if (!authResponse?.ok) {
          throw new Error(authResponse?.error || 'Authentication failed');
        }
        setSyncState(authResponse.state);
      }

      // Get current data - prioritizing active tab content script for folders
      let folders: FolderData = { folders: [], folderContents: {} };
      let prompts: PromptItem[] = [];

      // 1. Try to get fresh folder data from active tab
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          // Short timeout to avoid blocking
          const response = (await Promise.race([
            chrome.tabs.sendMessage(tab.id, { type: 'gv.sync.requestData' }),
            new Promise((_, reject) => setTimeout(() => reject('Timeout'), 500)),
          ])) as { ok?: boolean; data?: FolderData } | null;

          if (response?.ok && response.data) {
            folders = response.data;
            console.log('[CloudSyncSettings] Got fresh folder data from content script');
          }
        }
      } catch (e) {
        console.log('[CloudSyncSettings] Tab fetch failed/skipped:', e);
      }

      // 2. Fallback to storage (use platform-specific storage key)
      try {
        const folderStorageKey = platform === 'aistudio' ? 'gvFolderDataAIStudio' : 'gvFolderData';
        const storageResult = await chrome.storage.local.get([folderStorageKey, 'gvPromptItems']);

        // Only use storage folders if we didn't get them from tab
        if ((!folders.folders || folders.folders.length === 0) && storageResult[folderStorageKey]) {
          folders = storageResult[folderStorageKey];
          console.log(`[CloudSyncSettings] Loaded folders from ${folderStorageKey} (fallback)`);
        }

        // Prompts usually sync well to storage (only for Gemini)
        if (platform === 'gemini' && storageResult.gvPromptItems) {
          prompts = storageResult.gvPromptItems;
        }
      } catch (err) {
        console.error('[CloudSyncSettings] Error loading data:', err);
      }

      console.log(
        `[CloudSyncSettings] Uploading ${platform} folders:`,
        folders.folders?.length || 0,
        platform === 'gemini' ? `prompts: ${prompts.length}` : '(prompts skipped for AI Studio)',
      );

      // Upload to Google Drive with platform info
      const response = await chrome.runtime.sendMessage({
        type: 'gv.sync.upload',
        payload: { folders, prompts, platform },
      });

      if (response?.ok) {
        setSyncState(response.state);
        setStatusMessage({ text: t('syncSuccess'), kind: 'ok' });
      } else {
        throw new Error(response?.error || t('syncUploadFailed'));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Sync failed';
      console.error('[CloudSyncSettings] Sync failed:', error);
      setStatusMessage({ text: t('syncError').replace('{error}', errorMessage), kind: 'err' });
    } finally {
      setIsUploading(false);
    }
  }, [syncState.isAuthenticated, t, platform]);

  // Handle download from Drive (restore data) - NOW MERGES instead of overwrite
  const handleDownloadFromDrive = useCallback(async () => {
    setStatusMessage(null);
    setIsDownloading(true);

    try {
      // First authenticate if needed
      if (!syncState.isAuthenticated) {
        const authResponse = await chrome.runtime.sendMessage({ type: 'gv.sync.authenticate' });
        if (!authResponse?.ok) {
          throw new Error(authResponse?.error || t('syncAuthFailed'));
        }
        setSyncState(authResponse.state);
      }

      // Download from Google Drive (platform-specific)
      const response = await chrome.runtime.sendMessage({
        type: 'gv.sync.download',
        payload: { platform },
      });

      if (!response?.ok) {
        throw new Error(response?.error || t('syncDownloadFailed'));
      }

      if (!response.data) {
        setStatusMessage({ text: t('syncNoData'), kind: 'err' });
        setIsDownloading(false);
        return;
      }

      // Get current local data for merging - prioritize Content Script
      let localFolders: FolderData = { folders: [], folderContents: {} };
      let localPrompts: PromptItem[] = [];

      // 1. Try to get fresh folder data from active tab
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        console.log('[CloudSyncSettings] Active tab:', tab?.id, tab?.url);
        if (tab?.id) {
          const tabResponse = (await Promise.race([
            chrome.tabs.sendMessage(tab.id, { type: 'gv.sync.requestData' }),
            new Promise((_, reject) => setTimeout(() => reject('Timeout after 2s'), 2000)),
          ])) as { ok?: boolean; data?: FolderData } | null;

          console.log('[CloudSyncSettings] Tab response:', tabResponse);
          if (tabResponse?.ok && tabResponse.data) {
            localFolders = tabResponse.data;
            console.log(
              '[CloudSyncSettings] Got fresh folder data from content script:',
              'folders:',
              localFolders.folders?.length,
              'folderContents keys:',
              Object.keys(localFolders.folderContents || {}).length,
            );
          }
        }
      } catch (e) {
        console.warn('[CloudSyncSettings] Tab fetch failed/skipped:', e);
      }

      // 2. Fallback to storage (use platform-specific storage key)
      try {
        const folderStorageKey = platform === 'aistudio' ? 'gvFolderDataAIStudio' : 'gvFolderData';
        const storageResult = await chrome.storage.local.get([folderStorageKey, 'gvPromptItems']);

        // Only use storage folders if we didn't get them from tab
        if (
          (!localFolders.folders || localFolders.folders.length === 0) &&
          storageResult[folderStorageKey]
        ) {
          localFolders = storageResult[folderStorageKey];
          console.log(`[CloudSyncSettings] Loaded folders from ${folderStorageKey} (fallback)`);
        }

        // Prompts only for Gemini platform
        if (platform === 'gemini' && storageResult.gvPromptItems) {
          localPrompts = storageResult.gvPromptItems;
        }
      } catch (err) {
        console.error('[CloudSyncSettings] Error loading local data for merge:', err);
      }

      // SyncData contains FolderExportPayload.data, PromptExportPayload.items, and StarredExportPayload.data
      const {
        folders: cloudFoldersPayload,
        prompts: cloudPromptsPayload,
        starred: cloudStarredPayload,
      } = response.data;
      const cloudFolderData = cloudFoldersPayload?.data || { folders: [], folderContents: {} };
      const cloudPromptItems = cloudPromptsPayload?.items || [];
      const cloudStarredData = cloudStarredPayload?.data || { messages: {} };

      console.log('[CloudSyncSettings] === MERGE DEBUG ===');
      console.log('[CloudSyncSettings] Local folders count:', localFolders.folders?.length || 0);
      console.log(
        '[CloudSyncSettings] Local folderContents:',
        JSON.stringify(Object.keys(localFolders.folderContents || {})),
      );
      console.log('[CloudSyncSettings] Cloud folders count:', cloudFolderData.folders?.length || 0);
      console.log(
        '[CloudSyncSettings] Cloud folderContents:',
        JSON.stringify(Object.keys(cloudFolderData.folderContents || {})),
      );
      console.log(
        '[CloudSyncSettings] Cloud starred conversations:',
        Object.keys(cloudStarredData.messages || {}).length,
      );

      // Get local starred messages for merge
      let localStarred = { messages: {} };
      try {
        const starredResult = await chrome.storage.local.get(['geminiTimelineStarredMessages']);
        if (starredResult.geminiTimelineStarredMessages) {
          localStarred = starredResult.geminiTimelineStarredMessages;
        }
      } catch (err) {
        console.warn('[CloudSyncSettings] Could not get local starred messages:', err);
      }

      // Perform Merge
      const mergedFolders = mergeFolderData(localFolders, cloudFolderData);
      const mergedPrompts = mergePrompts(localPrompts, cloudPromptItems);
      const mergedStarred = mergeStarredMessages(localStarred, cloudStarredData);

      console.log('[CloudSyncSettings] Merged folders count:', mergedFolders.folders?.length || 0);
      console.log(
        '[CloudSyncSettings] Merged folderContents:',
        JSON.stringify(Object.keys(mergedFolders.folderContents || {})),
      );
      console.log(
        '[CloudSyncSettings] Merged starred conversations:',
        Object.keys(mergedStarred.messages || {}).length,
      );
      console.log('[CloudSyncSettings] === END MERGE DEBUG ===');

      // Save merged data to storage (platform-specific storage key for folders)
      const folderStorageKey = platform === 'aistudio' ? 'gvFolderDataAIStudio' : 'gvFolderData';
      const storageUpdate: Record<string, unknown> = {
        [folderStorageKey]: mergedFolders,
      };

      // Only save prompts and starred for Gemini platform
      if (platform === 'gemini') {
        storageUpdate.gvPromptItems = mergedPrompts;
        storageUpdate.geminiTimelineStarredMessages = mergedStarred;
      }

      await chrome.storage.local.set(storageUpdate);

      // Notify content script to reload folders
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
          await chrome.tabs.sendMessage(tab.id, { type: 'gv.folders.reload' });
          console.log('[CloudSyncSettings] Sent reload message to content script');
        }
      } catch (err) {
        console.warn('[CloudSyncSettings] Could not notify content script:', err);
      }

      setSyncState(response.state);
      setStatusMessage({ text: t('syncSuccess'), kind: 'ok' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Download failed';
      console.error('[CloudSyncSettings] Download failed:', error);
      setStatusMessage({ text: t('syncError').replace('{error}', errorMessage), kind: 'err' });
    } finally {
      setIsDownloading(false);
    }
  }, [syncState.isAuthenticated, t, platform]);

  // Clear status message after 3 seconds
  useEffect(() => {
    if (statusMessage) {
      const timer = setTimeout(() => setStatusMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Don't render on Safari
  if (isSafariBrowser) return null;

  return (
    <Card className="p-4 transition-shadow hover:shadow-lg">
      <CardTitle className="mb-4 text-xs uppercase">{t('cloudSync')}</CardTitle>
      <CardContent className="space-y-4 p-0">
        {/* Description */}
        <p className="text-muted-foreground text-xs">{t('cloudSyncDescription')}</p>

        {/* Sync Mode Toggle */}
        <div>
          <Label className="mb-2 block text-sm font-medium">{t('syncMode')}</Label>
          <div className="bg-secondary/50 relative grid grid-cols-2 gap-1 rounded-lg p-1">
            <div
              className="bg-primary pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md shadow-md transition-all duration-300 ease-out"
              style={{
                left: syncState.mode === 'disabled' ? '4px' : 'calc(50% + 2px)',
              }}
            />
            <button
              className={`relative z-10 rounded-md px-2 py-2 text-xs font-semibold transition-all duration-200 ${
                syncState.mode === 'disabled'
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleModeChange('disabled')}
            >
              {t('syncModeDisabled')}
            </button>
            <button
              className={`relative z-10 rounded-md px-2 py-2 text-xs font-semibold transition-all duration-200 ${
                syncState.mode === 'manual'
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleModeChange('manual')}
            >
              {t('syncModeManual')}
            </button>
          </div>
        </div>

        {/* Sync Actions - Only show if not disabled */}
        {syncState.mode !== 'disabled' && (
          <>
            {/* Upload/Download Buttons */}
            <div className="flex gap-2">
              {/* Upload Button (Local → Drive) */}
              <Button
                variant="outline"
                size="sm"
                className="group hover:border-primary/50 flex-1"
                onClick={handleSyncNow}
                disabled={isUploading || isDownloading}
              >
                <span className="flex items-center gap-1 text-xs transition-transform group-hover:scale-105">
                  {isUploading ? (
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                    </svg>
                  )}
                  {t('syncUpload')}
                </span>
              </Button>

              {/* Sync Button (Drive → Local) */}
              <Button
                variant="outline"
                size="sm"
                className="group hover:border-primary/50 flex-1"
                onClick={handleDownloadFromDrive}
                disabled={isUploading || isDownloading}
              >
                <span className="flex items-center gap-1 text-xs transition-transform group-hover:scale-105">
                  {isDownloading ? (
                    <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  ) : (
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M1 4v6h6M23 20v-6h-6" />
                      <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                    </svg>
                  )}
                  {t('syncMerge')}
                </span>
              </Button>
            </div>

            {/* Platform Indicator & Sync Times */}
            <div className="text-muted-foreground space-y-0.5 text-center text-xs">
              <p className="text-foreground/70 font-medium">
                {platform === 'aistudio' ? '📊 AI Studio' : '✨ Gemini'}
              </p>
              <p>
                ↑{' '}
                {formatLastUpload(
                  platform === 'aistudio'
                    ? syncState.lastUploadTimeAIStudio
                    : syncState.lastUploadTime,
                )}
              </p>
              <p>
                ↓{' '}
                {formatLastSync(
                  platform === 'aistudio' ? syncState.lastSyncTimeAIStudio : syncState.lastSyncTime,
                )}
              </p>
            </div>

            {/* Sign Out Button - Only show if authenticated */}
            {syncState.isAuthenticated && (
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-destructive w-full text-xs"
                onClick={handleSignOut}
              >
                {t('signOut')}
              </Button>
            )}
          </>
        )}

        {/* Status Message */}
        {statusMessage && (
          <p
            className={`text-center text-xs ${
              statusMessage.kind === 'ok' ? 'text-green-600' : 'text-destructive'
            }`}
          >
            {statusMessage.text}
          </p>
        )}

        {/* Error Display */}
        {syncState.error && !statusMessage && (
          <p className="text-destructive text-center text-xs">
            {t('syncError').replace('{error}', syncState.error)}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
