import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { useLanguage } from '../../../contexts/LanguageContext';

const SYNC_SERVER_URL = 'http://127.0.0.1:3030/sync';

export function ContextSyncSettings() {
  const { t } = useLanguage();
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    kind: 'ok' | 'err' | 'info';
  } | null>(null);

  const checkConnection = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 200);

      await fetch(SYNC_SERVER_URL, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsOnline(true);
      setStatusMessage({ text: t('ideOnline'), kind: 'ok' });
    } catch (err) {
      setIsOnline(false);
      setStatusMessage({ text: t('ideOffline'), kind: 'err' });
    }
  }, [t]);

  useEffect(() => {
    checkConnection();
    // Poll every 5 seconds
    const interval = setInterval(checkConnection, 5000);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const handleSync = async () => {
    setIsSyncing(true);
    setStatusMessage({ text: t('capturing'), kind: 'info' });

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab?.id) {
        throw new Error('No active tab found');
      }

      // Check if it's a supported page
      if (
        tab.url &&
        !tab.url.includes('gemini.google.com') &&
        !tab.url.includes('chatgpt.com') &&
        !tab.url.includes('claude.ai')
      ) {
        // If it's not one of the default supported, maybe it's a custom one?
        // For now, let's just warn but try anyway if the script is injected
      }

      const response = await chrome.tabs.sendMessage(tab.id, { action: 'sync_to_ide' });

      if (response && response.status === 'success') {
        setStatusMessage({ text: t('syncedSuccess'), kind: 'ok' });
      } else {
        throw new Error(response?.message || 'Unknown error');
      }
    } catch (err) {
      console.error('Sync failed', err);
      setStatusMessage({ text: (err as Error).message, kind: 'err' });
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <Card className="p-4 transition-shadow hover:shadow-lg">
      <CardTitle className="mb-4 text-xs uppercase">{t('contextSync')}</CardTitle>
      <CardContent className="space-y-4 p-0">
        <p className="text-muted-foreground text-xs">{t('contextSyncDescription')}</p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="text-xs font-medium">
              {isOnline ? t('ideOnline') : t('ideOffline')}
            </span>
          </div>

          <Button
            size="sm"
            onClick={handleSync}
            disabled={!isOnline || isSyncing}
            variant={isOnline ? 'default' : 'secondary'}
          >
            {isSyncing ? t('syncing') : t('syncToIDE')}
          </Button>
        </div>

        {statusMessage && (
          <p
            className={`text-center text-xs ${
              statusMessage.kind === 'ok'
                ? 'text-green-600'
                : statusMessage.kind === 'err'
                  ? 'text-destructive'
                  : 'text-muted-foreground'
            }`}
          >
            {statusMessage.text}
          </p>
        )}

        {!isOnline && (
          <p className="text-muted-foreground text-center text-xs">{t('checkServer')}</p>
        )}
      </CardContent>
    </Card>
  );
}
