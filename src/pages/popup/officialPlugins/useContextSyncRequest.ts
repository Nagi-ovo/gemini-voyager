import { useCallback, useEffect, useRef, useState } from 'react';

import type { TranslationKey } from '@/utils/translations';

const SUCCESS_MESSAGE_MS = 3000;

export type ContextSyncStatus =
  | { readonly kind: 'info' | 'ok'; readonly key: TranslationKey }
  | { readonly kind: 'err'; readonly message: string };

/** One Sync to IDE request and what it last reported. */
export interface ContextSyncRequest {
  readonly syncing: boolean;
  readonly status: ContextSyncStatus | null;
  readonly sync: () => void;
}

async function targetTab(sourceTabId: number | undefined): Promise<chrome.tabs.Tab | undefined> {
  if (typeof sourceTabId === 'number') {
    try {
      return await chrome.tabs.get(sourceTabId);
    } catch {
      // The source tab is gone; fall back to the active one.
    }
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/**
 * The Context Sync request, owned above the collapsible Options panel: a slow
 * sync keeps its pending state and result while the panel is closed and
 * reopened, so its button cannot start a second request meanwhile.
 */
export function useContextSyncRequest(sourceTabId: number | undefined): ContextSyncRequest {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<ContextSyncStatus | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    if (status?.kind !== 'ok') return;
    const timer = setTimeout(() => setStatus(null), SUCCESS_MESSAGE_MS);
    return () => clearTimeout(timer);
  }, [status]);

  const sync = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setSyncing(true);
    setStatus({ kind: 'info', key: 'capturing' });
    void (async () => {
      try {
        const tab = await targetTab(sourceTabId);
        if (!tab?.id) throw new Error('No active tab found');
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'sync_to_ide' });
        if (response?.status !== 'success') throw new Error(response?.message || 'Unknown error');
        setStatus({ kind: 'ok', key: 'syncedSuccess' });
      } catch (error) {
        setStatus({ kind: 'err', message: (error as Error).message });
      } finally {
        inFlight.current = false;
        setSyncing(false);
      }
    })();
  }, [sourceTabId]);

  return { syncing, status, sync };
}
