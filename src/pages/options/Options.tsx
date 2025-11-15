import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../components/ui/card';
import { Label } from '../../components/ui/label';
import { Switch } from '../../components/ui/switch';
import { LanguageProvider, useLanguage } from '../../contexts/LanguageContext';
import { backupService, BackupService } from '../../features/backup';
import type { BackupConfig } from '../../features/backup';
import { BACKUP_STORAGE_KEYS, DEFAULT_BACKUP_CONFIG } from '../../features/backup';
import '@pages/options/Options.css';

function OptionsContent() {
  const { t } = useLanguage();

  // Backup states
  const [backupConfig, setBackupConfig] = useState<BackupConfig>(DEFAULT_BACKUP_CONFIG);
  const [backupDirectoryHandle, setBackupDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupMessage, setBackupMessage] = useState<string>('');
  const [backupMessageType, setBackupMessageType] = useState<'success' | 'error' | ''>('');

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
      console.log('[Options] Requesting directory access...');

      if (!BackupService.isSupported()) {
        console.error('[Options] File System Access API not supported');
        showBackupMessage(t('backupNotSupported'), 'error');
        return;
      }

      const handle = await BackupService.requestDirectoryAccess();

      console.log('[Options] Directory access result:', handle ? `Selected: ${handle.name}` : 'null');

      if (handle) {
        setBackupDirectoryHandle(handle);
        showBackupMessage(
          t('backupFolderSelected').replace('{folder}', handle.name),
          'success'
        );
      } else {
        // User cancelled the folder picker
        console.log('[Options] User cancelled directory selection');
        showBackupMessage(t('backupUserCancelled'), 'error');
      }
    } catch (error) {
      console.error('[Options] Error selecting backup folder:', error);

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

        // Update last backup timestamp
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
    loadBackupConfig();
  }, [loadBackupConfig]);

  return (
    <div className="max-w-4xl mx-auto p-8 bg-background text-foreground min-h-screen">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('extName')}</h1>
        <p className="text-muted-foreground">{t('backupOptions')}</p>
      </div>

      <Card className="p-6">
        <CardTitle className="mb-6 text-lg">{t('backupOptions')}</CardTitle>
        <CardContent className="p-0 space-y-4">
          {/* Important notice about data access */}
          <div className="text-sm p-3 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
            <p className="font-medium mb-1">⚠️ {t('backupDataAccessNotice')}</p>
            <p className="text-xs opacity-90">{t('backupDataAccessHint')}</p>
          </div>

          {/* Backup message */}
          {backupMessage && (
            <div
              className={`text-sm p-3 rounded ${
                backupMessageType === 'success'
                  ? 'bg-green-500/10 text-green-600 dark:text-green-400 border border-green-500/20'
                  : 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/20'
              }`}
            >
              {backupMessage}
            </div>
          )}

          {/* Not supported warning */}
          {!BackupService.isSupported() && (
            <div className="text-sm p-3 rounded bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border border-yellow-500/20">
              {t('backupNotSupported')}
            </div>
          )}

          {/* Select backup folder */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">{t('backupSelectFolder')}</Label>
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleSelectBackupFolder}
              disabled={!BackupService.isSupported()}
            >
              {backupDirectoryHandle
                ? t('backupFolderSelected').replace('{folder}', backupDirectoryHandle.name)
                : t('backupSelectFolder')}
            </Button>
          </div>

          {/* Include options */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="backup-include-prompts" className="cursor-pointer text-sm font-medium">
                {t('backupIncludePrompts')}
              </Label>
              <Switch
                id="backup-include-prompts"
                checked={backupConfig.includePrompts}
                onChange={(e) => handleBackupConfigChange('includePrompts', e.target.checked)}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="backup-include-folders" className="cursor-pointer text-sm font-medium">
                {t('backupIncludeFolders')}
              </Label>
              <Switch
                id="backup-include-folders"
                checked={backupConfig.includeFolders}
                onChange={(e) => handleBackupConfigChange('includeFolders', e.target.checked)}
              />
            </div>
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
                className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                  backupConfig.intervalHours === 0
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => handleIntervalChange(0)}
              >
                {t('backupIntervalManual')}
              </button>
              <button
                className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
                  backupConfig.intervalHours === 24
                    ? 'text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => handleIntervalChange(24)}
              >
                {t('backupIntervalDaily')}
              </button>
              <button
                className={`relative z-10 px-3 py-2 text-sm font-semibold rounded-md transition-all duration-200 ${
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
          <p className="text-sm text-muted-foreground">
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
            className="w-full"
            onClick={handleBackupNow}
            disabled={!BackupService.isSupported() || !backupDirectoryHandle}
          >
            {t('backupNow')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function Options() {
  return (
    <LanguageProvider>
      <OptionsContent />
    </LanguageProvider>
  );
}
