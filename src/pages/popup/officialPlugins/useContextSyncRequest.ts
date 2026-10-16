import { useCallback, useRef, useState } from 'react';

import type { TranslationKey } from '@/utils/translations';

export type ContextSyncStatus =
  | { readonly kind: 'info' | 'ok'; readonly key: TranslationKey }
  | { readonly kind: 'err'; readonly message: string };

/** One Sync to IDE request and what it last reported. */
export interface ContextSyncRequest {
  readonly syncing: boolean;
  readonly status: ContextSyncStatus | null;
  readonly sync: () => void;
  /** Clear `shown` once it has been read, unless a newer status replaced it. */
  readonly dismiss: (shown: ContextSyncStatus) => void;
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
 * The Context Sync request, owned by the Popup itself: closing Options, or a
 * search that hides the whole Plugins card, keeps a slow sync pending with its
 * result, so its button cannot start a second request meanwhile. A result
 * stays until the panel has shown it (the panel times its dismissal).
 */
export function useContextSyncRequest(sourceTabId: number | undefined): ContextSyncRequest {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState<ContextSyncStatus | null>(null);
  const inFlight = useRef(false);

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

  const dismiss = useCallback(
    (shown: ContextSyncStatus) => setStatus((current) => (current === shown ? null : current)),
    [],
  );

  return { syncing, status, sync, dismiss };
}
