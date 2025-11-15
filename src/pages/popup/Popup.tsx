import React, { useEffect, useState, useCallback } from 'react';

import { DarkModeToggle } from '../../components/DarkModeToggle';
import { LanguageSwitcher } from '../../components/LanguageSwitcher';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { useLanguage } from '../../contexts/LanguageContext';
import { useWidthAdjuster } from '../../hooks/useWidthAdjuster';
import { backupService, BackupService } from '../../features/backup';
import type { BackupConfig } from '../../features/backup';
import { BACKUP_STORAGE_KEYS, DEFAULT_BACKUP_CONFIG } from '../../features/backup';

import WidthSlider from './components/WidthSlider';

type ScrollMode = 'jump' | 'flow';

interface SettingsUpdate {
  mode?: ScrollMode | null;
  hideContainer?: boolean;
  draggableTimeline?: boolean;
  resetPosition?: boolean;
  folderEnabled?: boolean;
  hideArchivedConversations?: boolean;
}

export default function Popup() {
  // Debug: Confirm popup is loaded
  console.log('=== Gemini Voyager Popup Loaded ===');
  console.log('To see backup logs: Right-click this popup → Inspect');

  const { t } = useLanguage();
  const [mode, setMode] = useState<ScrollMode>('flow');
  const [hideContainer, setHideContainer] = useState<boolean>(false);
  const [draggableTimeline, setDraggableTimeline] = useState<boolean>(false);
  const [folderEnabled, setFolderEnabled] = useState<boolean>(true);
  const [hideArchivedConversations, setHideArchivedConversations] = useState<boolean>(false);

  // Backup states
  const [backupConfig, setBackupConfig] = useState<BackupConfig>(DEFAULT_BACKUP_CONFIG);
  const [backupDirectoryHandle, setBackupDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupMessage, setBackupMessage] = useState<string>('');
  const [backupMessageType, setBackupMessageType] = useState<'success' | 'error' | ''>('');

  // Helper function to apply settings to storage
  const apply = useCallback((settings: SettingsUpdate) => {
    const payload: any = {};
    if (settings.mode) payload.geminiTimelineScrollMode = settings.mode;
    if (typeof settings.hideContainer === 'boolean') payload.geminiTimelineHideContainer = settings.hideContainer;
    if (typeof settings.draggableTimeline === 'boolean') payload.geminiTimelineDraggable = settings.draggableTimeline;
    if (typeof settings.folderEnabled === 'boolean') payload.geminiFolderEnabled = settings.folderEnabled;
    if (typeof settings.hideArchivedConversations === 'boolean') payload.geminiFolderHideArchivedConversations = settings.hideArchivedConversations;
    if (settings.resetPosition) payload.geminiTimelinePosition = null;
    try {
      chrome.storage?.sync?.set(payload);
    } catch {}
  }, []);

  // Width adjuster for chat width
  const chatWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiChatWidth',
    defaultValue: 800,
    onApply: useCallback((width: number) => {
      try {
        chrome.storage?.sync?.set({ geminiChatWidth: width });
      } catch {}
    }, []),
  });

  // Width adjuster for edit input width
  const editInputWidthAdjuster = useWidthAdjuster({
    storageKey: 'geminiEditInputWidth',
    defaultValue: 600,
    onApply: useCallback((width: number) => {
      try {
        chrome.storage?.sync?.set({ geminiEditInputWidth: width });
      } catch {}
    }, []),
  });

  // Show backup message with auto-hide
  const showBackupMessage = useCallback((message: string, type: 'success' | 'error') => {
    setBackupMessage(message);
    setBackupMessageType(type);
    setTimeout(() => {
      setBackupMessage('');
      setBackupMessageType('');
    }, 3000);
  }, []);

  // Load backup configuration
  const loadBackupConfig = useCallback(() => {
    try {
      chrome.storage?.sync?.get(
        {
          [BACKUP_STORAGE_KEYS.CONFIG]: DEFAULT_BACKUP_CONFIG,
        },
        (res) => {
          const config = res?.[BACKUP_STORAGE_KEYS.CONFIG] as BackupConfig;
          setBackupConfig(config || DEFAULT_BACKUP_CONFIG);
        }
      );
    } catch (e) {
      console.warn('Failed to load backup config:', e);
    }
  }, []);

  // Save backup configuration
  const saveBackupConfig = useCallback((config: BackupConfig, showMessage = false) => {
    try {
      chrome.storage?.sync?.set({
        [BACKUP_STORAGE_KEYS.CONFIG]: config,
      });
      setBackupConfig(config);
      if (showMessage) {
        showBackupMessage(t('backupConfigSaved'), 'success');
      }
    } catch (e) {
      console.warn('Failed to save backup config:', e);
    }
  }, [t, showBackupMessage]);

  // Handle backup folder selection
  const handleSelectBackupFolder = useCallback(async () => {
    try {
      console.log('[Popup] Requesting directory access...');

      if (!BackupService.isSupported()) {
        console.error('[Popup] File System Access API not supported');
        showBackupMessage(t('backupNotSupported'), 'error');
        return;
      }

      const handle = await BackupService.requestDirectoryAccess();

      console.log('[Popup] Directory access result:', handle ? `Selected: ${handle.name}` : 'null');

      if (handle) {
        setBackupDirectoryHandle(handle);
        showBackupMessage(
          t('backupFolderSelected').replace('{folder}', handle.name),
          'success'
        );
      } else {
        // User cancelled the folder picker, or picker returned null
        console.log('[Popup] No directory handle returned (user cancelled or error)');
        showBackupMessage(t('backupUserCancelled'), 'error');
      }
    } catch (error) {
      console.error('[Popup] Error selecting backup folder:', error);

      // Check if it's a permission/restricted directory error
      if (error instanceof Error &&
          (error.message.includes('not allowed') ||
           error.message.includes('Cannot access this directory'))) {
        showBackupMessage(t('backupPermissionDenied'), 'error');
      } else {
        showBackupMessage(
          t('backupError').replace('{error}', error instanceof Error ? error.message : 'Unknown error'),
          'error'
        );
      }
    }
  }, [t, showBackupMessage]);

  // Handle backup config changes
  const handleBackupConfigChange = useCallback(
    (key: keyof BackupConfig, value: boolean) => {
      saveBackupConfig({ ...backupConfig, [key]: value });
    },
    [backupConfig, saveBackupConfig]
  );

  // Handle backup interval change
  const handleIntervalChange = useCallback(
    (intervalHours: number) => {
      saveBackupConfig({ ...backupConfig, intervalHours });
    },
    [backupConfig, saveBackupConfig]
  );

  // Handle backup now
  const handleBackupNow = useCallback(async () => {
    try {
      if (!backupDirectoryHandle) {
        showBackupMessage(t('backupSelectFolderFirst'), 'error');
        return;
      }

      const result = await backupService.createBackup(backupDirectoryHandle, backupConfig);

      if (result.success) {
        const data = result.data;
        showBackupMessage(
          t('backupSuccess')
            .replace('{prompts}', String(data.promptCount))
            .replace('{folders}', String(data.folderCount))
            .replace('{conversations}', String(data.conversationCount)),
          'success'
        );

        // Update last backup timestamp (don't show "config saved" message, backup success already shown)
        const updatedConfig = {
          ...backupConfig,
          lastBackupAt: data.timestamp,
        };
        saveBackupConfig(updatedConfig, false);
      } else {
        showBackupMessage(
          t('backupError').replace('{error}', result.error?.message || 'Unknown error'),
          'error'
        );
      }
    } catch (error) {
      console.error('Backup failed:', error);
      showBackupMessage(
        t('backupError').replace('{error}', error instanceof Error ? error.message : 'Unknown error'),
        'error'
      );
    }
  }, [backupDirectoryHandle, backupConfig, t, showBackupMessage, saveBackupConfig]);

  useEffect(() => {
    try {
      chrome.storage?.sync?.get(
        {
          geminiTimelineScrollMode: 'flow',
          geminiTimelineHideContainer: false,
          geminiTimelineDraggable: false,
          geminiFolderEnabled: true,
          geminiFolderHideArchivedConversations: false,
        },
        (res) => {
          const m = res?.geminiTimelineScrollMode as ScrollMode;
          if (m === 'jump' || m === 'flow') setMode(m);
          setHideContainer(!!res?.geminiTimelineHideContainer);
          setDraggableTimeline(!!res?.geminiTimelineDraggable);
          setFolderEnabled(res?.geminiFolderEnabled !== false);
          setHideArchivedConversations(!!res?.geminiFolderHideArchivedConversations);
        }
      );
    } catch {}

    // Load backup config
    loadBackupConfig();
  }, [loadBackupConfig]);

  return (
    <div className="w-[360px] bg-background text-foreground">
      {/* Header */}
      <div className="bg-linear-to-br from-primary/10 via-accent/5 to-transparent border-b border-border/50 px-5 py-4 flex items-center justify-between backdrop-blur-sm">
        <h1 className="text-xl font-bold bg-linear-to-r from-primary to-primary/70 bg-clip-text text-transparent">
          {t('extName')}
        </h1>
        <div className="flex items-center gap-1">
          <DarkModeToggle />
          <LanguageSwitcher />
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* Gemini Only Notice */}
        <Card className="p-3 bg-primary/10 border-primary/20 hover:shadow-lg transition-shadow">
          <div className="flex items-center gap-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="text-primary shrink-0"
            >
              <path
                d="M8 1C4.13 1 1 4.13 1 8s3.13 7 7 7 7-3.13 7-7-3.13-7-7-7zm0 11c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm1-4H7V5h2v3z"
                fill="currentColor"
              />
            </svg>
            <p className="text-xs text-primary font-medium">{t('geminiOnlyNotice')}</p>
          </div>
        </Card>
        {/* Scroll Mode */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-3 text-xs uppercase">{t('scrollMode')}</CardTitle>
          <CardContent className="p-0">
            <div className="relative grid grid-cols-2 rounded-lg bg-secondary/50 p-1 gap-1">
              <div
                className="absolute top-1 bottom-1 w-[calc(50%-6px)] rounded-md bg-primary shadow-md pointer-events-none transition-all duration-300 ease-out"
                style={{ left: mode === 'flow' ? '4px' : 'calc(50% + 2px)' }}
              />
              <button
                className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                  mode === 'flow' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setMode('flow');
                  apply({ mode: 'flow' });
                }}
              >
                {t('flow')}
              </button>
              <button
                className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                  mode === 'jump' ? 'text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => {
                  setMode('jump');
                  apply({ mode: 'jump' });
                }}
              >
                {t('jump')}
              </button>
            </div>
          </CardContent>
        </Card>
        {/* Timeline Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('timelineOptions')}</CardTitle>
          <CardContent className="p-0 space-y-4">
            <div className="flex items-center justify-between group">
              <Label htmlFor="hide-container" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                {t('hideOuterContainer')}
              </Label>
              <Switch
                id="hide-container"
                checked={hideContainer}
                onChange={(e) => {
                  setHideContainer(e.target.checked);
                  apply({ hideContainer: e.target.checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between group">
              <Label htmlFor="draggable-timeline" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                {t('draggableTimeline')}
              </Label>
              <Switch
                id="draggable-timeline"
                checked={draggableTimeline}
                onChange={(e) => {
                  setDraggableTimeline(e.target.checked);
                  apply({ draggableTimeline: e.target.checked });
                }}
              />
            </div>
            {/* Reset Timeline Position Button */}
            <Button
              variant="outline"
              size="sm"
              className="w-full group hover:border-primary/50 mt-2"
              onClick={() => {
                apply({ resetPosition: true });
              }}
            >
              <span className="group-hover:scale-105 transition-transform text-xs">{t('resetTimelinePosition')}</span>
            </Button>
          </CardContent>
        </Card>
        {/* Folder Options */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('folderOptions')}</CardTitle>
          <CardContent className="p-0 space-y-4">
            <div className="flex items-center justify-between group">
              <Label htmlFor="folder-enabled" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                {t('enableFolderFeature')}
              </Label>
              <Switch
                id="folder-enabled"
                checked={folderEnabled}
                onChange={(e) => {
                  setFolderEnabled(e.target.checked);
                  apply({ folderEnabled: e.target.checked });
                }}
              />
            </div>
            <div className="flex items-center justify-between group">
              <Label htmlFor="hide-archived" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                {t('hideArchivedConversations')}
              </Label>
              <Switch
                id="hide-archived"
                checked={hideArchivedConversations}
                onChange={(e) => {
                  setHideArchivedConversations(e.target.checked);
                  apply({ hideArchivedConversations: e.target.checked });
                }}
              />
            </div>
          </CardContent>
        </Card>
        {/* Chat Width */}
        <WidthSlider
          label={t('chatWidth')}
          value={chatWidthAdjuster.width}
          min={400}
          max={1400}
          step={50}
          narrowLabel={t('chatWidthNarrow')}
          wideLabel={t('chatWidthWide')}
          onChange={chatWidthAdjuster.handleChange}
          onChangeComplete={chatWidthAdjuster.handleChangeComplete}
        />
        {/* Edit Input Width */}
        <WidthSlider
          label={t('editInputWidth')}
          value={editInputWidthAdjuster.width}
          min={400}
          max={1200}
          step={50}
          narrowLabel={t('editInputWidthNarrow')}
          wideLabel={t('editInputWidthWide')}
          onChange={editInputWidthAdjuster.handleChange}
          onChangeComplete={editInputWidthAdjuster.handleChangeComplete}
        />

        {/* Auto Backup */}
        <Card className="p-4 hover:shadow-lg transition-shadow">
          <CardTitle className="mb-4 text-xs uppercase">{t('backupOptions')}</CardTitle>
          <CardContent className="p-0 space-y-3">
            {/* Backup message */}
            {backupMessage && (
              <div
                className={`text-xs p-2 rounded ${
                  backupMessageType === 'success'
                    ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                    : 'bg-red-500/10 text-red-600 dark:text-red-400'
                }`}
              >
                {backupMessage}
              </div>
            )}

            {/* Not supported warning */}
            {!BackupService.isSupported() && (
              <div className="text-xs p-2 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400">
                {t('backupNotSupported')}
              </div>
            )}

            {/* Browser limitation hint */}
            {BackupService.isSupported() && !backupDirectoryHandle && (
              <div className="text-xs p-2 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                {t('backupPopupLimitation')}
              </div>
            )}

            {/* Select backup folder */}
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full group hover:border-primary/50"
                onClick={handleSelectBackupFolder}
                disabled={!BackupService.isSupported()}
              >
                <span className="group-hover:scale-105 transition-transform text-xs">
                  {t('backupSelectFolder')}
                </span>
              </Button>
              {backupDirectoryHandle && (
                <p className="text-xs text-muted-foreground">
                  {t('backupFolderSelected').replace('{folder}', backupDirectoryHandle.name)}
                </p>
              )}
            </div>

            {/* Include options */}
            <div className="flex items-center justify-between group">
              <Label htmlFor="backup-include-prompts" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                {t('backupIncludePrompts')}
              </Label>
              <Switch
                id="backup-include-prompts"
                checked={backupConfig.includePrompts}
                onChange={(e) => handleBackupConfigChange('includePrompts', e.target.checked)}
              />
            </div>

            <div className="flex items-center justify-between group">
              <Label htmlFor="backup-include-folders" className="cursor-pointer text-sm font-medium group-hover:text-primary transition-colors">
                {t('backupIncludeFolders')}
              </Label>
              <Switch
                id="backup-include-folders"
                checked={backupConfig.includeFolders}
                onChange={(e) => handleBackupConfigChange('includeFolders', e.target.checked)}
              />
            </div>

            {/* Backup interval */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">{t('backupIntervalLabel')}</Label>
              <div className="relative grid grid-cols-3 rounded-lg bg-secondary/50 p-1 gap-1">
                <div
                  className="absolute top-1 bottom-1 w-[calc(33.333%-6px)] rounded-md bg-primary shadow-md pointer-events-none transition-all duration-300 ease-out"
                  style={{
                    left:
                      backupConfig.intervalHours === 0
                        ? '4px'
                        : backupConfig.intervalHours === 24
                        ? 'calc(33.333% + 2px)'
                        : 'calc(66.666% + 2px)',
                  }}
                />
                <button
                  className={`relative z-10 px-2 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                    backupConfig.intervalHours === 0
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => handleIntervalChange(0)}
                >
                  {t('backupIntervalManual')}
                </button>
                <button
                  className={`relative z-10 px-2 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                    backupConfig.intervalHours === 24
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => handleIntervalChange(24)}
                >
                  {t('backupIntervalDaily')}
                </button>
                <button
                  className={`relative z-10 px-2 py-1.5 text-xs font-semibold rounded-md transition-all duration-200 ${
                    backupConfig.intervalHours === 168
                      ? 'text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  onClick={() => handleIntervalChange(168)}
                >
                  {t('backupIntervalWeekly')}
                </button>
              </div>
            </div>

            {/* Last backup time */}
            <p className="text-xs text-muted-foreground">
              {backupConfig.lastBackupAt
                ? t('backupLastBackup').replace(
                    '{time}',
                    new Date(backupConfig.lastBackupAt).toLocaleString()
                  )
                : t('backupLastBackup').replace('{time}', t('backupNever'))}
            </p>

            {/* Backup now button */}
            <Button
              variant="default"
              size="sm"
              className="w-full group mt-2"
              onClick={handleBackupNow}
              disabled={!BackupService.isSupported() || !backupDirectoryHandle}
            >
              <span className="group-hover:scale-105 transition-transform text-xs">
                {t('backupNow')}
              </span>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <div className="bg-linear-to-br from-secondary/30 via-accent/10 to-transparent border-t border-border/50 px-5 py-4 flex items-center justify-between backdrop-blur-sm">
        <span className="text-xs text-muted-foreground font-medium">{t('starProject')}</span>
        <a
          href="https://github.com/Nagi-ovo/gemini-voyager"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg text-xs font-semibold transition-all hover:shadow-lg hover:scale-105 active:scale-95"
          title={t('starProject')}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 005.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0016 8c0-4.42-3.58-8-8-8z" />
          </svg>
          <span>Star</span>
        </a>
      </div>
    </div>
  );
}
