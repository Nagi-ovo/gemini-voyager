/** Account-scoped usage cache, DOM scraping and silent refresh for Gemini. */
import browser from 'webextension-polyfill';

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

// -----------------------------------------------------------------------------
// Module state
// -----------------------------------------------------------------------------

let started = false;
let generation = 0;
let enabled = false;
let snapshot: UsageSnapshot | null = null;

let scrapeObserver: MutationObserver | null = null;
let scrapeTimer: number | null = null;
let scrapeRetryTimer: number | null = null;
let navigationTimer: number | null = null;
let stopRouteWatcher: (() => void) | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
// BCP-47 locale for reset-time formatting, derived from the Voyager language.
let uiLocale: string | undefined;

const pill = createUsagePill(() => refresh.requestReplay(true));
const refresh = createUsageRefresh(
  () => ({ enabled, snapshot, locale: uiLocale, generation }),
  (next) => {
    snapshot = next;
    void saveSnapshot(next);
    pill.render(enabled, snapshot);
  },
  pill.setSpinning,
);

// -----------------------------------------------------------------------------
// Account cache and usage-page observation
// -----------------------------------------------------------------------------

function isCurrentGeneration(expected: number): boolean {
  return started && generation === expected;
}

function isOnUsagePage(): boolean {
  return isUsagePathname(location.pathname);
}

function currentUsageAccountKey(): string {
  return usageAccountKeyFromPathname(location.pathname);
}

function currentUsageCacheKey(): string {
  return usageCacheKeyForAccount(currentUsageAccountKey());
}

function scopeSnapshot(next: UsageSnapshot): UsageSnapshot {
  return {
    ...next,
    accountKey: currentUsageAccountKey(),
    sourceStartedAt: next.updatedAt,
    regressionVerified: true,
  };
}

function isCurrentAccountSnapshot(raw: UsageSnapshot | null | undefined): raw is UsageSnapshot {
  return raw?.accountKey === currentUsageAccountKey();
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

async function loadSnapshot(): Promise<UsageSnapshot | null> {
  try {
    const accountKey = currentUsageAccountKey();
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
          uiLocale,
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

function scheduleScrape(): void {
  if (scrapeTimer !== null) return;
  scrapeTimer = window.setTimeout(() => {
    scrapeTimer = null;
    const next = scrapeUsageFromDocument();
    if (!next) return; // transient empty render — keep the last good snapshot
    snapshot = mergeUsageSnapshots(snapshot, scopeSnapshot(next), { allowRegression: true });
    void saveSnapshot(snapshot);
    pill.render(enabled, snapshot);
  }, SCRAPE_DEBOUNCE_MS);
}

function setupScrapeObserver(): void {
  if (!isOnUsagePage()) return;

  const root = document.querySelector('usage-metrics-window, .usage-metrics-container');
  if (!root) {
    // Angular hasn't mounted the usage component yet; retry shortly.
    if (scrapeRetryTimer === null) {
      scrapeRetryTimer = window.setTimeout(() => {
        scrapeRetryTimer = null;
        setupScrapeObserver();
      }, 500);
    }
    return;
  }
  if (scrapeRetryTimer !== null) {
    clearTimeout(scrapeRetryTimer);
    scrapeRetryTimer = null;
  }

  scheduleScrape();
  scrapeObserver?.disconnect();
  scrapeObserver = new MutationObserver(() => scheduleScrape());
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

// -----------------------------------------------------------------------------
// Settings + lifecycle
// -----------------------------------------------------------------------------

async function loadEnabled(): Promise<boolean> {
  try {
    const sync = await browser.storage.sync.get({ [StorageKeys.USAGE_STATUS_ENABLED]: false });
    return (sync as Record<string, unknown>)[StorageKeys.USAGE_STATUS_ENABLED] === true;
  } catch {
    return false;
  }
}

function setupStorageListener(): void {
  storageListener = (changes, areaName) => {
    if (areaName === 'sync' && changes[StorageKeys.USAGE_STATUS_ENABLED]) {
      enabled = changes[StorageKeys.USAGE_STATUS_ENABLED].newValue === true;
      pill.render(enabled, snapshot);
      refresh.setEnabled(enabled);
      return;
    }
    if (changes[StorageKeys.LANGUAGE]) {
      const currentGeneration = generation;
      // Voyager language changed — re-localize reset dates + labels.
      void getCurrentLanguage().then((lang) => {
        if (!isCurrentGeneration(currentGeneration)) return;
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
    const usageCacheChange =
      areaName === 'local'
        ? (changes[currentUsageCacheKey()] ?? changes[StorageKeys.GV_USAGE_CACHE])
        : null;
    if (usageCacheChange) {
      const raw = usageCacheChange.newValue as UsageSnapshot | undefined;
      if (raw && typeof raw.updatedAt === 'number' && isCurrentAccountSnapshot(raw)) {
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

function handleNavigation(): void {
  refresh.clearRegressionConfirmation();
  if (navigationTimer !== null) clearTimeout(navigationTimer);
  const currentGeneration = generation;
  const accountKey = currentUsageAccountKey();
  navigationTimer = window.setTimeout(() => {
    navigationTimer = null;
    void (async () => {
      const next = await loadSnapshot();
      if (!isCurrentGeneration(currentGeneration) || accountKey !== currentUsageAccountKey())
        return;
      snapshot = next;
      if (isOnUsagePage()) {
        setupScrapeObserver();
      } else {
        teardownScrapeObserver();
      }
      pill.render(enabled, snapshot);
      if (enabled) refresh.maybeReplay();
    })();
  }, 250);
}

export async function startUsageStatus(): Promise<() => void> {
  if (started) return () => {};
  started = true;
  generation += 1;

  // Ensure the language is resolved before the first render so labels and reset
  // dates localize correctly (no frozen English).
  try {
    await initI18n();
    uiLocale = localeFromLanguage(await getCurrentLanguage());
  } catch {
    // best-effort — English fallback is acceptable
  }

  enabled = await loadEnabled();
  snapshot = await loadSnapshot();
  await refresh.loadRecipe();
  await pill.loadPosition();
  setupStorageListener();
  refresh.start();

  if (isOnUsagePage()) setupScrapeObserver();
  pill.render(enabled, snapshot);
  if (enabled) refresh.setEnabled(true);

  stopRouteWatcher = watchRouteChanges(handleNavigation);

  return () => {
    started = false;
    generation += 1;
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
  };
}
