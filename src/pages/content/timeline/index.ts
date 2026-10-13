import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import type { StopNativeFeature } from '../featureLifecycle';
import { type GeminiTimelineRail, startGeminiTimelineRail } from './startGeminiTimelineRail';

/** Native lifecycle module: one rail per Gemini conversation route, torn down by the returned stop. */
export function startTimeline(signal?: AbortSignal): StopNativeFeature {
  if (signal?.aborted) return () => {};
  let stopped = false;
  let enabled = false;
  let liveRevision = 0;
  let rail: GeminiTimelineRail | null = null;
  const stopRail = (): void => {
    rail?.stop();
    rail = null;
  };
  const reconcile = (): void => {
    if (stopped || !enabled) {
      stopRail();
      return;
    }
    rail ??= startGeminiTimelineRail();
  };
  const key = StorageKeys.GV_TIMELINE_ENABLED;
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (stopped || area !== 'sync' || !Object.prototype.hasOwnProperty.call(changes, key)) return;
    liveRevision += 1;
    enabled = changes[key].newValue !== false;
    reconcile();
  };
  const onChanged = chrome.storage?.onChanged;
  onChanged?.addListener(onChange);
  const readRevision = liveRevision;
  void (async () => {
    let stored: Record<string, unknown> = {};
    try {
      stored = (await chrome.storage?.sync?.get({ [key]: true })) ?? {};
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      // A transient settings read failure keeps the rail's historical default: on.
    }
    // Closing the rail during its initial read must beat the older startup value.
    if (stopped || liveRevision !== readRevision) return;
    enabled = stored[key] !== false;
    reconcile();
  })();
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    signal?.removeEventListener('abort', stop);
    try {
      onChanged?.removeListener(onChange);
    } finally {
      // Message timestamps and history are page services; only this rail and its shortcut lease stop.
      stopRail();
    }
  };
  // Abort closes the rail before the plugin's async cleanup ledger can release it.
  signal?.addEventListener('abort', stop, { once: true });
  return stop;
}
