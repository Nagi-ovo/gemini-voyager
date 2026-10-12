/**
 * The usage status runtime: account-scoped usage cache, `/usage` scraping,
 * silent refresh and the pill, for one run that lasts until `signal` aborts.
 *
 * The native module runs it with the `gvUsageStatusEnabled` switch, which only
 * hides the pill and pauses refresh while the page keeps being scraped. The
 * official plugin runs it without a switch: the plugin host only mounts it
 * while the switch is on. The MAIN-world bridge (`public/usage-observer.js`)
 * stays in core; a run only adds and removes its isolated-world listener.
 */
import browser from 'webextension-polyfill';

import { LoggerService } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { getCurrentLanguage, initI18n } from '@/utils/i18n';
import { localeFromLanguage } from '@/utils/language';

import { watchRouteChanges } from '../utils/routeWatcher';
import { formatResetLabel, hydrateUsageResetEpochs, scrapeUsageFromDocument } from './usageParsing';
import { createUsagePill } from './usagePill';
import { createUsageRefresh } from './usageRefresh';
import {
  isUsagePathname,
  mergeUsageSnapshots,
  selectUsageSnapshotForAccount,
  snapshotEquals,
  usageAccountKeyFromPathname,
  usageCacheKeyForAccount,
} from './usageSnapshot';
import type { UsageMetric, UsageSnapshot } from './usageSnapshot';

const SCRAPE_DEBOUNCE_MS = 300;
const SCRAPE_RETRY_MS = 500;
const NAVIGATION_SETTLE_MS = 250;

const logger = LoggerService.getInstance().createChild('UsageStatus');

type StorageChanges = Record<string, chrome.storage.StorageChange>;

/**
 * How the native module's switch reaches a run. The official plugin passes
 * none, so its run never reads the switch and always shows the pill.
 */
export interface UsageStatusSwitch {
  load(): Promise<boolean>;
  /** The switch's new value when `changes` carry it, otherwise `undefined`. */
  read(changes: StorageChanges, areaName: string): boolean | undefined;
}

interface UsageStatusRunOptions {
  signal: AbortSignal;
  usageSwitch?: UsageStatusSwitch;
}

/** The one running run; the owner table keeps the native module and the plugin apart. */
let activeRun: object | null = null;
let runSerial = 0;

function isOnUsagePage(): boolean {
  return isUsagePathname(location.pathname);
}

function currentUsageAccountKey(): string {
  return usageAccountKeyFromPathname(location.pathname);
}

async function saveSnapshot(next: UsageSnapshot): Promise<void> {
  try {
    await browser.storage.local.set({
      [usageCacheKeyForAccount(next.accountKey ?? currentUsageAccountKey())]: next,
      [StorageKeys.GV_USAGE_CACHE]: next,
    });
  } catch (error) {
    console.warn('[UsageStatus] Failed to persist usage cache:', error);
  }
}

async function loadSnapshot(
  accountKey: string,
  locale: string | undefined,
): Promise<UsageSnapshot | null> {
  try {
    const scopedKey = usageCacheKeyForAccount(accountKey);
    const result = await browser.storage.local.get([scopedKey, StorageKeys.GV_USAGE_CACHE]);
    const selected = selectUsageSnapshotForAccount(
      (result as Record<string, unknown>)[scopedKey],
      (result as Record<string, unknown>)[StorageKeys.GV_USAGE_CACHE],
      accountKey,
    );
    return selected
      ? hydrateUsageResetEpochs(selected, Date.now(), [
          document.documentElement.lang,
          locale,
          'en',
          'zh-CN',
          'zh-TW',
        ])
      : null;
  } catch (error) {
    console.warn('[UsageStatus] Failed to load usage cache:', error);
  }
  return null;
}

/**
 * Runs usage status until `signal` aborts. The promise settles once the run is
 * attached, or as soon as it learns it was stopped while reading storage.
 * Stopping removes the pill, listeners, observers and timers; it never deletes
 * the usage cache, recipe or pill position.
 */
export function runUsageStatus({ signal, usageSwitch }: UsageStatusRunOptions): Promise<void> {
  if (signal.aborted) return Promise.resolve();
  if (activeRun) {
    logger.error('Usage status is already running; the second start is ignored');
    return Promise.resolve();
  }
  const run = {};
  activeRun = run;
  const serial = ++runSerial;
  const isCurrent = (): boolean => activeRun === run;

  // Without a switch the plugin host only runs this while the switch is on.
  let enabled = usageSwitch === undefined;
  let snapshot: UsageSnapshot | null = null;
  // BCP-47 locale for reset-time formatting, derived from the Voyager language.
  let uiLocale: string | undefined;

  // Bumped whenever the account changes or the route leaves /usage, so a scrape
  // or read begun for the previous page cannot land in the next account's cache.
  let routeEpoch = 0;
  let routeAccountKey = currentUsageAccountKey();
  let routeOnUsage = isOnUsagePage();

  let scrapeObserver: MutationObserver | null = null;
  let scrapeTimer: number | null = null;
  let scrapeRetryTimer: number | null = null;
  let navigationTimer: number | null = null;
  let stopRouteWatcher: (() => void) | null = null;
  let storageListener: ((changes: StorageChanges, areaName: string) => void) | null = null;

  const pill = createUsagePill(() => refresh.requestReplay(true));
  const refresh = createUsageRefresh(
    () => ({ enabled, snapshot, locale: uiLocale, generation: serial }),
    (next) => {
      if (!isCurrent()) return;
      snapshot = next;
      void saveSnapshot(next);
      pill.render(enabled, snapshot);
    },
    pill.setSpinning,
  );

  function isCurrentRoute(epoch: number, accountKey: string): boolean {
    return isCurrent() && epoch === routeEpoch && accountKey === currentUsageAccountKey();
  }

  function scheduleScrape(epoch: number, accountKey: string): void {
    if (scrapeTimer !== null) return;
    scrapeTimer = window.setTimeout(() => {
      scrapeTimer = null;
      // The route poller may not have seen an account switch yet: the DOM read
      // now could still be the previous account's /usage page.
      if (!isCurrentRoute(epoch, accountKey) || !isOnUsagePage()) return;
      const next = scrapeUsageFromDocument();
      if (!next) return; // transient empty render — keep the last good snapshot
      snapshot = mergeUsageSnapshots(
        snapshot,
        { ...next, accountKey, sourceStartedAt: next.updatedAt, regressionVerified: true },
        { allowRegression: true },
      );
      void saveSnapshot(snapshot);
      pill.render(enabled, snapshot);
    }, SCRAPE_DEBOUNCE_MS);
  }

  /**
   * Watch the `/usage` page of `accountKey` as of route `epoch`. The observer
   * and its retry keep that identity: reading the account again when the DOM
   * mutates would file the previous account's page under an account the route
   * poller has not noticed yet (pushState sends no popstate).
   */
  function setupScrapeObserver(epoch: number, accountKey: string): void {
    if (!isCurrentRoute(epoch, accountKey) || !isOnUsagePage()) return;

    const root = document.querySelector('usage-metrics-window, .usage-metrics-container');
    if (!root) {
      // Angular hasn't mounted the usage component yet; retry shortly.
      if (scrapeRetryTimer === null) {
        scrapeRetryTimer = window.setTimeout(() => {
          scrapeRetryTimer = null;
          setupScrapeObserver(epoch, accountKey);
        }, SCRAPE_RETRY_MS);
      }
      return;
    }
    if (scrapeRetryTimer !== null) {
      clearTimeout(scrapeRetryTimer);
      scrapeRetryTimer = null;
    }

    scheduleScrape(epoch, accountKey);
    scrapeObserver?.disconnect();
    scrapeObserver = new MutationObserver(() => scheduleScrape(epoch, accountKey));
    scrapeObserver.observe(root, { childList: true, subtree: true, characterData: true });
  }

  function teardownScrapeObserver(): void {
    scrapeObserver?.disconnect();
    scrapeObserver = null;
    if (scrapeTimer !== null) {
      clearTimeout(scrapeTimer);
      scrapeTimer = null;
    }
    if (scrapeRetryTimer !== null) {
      clearTimeout(scrapeRetryTimer);
      scrapeRetryTimer = null;
    }
  }

  /** Re-localize a metric's reset label from its epoch (used on language change). */
  function reformatReset(m: UsageMetric): string {
    return typeof m.resetEpoch === 'number'
      ? formatResetLabel(m.resetEpoch, Date.now(), uiLocale)
      : m.resetLabel;
  }

  function setupStorageListener(): void {
    storageListener = (changes, areaName) => {
      const switched = usageSwitch?.read(changes, areaName);
      if (switched !== undefined) {
        enabled = switched;
        pill.render(enabled, snapshot);
        refresh.setEnabled(enabled);
        return;
      }
      if (changes[StorageKeys.LANGUAGE]) {
        // Voyager language changed — re-localize reset dates + labels.
        void getCurrentLanguage().then((lang) => {
          if (!isCurrent()) return;
          uiLocale = localeFromLanguage(lang);
          if (snapshot) {
            // Reformat reset labels under the new locale.
            snapshot = {
              ...snapshot,
              daily: snapshot.daily
                ? { ...snapshot.daily, resetLabel: reformatReset(snapshot.daily) }
                : null,
              weekly: snapshot.weekly
                ? { ...snapshot.weekly, resetLabel: reformatReset(snapshot.weekly) }
                : null,
            };
          }
          pill.render(enabled, snapshot);
        });
      }
      const accountKey = currentUsageAccountKey();
      const usageCacheChange =
        areaName === 'local'
          ? (changes[usageCacheKeyForAccount(accountKey)] ?? changes[StorageKeys.GV_USAGE_CACHE])
          : null;
      if (usageCacheChange) {
        const raw = usageCacheChange.newValue as UsageSnapshot | undefined;
        if (raw && typeof raw.updatedAt === 'number' && raw.accountKey === accountKey) {
          const merged = mergeUsageSnapshots(snapshot, raw, {
            allowRegression: raw.regressionVerified === true,
          });
          if (!snapshotEquals(merged, raw)) void saveSnapshot(merged);
          snapshot = merged;
          pill.render(enabled, snapshot);
        }
      }
      if (areaName === 'local' && changes[StorageKeys.GV_USAGE_RECIPE]) {
        // Another tab calibrated the recipe — adopt it so this tab can replay too.
        refresh.adoptRecipe(changes[StorageKeys.GV_USAGE_RECIPE].newValue);
      }
      if (areaName === 'local' && changes[StorageKeys.GV_USAGE_POS]) {
        // Another tab moved the bar — mirror its placement.
        pill.adoptPosition(changes[StorageKeys.GV_USAGE_POS].newValue);
      }
    };
    browser.storage.onChanged.addListener(storageListener);
  }

  /** Reload the account's cache and re-aim the scraper once the route settles. */
  function handleNavigation(): void {
    refresh.clearRegressionConfirmation();
    if (navigationTimer !== null) clearTimeout(navigationTimer);
    const epoch = routeEpoch;
    const accountKey = currentUsageAccountKey();
    navigationTimer = window.setTimeout(() => {
      navigationTimer = null;
      void (async () => {
        const next = await loadSnapshot(accountKey, uiLocale);
        if (!isCurrentRoute(epoch, accountKey)) return;
        snapshot = next;
        if (isOnUsagePage()) {
          setupScrapeObserver(epoch, accountKey);
        } else {
          teardownScrapeObserver();
        }
        pill.render(enabled, snapshot);
        if (enabled) refresh.maybeReplay();
      })();
    }, NAVIGATION_SETTLE_MS);
  }

  function handleRouteChange(): void {
    const accountKey = currentUsageAccountKey();
    const onUsage = isOnUsagePage();
    if (accountKey !== routeAccountKey || (routeOnUsage && !onUsage)) {
      // Stop reading the old page now: waiting for the settle delay and the
      // cache read let its DOM be scraped under the new account's key.
      routeEpoch += 1;
      teardownScrapeObserver();
    }
    routeAccountKey = accountKey;
    routeOnUsage = onUsage;
    handleNavigation();
  }

  signal.addEventListener(
    'abort',
    () => {
      if (!isCurrent()) return;
      activeRun = null;
      routeEpoch += 1;
      if (navigationTimer !== null) {
        clearTimeout(navigationTimer);
        navigationTimer = null;
      }
      teardownScrapeObserver();
      refresh.stop();
      pill.remove();
      stopRouteWatcher?.();
      stopRouteWatcher = null;
      if (storageListener) {
        browser.storage.onChanged.removeListener(storageListener);
        storageListener = null;
      }
    },
    { once: true },
  );

  return (async () => {
    // Ensure the language is resolved before the first render so labels and
    // reset dates localize correctly (no frozen English).
    try {
      await initI18n();
      const language = await getCurrentLanguage();
      if (!isCurrent()) return;
      uiLocale = localeFromLanguage(language);
    } catch {
      // best-effort — English fallback is acceptable
    }
    if (!isCurrent()) return;

    if (usageSwitch) {
      const on = await usageSwitch.load();
      if (!isCurrent()) return;
      enabled = on;
    }
    const loadedAccountKey = currentUsageAccountKey();
    const loaded = await loadSnapshot(loadedAccountKey, uiLocale);
    if (!isCurrent()) return;
    await refresh.loadRecipe();
    if (!isCurrent()) return;
    await pill.loadPosition();
    if (!isCurrent()) return;

    // The route moved to another account during the reads: never show or merge
    // the previous account's cache here; the navigation below loads the right one.
    const accountMoved = loadedAccountKey !== currentUsageAccountKey();
    snapshot = accountMoved ? null : loaded;
    routeAccountKey = currentUsageAccountKey();
    routeOnUsage = isOnUsagePage();

    setupStorageListener();
    refresh.start();
    if (isOnUsagePage()) setupScrapeObserver(routeEpoch, routeAccountKey);
    pill.render(enabled, snapshot);
    if (enabled) refresh.setEnabled(true);
    stopRouteWatcher = watchRouteChanges(handleRouteChange);
    if (accountMoved) handleNavigation();
  })();
}

/**
 * Usage status as the official plugin runs it: no switch is read, the pill
 * shows for as long as `signal` is live.
 */
export function startUsageStatusRuntime({ signal }: { signal: AbortSignal }): Promise<void> {
  return runUsageStatus({ signal });
}
