import React, { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { StorageKeys } from '@/core/types/common';

import type { OfficialPanelProps } from './officialPluginPanels';

const DEFAULT_PORT = 3030;
const MIN_PORT = 1;
const MAX_PORT = 65535;
const POLL_INTERVAL_MS = 5000;
const PROBE_TIMEOUT_MS = 200;
const SUCCESS_MESSAGE_MS = 3000;

function storedPort(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : DEFAULT_PORT;
}

/**
 * Context Sync's port, IDE status and Sync button. Mounted only while its row
 * is on and open, so the status polling and a Sync button never outlive the
 * switch (the row is the old Disabled / Manual mode). The sync request itself
 * lives above the panel (`useContextSyncRequest`), so closing Options mid-sync
 * keeps it pending and its result.
 */
export function ContextSyncPanel({ values, write, contextSync, idPrefix, t }: OfficialPanelProps) {
  const port = storedPort(values[StorageKeys.CONTEXT_SYNC_PORT]);
  // What the field shows while typing; a cleared field is not a port to save.
  const [draft, setDraft] = useState(String(port));
  const [isOnline, setIsOnline] = useState(false);
  const syncing = contextSync?.syncing ?? false;
  const status = contextSync?.status ?? null;
  const dismiss = contextSync?.dismiss;

  // A success fades only after it has been on screen; one that landed while closed waits.
  useEffect(() => {
    if (status?.kind !== 'ok' || !dismiss) return;
    const timer = setTimeout(() => dismiss(status), SUCCESS_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [status, dismiss]);

  useEffect(() => setDraft(String(port)), [port]);

  const checkConnection = useCallback(async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
    try {
      await fetch(`http://127.0.0.1:${port}/sync`, { method: 'GET', signal: controller.signal });
      setIsOnline(true);
    } catch {
      setIsOnline(false);
    } finally {
      clearTimeout(timeout);
    }
  }, [port]);

  useEffect(() => {
    void checkConnection();
    const interval = setInterval(() => void checkConnection(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkConnection]);

  const handlePortChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const text = event.target.value;
    setDraft(text);
    const parsed = parseInt(text, 10);
    if (Number.isNaN(parsed)) return;
    const next = Math.min(MAX_PORT, Math.max(MIN_PORT, parsed));
    if (next !== parsed) setDraft(String(next));
    if (next !== port) write({ [StorageKeys.CONTEXT_SYNC_PORT]: next });
  };

  const portId = `${idPrefix}-port`;
  return (
    <div className="space-y-2.5">
      <p className="text-muted-foreground text-[11px] leading-snug">
        {t('contextSyncDescription')}
      </p>
      <div>
        <label htmlFor={portId} className="text-muted-foreground mb-1 block text-[11px]">
          {t('syncServerPort')}
        </label>
        <input
          id={portId}
          type="number"
          inputMode="numeric"
          value={draft}
          onChange={handlePortChange}
          min={MIN_PORT}
          max={MAX_PORT}
          className="border-input focus-visible:ring-ring flex h-8 w-full rounded-md border bg-transparent px-2.5 text-sm shadow-sm focus-visible:ring-1 focus-visible:outline-none"
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-medium" role="status">
          <span
            aria-hidden="true"
            className={`h-2 w-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
          />
          {isOnline ? t('ideOnline') : t('ideOffline')}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => contextSync?.sync()}
          disabled={!contextSync || !isOnline || syncing}
        >
          <span className="text-xs">{t('syncToIDE')}</span>
        </Button>
      </div>
      {status && (
        <p
          role={status.kind === 'err' ? 'alert' : 'status'}
          className={`text-xs ${
            status.kind === 'ok'
              ? 'text-green-600 dark:text-green-400'
              : status.kind === 'err'
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
          }`}
        >
          {status.kind === 'err' ? status.message : t(status.key)}
        </p>
      )}
    </div>
  );
}
