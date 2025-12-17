import React, { useEffect, useState, useCallback } from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { useLanguage } from '../../../contexts/LanguageContext';

import type { SyncState, SyncMode } from '@/core/types/sync';
import { DEFAULT_SYNC_STATE } from '@/core/types/sync';

/**
 * CloudSyncSettings component for popup
 * Allows users to configure Google Drive sync settings
 */
export function CloudSyncSettings() {
    const { t } = useLanguage();
    const [syncState, setSyncState] = useState<SyncState>(DEFAULT_SYNC_STATE);
    const [statusMessage, setStatusMessage] = useState<{ text: string; kind: 'ok' | 'err' } | null>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);

    // Fetch sync state on mount
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
        fetchState();
    }, []);

    // Format timestamp for display
    const formatLastSync = useCallback((timestamp: number | null): string => {
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
            timeStr = `${diffMins} min ago`;
        } else if (diffHours < 24) {
            timeStr = `${diffHours} ${t('hoursAgo')}`;
        } else if (diffDays === 1) {
            timeStr = t('yesterday');
        } else {
            timeStr = date.toLocaleDateString();
        }

        return t('lastSynced').replace('{time}', timeStr);
    }, [t]);

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

    // Handle sign in
    const handleSignIn = useCallback(async () => {
        setStatusMessage(null);
        try {
            const response = await chrome.runtime.sendMessage({ type: 'gv.sync.authenticate' });
            if (response?.ok && response.state) {
                setSyncState(response.state);
            } else {
                setStatusMessage({ text: response?.error || 'Authentication failed', kind: 'err' });
            }
        } catch (error) {
            console.error('[CloudSyncSettings] Authentication failed:', error);
            setStatusMessage({ text: 'Authentication failed', kind: 'err' });
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

            // Get current folder and prompt data from chrome.storage.local first, fallback to localStorage
            // Note: localStorage in popup is isolated from content script localStorage on different origins
            let folders = { folders: [], folderContents: {} };
            let prompts: any[] = [];

            try {
                // Try chrome.storage.local first (used by Safari and for sync data)
                const storageResult = await chrome.storage.local.get(['gvFolderData', 'gvPromptItems']);

                if (storageResult.gvFolderData) {
                    folders = storageResult.gvFolderData;
                    console.log('[CloudSyncSettings] Loaded folders from chrome.storage.local:', folders);
                } else {
                    // Fallback to localStorage (only works when popup opened from same origin)
                    const foldersStr = localStorage.getItem('gvFolderData');
                    if (foldersStr) {
                        folders = JSON.parse(foldersStr);
                        console.log('[CloudSyncSettings] Loaded folders from localStorage:', folders);
                    }
                }

                if (storageResult.gvPromptItems) {
                    prompts = storageResult.gvPromptItems;
                    console.log('[CloudSyncSettings] Loaded prompts from chrome.storage.local:', prompts.length, 'items');
                } else {
                    const promptsStr = localStorage.getItem('gvPromptItems');
                    if (promptsStr) {
                        prompts = JSON.parse(promptsStr);
                        console.log('[CloudSyncSettings] Loaded prompts from localStorage:', prompts.length, 'items');
                    }
                }
            } catch (err) {
                console.error('[CloudSyncSettings] Error loading data:', err);
            }

            console.log('[CloudSyncSettings] Uploading folders:', folders.folders?.length || 0, 'prompts:', prompts.length);

            // Upload to Google Drive
            const response = await chrome.runtime.sendMessage({
                type: 'gv.sync.upload',
                payload: { folders, prompts },
            });

            if (response?.ok) {
                setSyncState(response.state);
                setStatusMessage({ text: t('syncSuccess'), kind: 'ok' });
            } else {
                throw new Error(response?.error || 'Upload failed');
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Sync failed';
            console.error('[CloudSyncSettings] Sync failed:', error);
            setStatusMessage({ text: t('syncError').replace('{error}', errorMessage), kind: 'err' });
        } finally {
            setIsUploading(false);
        }
    }, [syncState.isAuthenticated, t]);

    // Handle download from Drive (restore data)
    const handleDownloadFromDrive = useCallback(async () => {
        setStatusMessage(null);
        setIsDownloading(true);

        try {
            // First authenticate if needed
            if (!syncState.isAuthenticated) {
                const authResponse = await chrome.runtime.sendMessage({ type: 'gv.sync.authenticate' });
                if (!authResponse?.ok) {
                    throw new Error(authResponse?.error || 'Authentication failed');
                }
                setSyncState(authResponse.state);
            }

            // Download from Google Drive
            const response = await chrome.runtime.sendMessage({ type: 'gv.sync.download' });

            if (!response?.ok) {
                throw new Error(response?.error || 'Download failed');
            }

            if (!response.data) {
                setStatusMessage({ text: 'No sync data found in Drive', kind: 'err' });
                setIsDownloading(false);
                return;
            }

            // Save to chrome.storage.local
            // SyncData contains FolderExportPayload.data and PromptExportPayload.items
            const { folders, prompts } = response.data;
            const folderData = folders?.data || { folders: [], folderContents: {} };
            const promptItems = prompts?.items || [];
            console.log('[CloudSyncSettings] Downloaded folders:', folderData.folders?.length || 0, 'prompts:', promptItems.length);

            await chrome.storage.local.set({
                gvFolderData: folderData,
                gvPromptItems: promptItems,
            });

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
    }, [syncState.isAuthenticated, t]);

    // Clear status message after 3 seconds
    useEffect(() => {
        if (statusMessage) {
            const timer = setTimeout(() => setStatusMessage(null), 3000);
            return () => clearTimeout(timer);
        }
    }, [statusMessage]);

    return (
        <Card className="p-4 hover:shadow-lg transition-shadow">
            <CardTitle className="mb-4 text-xs uppercase">{t('cloudSync')}</CardTitle>
            <CardContent className="p-0 space-y-4">
                {/* Description */}
                <p className="text-xs text-muted-foreground">{t('cloudSyncDescription')}</p>

                {/* Sync Mode Toggle */}
                <div>
                    <Label className="text-sm font-medium mb-2 block">Sync Mode</Label>
                    <div className="relative grid grid-cols-3 rounded-lg bg-secondary/50 p-1 gap-1">
                        <div
                            className="absolute top-1 bottom-1 w-[calc(33.333%-6px)] rounded-md bg-primary shadow-md pointer-events-none transition-all duration-300 ease-out"
                            style={{
                                left:
                                    syncState.mode === 'disabled'
                                        ? '4px'
                                        : syncState.mode === 'manual'
                                            ? 'calc(33.333% + 2px)'
                                            : 'calc(66.666% + 0px)',
                            }}
                        />
                        <button
                            className={`relative z-10 px-2 py-2 text-xs font-semibold rounded-md transition-all duration-200 ${syncState.mode === 'disabled' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            onClick={() => handleModeChange('disabled')}
                        >
                            {t('syncModeDisabled')}
                        </button>
                        <button
                            className={`relative z-10 px-2 py-2 text-xs font-semibold rounded-md transition-all duration-200 ${syncState.mode === 'manual' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            onClick={() => handleModeChange('manual')}
                        >
                            {t('syncModeManual')}
                        </button>
                        <button
                            className={`relative z-10 px-2 py-2 text-xs font-semibold rounded-md transition-all duration-200 ${syncState.mode === 'auto' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                                }`}
                            onClick={() => handleModeChange('auto')}
                        >
                            {t('syncModeAuto')}
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
                                className="flex-1 group hover:border-primary/50"
                                onClick={handleSyncNow}
                                disabled={isUploading || isDownloading}
                            >
                                <span className="group-hover:scale-105 transition-transform text-xs flex items-center gap-1">
                                    {isUploading ? (
                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    ) : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                                        </svg>
                                    )}
                                    Upload
                                </span>
                            </Button>

                            {/* Sync Button (Drive → Local) */}
                            <Button
                                variant="outline"
                                size="sm"
                                className="flex-1 group hover:border-primary/50"
                                onClick={handleDownloadFromDrive}
                                disabled={isUploading || isDownloading}
                            >
                                <span className="group-hover:scale-105 transition-transform text-xs flex items-center gap-1">
                                    {isDownloading ? (
                                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                        </svg>
                                    ) : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M1 4v6h6M23 20v-6h-6" />
                                            <path d="M20.49 9A9 9 0 005.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 013.51 15" />
                                        </svg>
                                    )}
                                    {t('syncNow')}
                                </span>
                            </Button>
                        </div>

                        {/* Last Sync Time */}
                        <p className="text-xs text-muted-foreground text-center">
                            {formatLastSync(syncState.lastSyncTime)}
                        </p>

                        {/* Sign Out Button - Only show if authenticated */}
                        {syncState.isAuthenticated && (
                            <Button
                                variant="ghost"
                                size="sm"
                                className="w-full text-xs text-muted-foreground hover:text-destructive"
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
                        className={`text-xs text-center ${statusMessage.kind === 'ok' ? 'text-green-600' : 'text-destructive'
                            }`}
                    >
                        {statusMessage.text}
                    </p>
                )}

                {/* Error Display */}
                {syncState.error && !statusMessage && (
                    <p className="text-xs text-destructive text-center">
                        {t('syncError').replace('{error}', syncState.error)}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
