import { StorageKeys } from '@/core/types/common';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';

import { findProTrigger, isBadgeNode, renderBadge } from './badge';
import { type ObserverEvent, postToObserver, readObserverMessage } from './protocol';
import {
  EMPTY_PRO_USAGE,
  type ProUsageStore,
  accountKey,
  applyProQuota,
  bucketOf,
  isProSend,
  noteAccount,
  parseInitQuota,
  readProUsageStore,
  recordProSend,
  summarizeProUsage,
} from './usageStore';

export { CHATGPT_PRO_USAGE_MANIFEST, CHATGPT_PRO_USAGE_PLUGIN_ID } from './manifest';
export { bucketOf, readProUsageStore, summarizeProUsage } from './usageStore';

const STORAGE_KEY = StorageKeys.GV_CHATGPT_PRO_USAGE;
const RENDER_DELAY_MS = 100;
/** The week window moves with the clock even when nothing is sent. */
const CLOCK_REFRESH_MS = 60_000;

async function readStore(): Promise<ProUsageStore> {
  try {
    const result = await chrome.storage.local.get({ [STORAGE_KEY]: null });
    return readProUsageStore(result?.[STORAGE_KEY]);
  } catch {
    return EMPTY_PRO_USAGE;
  }
}

/**
 * Counts the Pro sends the page observer reports and shows this week's count
 * beside the model picker while Pro is selected. Everything stops with the
 * scope: the observer is disarmed, late reports are dropped and the label is
 * removed. Background registers the observer only while this plugin is on.
 */
export function activateChatGptProUsage(
  scope: PluginScope,
  _settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): void {
  const { signal } = scope;
  let store: ProUsageStore = EMPTY_PRO_USAGE;
  // No label until the observer answers: without it the count would silently stay at zero.
  let observerReady = false;
  // The account this page named (hashed); until it does, the store's last account is shown.
  let currentAccount: string | null | undefined;
  // init names limits per model: prefer the one this page last sent.
  let lastProModel: string | null = null;
  let renderPending = false;
  // One write at a time, each from a fresh read, so this tab never drops its own sends.
  let writes: Promise<void> = Promise.resolve();

  const shownAccount = (): string =>
    currentAccount === undefined
      ? (store.lastAccount ?? accountKey(null))
      : accountKey(currentAccount);

  const render = (): void => {
    if (signal.aborted) return;
    renderBadge(
      observerReady ? findProTrigger(adapter) : null,
      observerReady ? summarizeProUsage(bucketOf(store, shownAccount()), Date.now()) : null,
    );
  };

  const scheduleRender = (): void => {
    if (renderPending || signal.aborted) return;
    renderPending = true;
    scope.timer(() => {
      renderPending = false;
      render();
    }, RENDER_DELAY_MS);
  };

  const update = (change: (current: ProUsageStore) => ProUsageStore | null): void => {
    writes = writes
      .then(async () => {
        if (signal.aborted) return;
        const next = change(await readStore());
        if (!next || signal.aborted) return;
        store = next;
        try {
          await chrome.storage.local.set({ [STORAGE_KEY]: next });
        } catch {
          // Storage is gone with the extension context; the label still shows this page's count.
        }
        render();
      })
      // One failed write must not stall every later one.
      .catch(() => {});
  };

  const learnAccount = (account: string | null): void => {
    if (account === currentAccount) return;
    currentAccount = account;
    update((current) => noteAccount(current, account));
    render();
  };

  const handle = (event: ObserverEvent): void => {
    if (event.type === 'ready') {
      if (event.account !== undefined) learnAccount(event.account);
      if (observerReady) return;
      observerReady = true;
      // A ready we did not ask for is an observer that installed after us.
      postToObserver('arm');
      render();
      return;
    }
    if (event.type === 'account') {
      learnAccount(event.account);
      return;
    }
    const { account } = event;
    currentAccount = account;
    if (event.type === 'send') {
      if (!isProSend(event)) return;
      lastProModel = event.model;
      // The observer's clock is this page's clock; never date a send into the future.
      const at = Math.min(event.at, Date.now());
      update((current) => recordProSend(current, account, { at, key: event.key }, Date.now()));
      return;
    }
    const quota = parseInitQuota(event.payload, Date.now(), lastProModel);
    if (quota) update((current) => applyProQuota(current, account, quota));
  };

  scope.on(window, 'message', (event: Event) => {
    if (!(event instanceof MessageEvent)) return;
    const message = readObserverMessage(event);
    if (message) handle(message);
  });
  scope.effect(() => {
    postToObserver('arm');
    return () => postToObserver('disarm');
  }, 'chatgpt-pro-usage-arm');
  scope.effect(() => () => renderBadge(null, null), 'chatgpt-pro-usage-badge');

  void readStore().then((loaded) => {
    if (signal.aborted) return;
    store = loaded;
    render();
  });

  if (chrome.storage?.onChanged) {
    scope.onChromeEvent(
      chrome.storage.onChanged,
      (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
        if (areaName !== 'local' || !(STORAGE_KEY in changes)) return;
        store = readProUsageStore(changes[STORAGE_KEY].newValue);
        render();
      },
    );
  }

  // documentElement exists from document_start; body may not yet when the scope starts.
  if (document.documentElement) {
    scope.observe(
      document.documentElement,
      { childList: true, subtree: true, characterData: true },
      (records) => {
        // The label's own insertions would otherwise re-schedule a render forever.
        if (records.every((record) => isBadgeNode(record.target) || addsOnlyBadge(record))) return;
        scheduleRender();
      },
    );
  }
  scope.timer(render, CLOCK_REFRESH_MS, { repeat: true });
}

function addsOnlyBadge(record: MutationRecord): boolean {
  const changed = [...record.addedNodes, ...record.removedNodes];
  return changed.length > 0 && changed.every(isBadgeNode);
}
