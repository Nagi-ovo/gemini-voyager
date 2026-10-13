import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import { type RouteTimeline, runRouteTimeline } from '@/features/timeline/runRouteTimeline';

import type { StopNativeFeature } from '../featureLifecycle';
import { isGeminiConversationRoute } from './conversationRoute';
import { TimelineManager } from './manager';

/** Gemini renders a conversation after its router settles; rebuilding sooner reads the old DOM. */
const ROUTE_SETTLE_MS = 500;

/** Native lifecycle module: one rail per Gemini conversation route, torn down by the returned stop. */
export function startTimeline(): StopNativeFeature {
  let stopped = false;
  let enabled = false;
  let liveRevision = 0;
  let route: RouteTimeline | null = null;
  let lifetime: AbortController | null = null;
  let bodyObserver: MutationObserver | null = null;
  const stopRail = (): void => {
    bodyObserver?.disconnect();
    bodyObserver = null;
    lifetime?.abort();
    lifetime = null;
    route = null;
  };
  const reconcile = (): void => {
    if (stopped || !enabled) {
      stopRail();
      return;
    }
    if (route) return;
    if (!document.body) {
      if (!bodyObserver) {
        bodyObserver = new MutationObserver(reconcile);
        bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
      }
      return;
    }
    bodyObserver?.disconnect();
    bodyObserver = null;
    lifetime = new AbortController();
    route = runRouteTimeline({
      signal: lifetime.signal,
      isConversationRoute: isGeminiConversationRoute,
      settleMs: ROUTE_SETTLE_MS,
      createEngine: (previousUrl) => new TimelineManager({ previousUrl }),
    });
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
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      onChanged?.removeListener(onChange);
    } finally {
      // Message timestamps and history are page services; only this rail and its shortcut lease stop.
      stopRail();
    }
  };
}
