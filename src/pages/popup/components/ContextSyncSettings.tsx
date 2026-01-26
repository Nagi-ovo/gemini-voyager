import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { useLanguage } from '../../../contexts/LanguageContext';

const SYNC_SERVER_URL = 'http://127.0.0.1:3030/sync';
const STORAGE_KEY = 'contextSyncEnabled';

export function ContextSyncSettings() {
  const { t } = useLanguage();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isOnline, setIsOnline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    kind: 'ok' | 'err' | 'info';
  } | null>(null);

  // Use a ref to track the latest translation function to avoid re-creating checkConnection
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    chrome.storage.sync.get([STORAGE_KEY], (result) => {
      setIsEnabled(result[STORAGE_KEY] === true);
    });
  }, []);

  const handleModeChange = (enabled: boolean) => {
    setIsEnabled(enabled);
    chrome.storage.sync.set({ [STORAGE_KEY]: enabled });
    if (!enabled) {
      setIsOnline(false);
      setStatusMessage(null);
    }
  };

  const checkConnection = useCallback(async () => {
    if (!isEnabled) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 200);

      await fetch(SYNC_SERVER_URL, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      setIsOnline(true);
      setStatusMessage({ text: tRef.current('ideOnline'), kind: 'ok' });
    } catch (err) {
      setIsOnline(false);
      setStatusMessage({ text: tRef.current('ideOffline'), kind: 'err' });
    }
  }, [isEnabled]);

  useEffect(() => {
    if (isEnabled) {
      checkConnection();
      // Poll every 5 seconds
      const interval = setInterval(checkConnection, 5000);
      return () => clearInterval(interval);
    }
  }, [checkConnection, isEnabled]);

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

        {/* Sync Mode Toggle */}
        <div>
          <Label className="mb-2 block text-sm font-medium">{t('syncMode')}</Label>
          <div className="bg-secondary/50 relative grid grid-cols-2 gap-1 rounded-lg p-1">
            <div
              className="bg-primary pointer-events-none absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-md shadow-md transition-all duration-300 ease-out"
              style={{
                left: !isEnabled ? '4px' : 'calc(50% + 2px)',
              }}
            />
            <button
              className={`relative z-10 rounded-md px-2 py-2 text-xs font-semibold transition-all duration-200 ${
                !isEnabled
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleModeChange(false)}
            >
              {t('syncModeDisabled')}
            </button>
            <button
              className={`relative z-10 rounded-md px-2 py-2 text-xs font-semibold transition-all duration-200 ${
                isEnabled
                  ? 'text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => handleModeChange(true)}
            >
              {t('syncModeManual')}
            </button>
          </div>
        </div>

        {isEnabled && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
                />
                <span className="text-xs font-medium">
                  {isOnline ? t('ideOnline') : t('ideOffline')}
                </span>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="group hover:border-primary/50"
                onClick={handleSync}
                disabled={!isOnline || isSyncing}
              >
                <span className="flex items-center gap-1 text-xs transition-transform group-hover:scale-105">
                  {isSyncing ? (
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
                  {t('syncToIDE')}
                </span>
              </Button>
            </div>

            {!isOnline && (
              <p className="text-muted-foreground text-center text-xs">{t('checkServer')}</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
