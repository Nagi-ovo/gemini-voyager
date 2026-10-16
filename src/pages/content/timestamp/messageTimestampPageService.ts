import browser from 'webextension-polyfill';

import { storageService } from '@/core/services/StorageService';
import { StorageKeys } from '@/core/types/common';
import { extractConversationIdFromUrl } from '@/core/utils/conversationIdentity';
import type { ExtGlobal, SyncSettingsListener } from '@/features/timeline/types';

import type { StopNativeFeature } from '../featureLifecycle';
import { getLegacyTurnIndex } from '../fork/turnId';
import { isGeminiConversationRoute } from '../timeline/conversationRoute';
import { watchRouteChanges } from '../utils/routeWatcher';
import { TimestampService } from './TimestampService';
import { historyTimestampStore } from './historyTimestamps';
import { MessageTimestampCollector } from './messageTimestampCollector';
import { getLocalMessageTimestamp } from './messageTimestampLookup';

const ROUTE_SETTLE_MS = 500;
const routeOf = (url: string): string => url.split('#')[0];

interface MessageTimestampPage {
  readonly ready: Promise<void>;
  stop(): void;
  format(url: string, id: string, aliases: readonly string[], text: string): string | null;
}

let current: MessageTimestampPage | null = null;
let retiringWrites: Promise<void> = Promise.resolve();

/** Plugin-owned in production; direct callers retain the same setting gate and stop contract. */
export function startMessageTimestampPageService(): StopNativeFeature {
  current?.stop();
  const previousWrites = retiringWrites;
  const lifetime = new AbortController();
  // Route collectors must share one cache: independent whole-cache persists can lose other routes.
  const timestamps = new TimestampService();
  const cacheReady = previousWrites.then(() => {
    if (!lifetime.signal.aborted) return timestamps.initialize();
  });
  let enabled = false;
  let settingRevision = 0;
  let hydrated = false;
  let collector: MessageTimestampCollector | null = null;
  let bodyObserver: MutationObserver | null = null;
  let settleTimer: number | null = null;
  let lastUrl = location.href;
  let pendingPreviousUrl: string | null = null;
  let removeSettingsListener: (() => void) | null = null;

  const destroyCollector = (): void => {
    collector?.stop();
    collector = null;
    bodyObserver?.disconnect();
    bodyObserver = null;
  };
  const mount = (): void => {
    if (lifetime.signal.aborted || !hydrated || !isGeminiConversationRoute(location.href)) return;
    // The setting is off by default; a disabled collector would still rescan Gemini on every mutation.
    if (!enabled) return destroyCollector();
    if (!document.body) {
      bodyObserver ??= new MutationObserver(() => {
        if (!document.body) return;
        bodyObserver?.disconnect();
        bodyObserver = null;
        mount();
      });
      bodyObserver.observe(document.documentElement, { childList: true, subtree: true });
      return;
    }
    destroyCollector();
    collector = new MessageTimestampCollector(timestamps, pendingPreviousUrl);
    pendingPreviousUrl = null;
    void collector.start().catch((error: unknown) => {
      console.error('[Gemini Voyager] Message timestamp collection failed:', error);
    });
  };

  const stopRoute = watchRouteChanges(({ currentHref }) => {
    if (routeOf(currentHref) === routeOf(lastUrl)) return;
    pendingPreviousUrl = lastUrl;
    lastUrl = currentHref;
    // Retire immediately; waiting for Gemini's DOM must not let the old collector read the next chat.
    destroyCollector();
    if (settleTimer !== null) clearTimeout(settleTimer);
    settleTimer = null;
    if (!isGeminiConversationRoute(currentHref)) return;
    settleTimer = window.setTimeout(() => {
      settleTimer = null;
      mount();
    }, ROUTE_SETTLE_MS);
  });

  try {
    const g = globalThis as ExtGlobal;
    const onChanged = g.chrome?.storage?.onChanged || g.browser?.storage?.onChanged;
    if (onChanged) {
      const listener: SyncSettingsListener = (changes, area) => {
        if (lifetime.signal.aborted || (area !== 'sync' && area !== 'local')) return;
        const change = changes[StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS];
        if (!change) return;
        settingRevision++;
        enabled = change.newValue === true;
        if (!enabled) destroyCollector();
        else if (!collector && settleTimer === null) mount();
      };
      onChanged.addListener(listener);
      removeSettingsListener = () => onChanged.removeListener?.(listener);
    }
  } catch {}

  const readRevision = settingRevision;
  const ready = (async () => {
    // Off→on must not hydrate a stale whole-cache snapshot while the old owner is still writing.
    await cacheReady;
    if (lifetime.signal.aborted) return;
    const setting = await storageService.get<boolean>(StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS);
    if (lifetime.signal.aborted) return;
    // A popup toggle received during either initial read is newer than its stored snapshot.
    if (settingRevision === readRevision) enabled = setting.success && setting.data === true;
    hydrated = true;
    // Discovery may wait four seconds for a first turn; readers need only cache/settings readiness.
    if (settleTimer === null) mount();
  })();

  const page: MessageTimestampPage = {
    ready,
    stop() {
      if (lifetime.signal.aborted) return;
      lifetime.abort();
      destroyCollector();
      // Initialization may still be removing legacy v1 data; retire that write before a successor reads.
      retiringWrites = cacheReady.then(() => timestamps.whenPersisted()).catch(() => {});
      stopRoute();
      try {
        removeSettingsListener?.();
      } catch {
        // A reloaded extension must still retire route work and its page reader below.
      }
      removeSettingsListener = null;
      if (settleTimer !== null) clearTimeout(settleTimer);
      settleTimer = null;
      if (current === page) current = null;
    },
    format(url, id, aliases, text) {
      if (!hydrated || !enabled || lifetime.signal.aborted || !id || aliases.length === 0)
        return null;
      const cid = extractConversationIdFromUrl(url);
      const canonical =
        cid && getLegacyTurnIndex(id) === null
          ? historyTimestampStore.resolveCanonicalTurnId(cid, id)
          : null;
      const serverTimestamp = cid
        ? historyTimestampStore.getTurns(cid)?.find((turn) => turn.turnId === canonical)
            ?.timestampMs
        : undefined;
      const timestamp = serverTimestamp ?? getLocalMessageTimestamp(timestamps, url, aliases, text);
      return timestamp == null ? null : timestamps.formatAbsoluteTime(timestamp);
    },
  };
  current = page;
  void ready.catch((error: unknown) => {
    console.error('[Gemini Voyager] Message timestamp initialization failed:', error);
  });
  return page.stop;
}

/** Readiness never starts a service and never waits for Gemini to mount a turn. */
export function whenMessageTimestampsReady(signal?: AbortSignal): Promise<boolean> {
  if (signal?.aborted) return Promise.resolve(false);
  // Rails need a readable cache, not a mounted labels plugin: off or late admission must not block them.
  const ready =
    current?.ready ??
    retiringWrites.then(() => browser.storage.local.get(StorageKeys.GV_MESSAGE_TIMESTAMPS));
  return new Promise((resolve) => {
    const finish = (ready: boolean): void => {
      signal?.removeEventListener('abort', onAbort);
      resolve(ready);
    };
    const onAbort = (): void => finish(false);
    signal?.addEventListener('abort', onAbort, { once: true });
    void ready.then(
      () => finish(!signal?.aborted),
      () => finish(false),
    );
  });
}

/** Rail tooltips read captured identities without collecting, writing or owning labels. */
export function formatMessageTimestamp(
  url: string,
  id: string,
  aliases: readonly string[] = [id],
  text = '',
): string | null {
  return current?.format(url, id, aliases, text) ?? null;
}
