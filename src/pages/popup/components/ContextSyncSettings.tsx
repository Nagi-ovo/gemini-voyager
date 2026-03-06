import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '../../../components/ui/button';
import { Card, CardContent, CardTitle } from '../../../components/ui/card';
import { Label } from '../../../components/ui/label';
import { useLanguage } from '../../../contexts/LanguageContext';

const STORAGE_KEY_ENABLED = 'contextSyncEnabled';
const STORAGE_KEY_PORT = 'contextSyncPort';
const DEFAULT_PORT = 3030;

export function ContextSyncSettings() {
  const { t } = useLanguage();
  const [isEnabled, setIsEnabled] = useState(false);
  const [port, setPort] = useState(DEFAULT_PORT);
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
    chrome.storage.sync.get([STORAGE_KEY_ENABLED, STORAGE_KEY_PORT], (result) => {
      setIsEnabled(result[STORAGE_KEY_ENABLED] === true);
      setPort(result[STORAGE_KEY_PORT] || DEFAULT_PORT);
    });
  }, []);

  const handleModeChange = (enabled: boolean) => {
    setIsEnabled(enabled);
    chrome.storage.sync.set({ [STORAGE_KEY_ENABLED]: enabled });
    if (!enabled) {
      setIsOnline(false);
      setStatusMessage(null);
    }
  };

  const handlePortChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Allow empty string to let user delete everything and type
    if (val === '') {
      // @ts-ignore - temporary state allow
      setPort('');
      return;
    }
    let newPort = parseInt(val, 10);
    if (!isNaN(newPort)) {
      // Range validation 1-65535
      if (newPort < 1) newPort = 1;
      if (newPort > 65535) newPort = 65535;

      setPort(newPort);
      chrome.storage.sync.set({ [STORAGE_KEY_PORT]: newPort });
    }
  };

  const checkConnection = useCallback(async () => {
    if (!isEnabled) return;

    // If port is invalid (e.g. empty string during typing), don't check
    if (!port) return;

    const url = `http://127.0.0.1:${port}/sync`;

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 200);

      await fetch(url, {
        method: 'GET',
        signal: controller.signal,
      });

      setIsOnline(true);
      // setStatusMessage({ text: tRef.current('ideOnline'), kind: 'ok' });
    } catch {
      setIsOnline(false);
      // setStatusMessage({ text: tRef.current('ideOffline'), kind: 'err' });
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [isEnabled, port]);

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
        // Clear success message after 3 seconds
        setTimeout(() => setStatusMessage(null), 3000);
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
            {/* Port Configuration */}
            <div>
              <Label className="mb-2 block text-sm font-medium">{t('syncServerPort')}</Label>
              <input
                type="number"
                value={port}
                onChange={handlePortChange}
                min="1"
                max="65535"
                className="border-input placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

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
            {statusMessage && (
              <div
                className={`text-xs ${
                  statusMessage.kind === 'ok'
                    ? 'text-green-500'
                    : statusMessage.kind === 'err'
                      ? 'text-red-500'
                      : 'text-blue-500'
                }`}
              >
                {statusMessage.text}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
