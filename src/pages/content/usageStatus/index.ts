/**
 * Usage Status — a slim daily/weekly usage pill anchored above Gemini's
 * composer, implementing the "show remaining quota" request (#690).
 *
 * Two responsibilities, mirroring the gemsSidebar pattern (scrape-on-a-special
 * page → cache → render everywhere):
 *
 *   1. **Scraper** (runs only on `/usage`): Gemini renders the live usage
 *      numbers into an Angular `usage-metrics-window` component. Whenever the
 *      user visits `/usage` we parse the two metric blocks (`.gxu-currently`
 *      daily bucket + `.gxu-weekly` weekly limit) plus the plan tier and write a
 *      {@link UsageSnapshot} to an account-scoped local cache. A MutationObserver
 *      keeps it fresh while the page is open. No network calls of our own — the
 *      data path is pure DOM.
 *
 *   2. **Injector** (runs on every Gemini page): render a fixed pill just above
 *      the composer from the cached snapshot — a tier badge, an "updated X ago"
 *      stamp, and two thin progress bars (daily + weekly) with percent + reset
 *      time. Clicking it opens `/usage`; the refresh control re-scrapes when
 *      already on `/usage`, otherwise opens it in a new tab. The pill survives
 *      Gemini's frequent re-renders by re-anchoring to the prompt rect on a
 *      cheap interval.
 *
 * Silent background refresh (so the user never has to open `/usage`) is layered
 * on top of this in a follow-up via a document_start network observer; this
 * module is the self-contained, DOM-only foundation it builds on.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';
import { decodeBatchExecute } from '@/core/utils/batchexecute';
import { getCurrentLanguage, getTranslationSync, initI18n } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

import { watchRouteChanges } from '../utils/routeWatcher';
import { USAGE_REFRESH_ICON } from './icons';

/** Map a Voyager language to a BCP-47 tag for Intl date formatting. */
function localeFromLanguage(lang: AppLanguage): string {
  if (lang === 'zh') return 'zh-CN';
  if (lang === 'zh_TW') return 'zh-TW';
  return lang;
}

/** One usage bucket as we cache and render it. */
export interface UsageMetric {
  /** Percent used, 0-100 (Gemini renders an integer like `0% used`). */
  percent: number;
  /** Human reset label, e.g. `12:47 AM` (DOM scrape) or formatted from epoch. */
  resetLabel: string;
  /** Reset time as epoch seconds when known (RPC path); enables reformatting. */
  resetEpoch?: number;
}

/** A metric parsed from the usage RPC payload (precise fraction + reset epoch). */
export interface RawMetric {
  percent: number;
  resetEpoch: number;
}

interface ParsedMetric {
  metric: RawMetric;
  period: number;
}

/** Captured recipe for replaying the usage RPC from any page. */
interface UsageRecipe {
  rpcid: string;
  args: string;
}

interface MergeUsageSnapshotOptions {
  allowRegression?: boolean;
  allowDailyRegression?: boolean;
  allowWeeklyRegression?: boolean;
  now?: number;
}

export interface AutomaticUsageMergeResult {
  snapshot: UsageSnapshot;
  candidate: UsageSnapshot | null;
  needsConfirmation: boolean;
}

/** Snapshot persisted in chrome.storage.local. Small by construction. */
export interface UsageSnapshot {
  /** Rolling "Current usage" bucket (resets daily). Null if unparsed. */
  daily: UsageMetric | null;
  /** "Weekly limit" bucket. Null if unparsed. */
  weekly: UsageMetric | null;
  /** Plan tier badge, e.g. `PRO`. Optional — purely cosmetic. */
  tier?: string;
  /** Gemini account namespace from the URL, e.g. `u/0` or `default`. */
  accountKey?: string;
  /** When the replay producing this snapshot started; rejects late older responses. */
  sourceStartedAt?: number;
  /** True when a lower value was verified by DOM/manual refresh/two fresh RPCs. */
  regressionVerified?: boolean;
  /** Date.now() when scraped, for the "updated X ago" stamp. */
  updatedAt: number;
}

export type UsagePillMode = 'hidden' | 'empty' | 'ready';

const PILL_ID = 'gv-usage-pill';
const SCRAPE_DEBOUNCE_MS = 300;
// Refresh the relative "updated X ago" stamp without re-scraping.
const STAMP_REFRESH_MS = 30_000;
// Bridge to the MAIN-world usage-observer (document_start). Must match the
// `source` strings in public/usage-observer.js.
const OBS_SRC = 'gv-usage-observer';
const OBS_CMD = 'gv-usage-observer-cmd';
// Silent refresh. Usage only changes when the user sends a message, so the
// primary trigger is event-driven (a generation completing); these are the
// conservative idle fallbacks. Larger intervals = fewer requests = lower
// detection surface; the replay is the same call the page makes, with the
// user's own tokens, at human cadence.
const STALE_MS = 5 * 60_000; // consider a snapshot stale after 5 min
const HEARTBEAT_MS = 2 * 60_000; // idle re-check cadence (staleness-gated)
const GEN_DEBOUNCE_MS = 4_000; // wait after a generation completes, then refresh
const REGRESSION_CONFIRM_MS = 2_000;
const RESET_GRACE_MS = 2 * 60_000;
const AUTO_REGRESSION_TOLERANCE_PCT = 5;
// Known usage RPC (verified live: rpcid `jSf9Qc`, empty args). Used as the
// out-of-the-box recipe so silent refresh works on enable without first cold-
// loading /usage; the document_start observer re-calibrates (DOM-verified) if
// Google rotates the obfuscated id.
const DEFAULT_RECIPE: UsageRecipe = { rpcid: 'jSf9Qc', args: '[]' };

const KNOWN_TIERS = /\b(?:GOOGLE\s+AI\s+)?(?:FREE|PRO|ULTRA|ADVANCED|BUSINESS|ENTERPRISE)\b/i;

// -----------------------------------------------------------------------------
// Module state
// -----------------------------------------------------------------------------

let started = false;
let enabled = false;
let snapshot: UsageSnapshot | null = null;

let scrapeObserver: MutationObserver | null = null;
let scrapeTimer: number | null = null;
let scrapeRetryTimer: number | null = null;
let stampTimer: number | null = null;
let stopRouteWatcher: (() => void) | null = null;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let pill: HTMLElement | null = null;
let observerMessageHandler: ((ev: MessageEvent) => void) | null = null;
let observerReady = false;
// User-placed position (viewport px, top-left). Null = default bottom-right.
let dragPos: { x: number; y: number } | null = null;
let dragging = false;
let dragMoved = false;
let dragOffset = { x: 0, y: 0 };
let dragStart = { x: 0, y: 0 };
let pillMoveHandler: ((ev: PointerEvent) => void) | null = null;
let recipe: UsageRecipe | null = null;
let replayTimer: number | null = null;
let replaySeq = 0;
const replayRequests = new Map<number, { allowRegression: boolean; startedAt: number }>();
let pendingRegression: UsageSnapshot | null = null;
let regressionConfirmTimer: number | null = null;
let genTimer: number | null = null;
let spinTimer: number | null = null;
let visibilityHandler: (() => void) | null = null;
// BCP-47 locale for reset-time formatting, derived from the Voyager language.
let uiLocale: string | undefined;

const t = (key: TranslationKey, fallback: string): string => {
  const value = getTranslationSync(key);
  return value === key ? fallback : value;
};

// -----------------------------------------------------------------------------
// Scraper (pure helpers are exported for unit tests)
// -----------------------------------------------------------------------------

export function isUsagePathname(pathname: string): boolean {
  return /^\/(?:u\/\d+\/)?usage(?:\/|$)/.test(pathname);
}

function isOnUsagePage(): boolean {
  return isUsagePathname(location.pathname);
}

export function usageAccountKeyFromPathname(pathname: string): string {
  const match = pathname.match(/^\/u\/(\d+)(?:\/|$)/);
  return match ? `u/${match[1]}` : 'default';
}

function currentUsageAccountKey(): string {
  return usageAccountKeyFromPathname(location.pathname);
}

export function usageCacheKeyForAccount(accountKey: string): string {
  return `${StorageKeys.GV_USAGE_CACHE}:${accountKey}`;
}

function currentUsageCacheKey(): string {
  return usageCacheKeyForAccount(currentUsageAccountKey());
}

export function usageUrlForPathname(pathname: string): string {
  return `https://gemini.google.com${usagePathForPathname(pathname)}`;
}

export function usagePathForPathname(pathname: string): string {
  const match = pathname.match(/^\/u\/\d+(?=\/|$)/);
  return `${match?.[0] ?? ''}/usage`;
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

function sameResetWindow(current: UsageMetric, next: UsageMetric): boolean {
  if (typeof current.resetEpoch === 'number' && typeof next.resetEpoch === 'number') {
    return current.resetEpoch === next.resetEpoch;
  }
  return !!current.resetLabel && current.resetLabel === next.resetLabel;
}

function metricRegresses(current: UsageMetric | null, next: UsageMetric | null): boolean {
  return !!current && !!next && next.percent < current.percent;
}

function resetBoundaryHasPassed(current: UsageMetric, next: UsageMetric, now: number): boolean {
  if (typeof current.resetEpoch !== 'number' || typeof next.resetEpoch !== 'number') return false;
  return next.resetEpoch > current.resetEpoch && now >= current.resetEpoch * 1000 - RESET_GRACE_MS;
}

function shouldKeepCurrentMetric(
  current: UsageMetric | null,
  next: UsageMetric | null,
  options: MergeUsageSnapshotOptions,
): boolean {
  if (!metricRegresses(current, next)) return false;
  if (options.allowRegression) return false;
  if (!current || !next) return false;
  if (sameResetWindow(current, next)) return true;
  if (current.percent - next.percent <= AUTO_REGRESSION_TOLERANCE_PCT) return false;
  return !resetBoundaryHasPassed(current, next, options.now ?? Date.now());
}

function metricEquals(a: UsageMetric | null, b: UsageMetric | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.percent === b.percent && a.resetLabel === b.resetLabel && a.resetEpoch === b.resetEpoch;
}

/**
 * DOM snapshots do not carry an epoch. Keep the precise RPC reset time while
 * it is still in the future so a later DOM scrape cannot erase the countdown.
 */
function preserveFutureResetEpoch(
  current: UsageMetric | null,
  next: UsageMetric | null,
  now: number,
): UsageMetric | null {
  if (
    !current ||
    !next ||
    typeof next.resetEpoch === 'number' ||
    typeof current.resetEpoch !== 'number' ||
    current.resetEpoch * 1000 <= now
  ) {
    return next;
  }
  return { ...next, resetEpoch: current.resetEpoch };
}

function snapshotEquals(a: UsageSnapshot, b: UsageSnapshot): boolean {
  return (
    a.accountKey === b.accountKey &&
    a.tier === b.tier &&
    a.sourceStartedAt === b.sourceStartedAt &&
    a.regressionVerified === b.regressionVerified &&
    a.updatedAt === b.updatedAt &&
    metricEquals(a.daily, b.daily) &&
    metricEquals(a.weekly, b.weekly)
  );
}

export function mergeUsageSnapshots(
  current: UsageSnapshot | null,
  next: UsageSnapshot,
  options: MergeUsageSnapshotOptions = {},
): UsageSnapshot {
  if (!current || current.accountKey !== next.accountKey) return next;
  if (
    typeof current.sourceStartedAt === 'number' &&
    typeof next.sourceStartedAt === 'number' &&
    next.sourceStartedAt < current.sourceStartedAt
  ) {
    return current;
  }

  const keepDaily = shouldKeepCurrentMetric(current.daily, next.daily, {
    ...options,
    allowRegression: options.allowRegression || options.allowDailyRegression,
  });
  const keepWeekly = shouldKeepCurrentMetric(current.weekly, next.weekly, {
    ...options,
    allowRegression: options.allowRegression || options.allowWeeklyRegression,
  });
  const now = options.now ?? Date.now();
  const daily = keepDaily
    ? current.daily
    : preserveFutureResetEpoch(current.daily, next.daily, now);
  const weekly = keepWeekly
    ? current.weekly
    : preserveFutureResetEpoch(current.weekly, next.weekly, now);

  if (!keepDaily && !keepWeekly) {
    if (daily === next.daily && weekly === next.weekly) return next;
    return { ...next, daily, weekly };
  }

  return {
    ...next,
    daily,
    weekly,
    tier: next.tier ?? current.tier,
    updatedAt: current.updatedAt,
  };
}

function confirmsLowerMetric(
  current: UsageMetric | null,
  candidate: UsageMetric | null,
  next: UsageMetric | null,
): boolean {
  if (!current || !candidate || !next) return false;
  return (
    candidate.percent < current.percent &&
    next.percent < current.percent &&
    sameResetWindow(candidate, next)
  );
}

/**
 * Keep a suspicious automatic decrease once, then accept it after a second
 * fresh RPC confirms the same reset window. This preserves the stale-response
 * guard while allowing real entitlement changes such as #820 (7% -> 1%).
 */
export function mergeAutomaticUsageSnapshots(
  current: UsageSnapshot | null,
  candidate: UsageSnapshot | null,
  next: UsageSnapshot,
  now: number = Date.now(),
): AutomaticUsageMergeResult {
  if (!current || current.accountKey !== next.accountKey) {
    return { snapshot: next, candidate: null, needsConfirmation: false };
  }
  if (
    typeof current.sourceStartedAt === 'number' &&
    typeof next.sourceStartedAt === 'number' &&
    next.sourceStartedAt < current.sourceStartedAt
  ) {
    return {
      snapshot: current,
      candidate,
      needsConfirmation: candidate !== null,
    };
  }

  const mergeOptions = { now };
  const blockedDaily = shouldKeepCurrentMetric(current.daily, next.daily, mergeOptions);
  const blockedWeekly = shouldKeepCurrentMetric(current.weekly, next.weekly, mergeOptions);
  const sameCandidateAccount = candidate?.accountKey === next.accountKey;
  const confirmDaily =
    blockedDaily &&
    sameCandidateAccount &&
    confirmsLowerMetric(current.daily, candidate?.daily ?? null, next.daily);
  const confirmWeekly =
    blockedWeekly &&
    sameCandidateAccount &&
    confirmsLowerMetric(current.weekly, candidate?.weekly ?? null, next.weekly);

  const merged = mergeUsageSnapshots(current, next, {
    now,
    allowDailyRegression: confirmDaily,
    allowWeeklyRegression: confirmWeekly,
  });
  const needsConfirmation = (blockedDaily && !confirmDaily) || (blockedWeekly && !confirmWeekly);
  const acceptedRegression =
    (metricRegresses(current.daily, next.daily) && !blockedDaily) ||
    (metricRegresses(current.weekly, next.weekly) && !blockedWeekly) ||
    confirmDaily ||
    confirmWeekly;

  return {
    snapshot: acceptedRegression ? { ...merged, regressionVerified: true } : merged,
    candidate: needsConfirmation ? next : null,
    needsConfirmation,
  };
}

/** First `N% ...` percentage in a block of text, or null. */
function parsePercent(text: string): number | null {
  const match = text.match(/(\d+(?:\.\d+)?)\s*%/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

/**
 * Reset label for a metric block. Prefers the dedicated `reset-time` element
 * Gemini renders; strips a leading "Resets"/"Resets at" prefix (English UI)
 * while leaving other languages untouched so we still show *something*.
 */
function parseResetLabel(block: Element): string {
  const resetEl = block.querySelector('[class*="reset-time"]');
  const raw = (resetEl?.textContent ?? '').trim();
  if (!raw) return '';
  return raw.replace(/^resets?\b[\s:]*(?:at\b[\s:]*)?/i, '').trim() || raw;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeLocalizedDigits(text: string, locale: string): string {
  let normalized = text.normalize('NFKC').replace(/\u00a0/g, ' ');
  try {
    const formatter = new Intl.NumberFormat(locale, { useGrouping: false });
    for (let digit = 0; digit <= 9; digit += 1) {
      const localized = formatter
        .formatToParts(digit)
        .find((part) => part.type === 'integer')?.value;
      if (localized && localized !== String(digit)) {
        normalized = normalized.replaceAll(localized, String(digit));
      }
    }
  } catch {
    // Invalid/unsupported locale — ASCII digits still cover Gemini's fallback UI.
  }
  return normalized.toLocaleLowerCase(locale).replace(/\s+/g, ' ').trim();
}

function localizedDayPeriod(locale: string, hour: number): string {
  try {
    return (
      new Intl.DateTimeFormat(locale, { hour: 'numeric', hour12: true })
        .formatToParts(new Date(2024, 0, 1, hour))
        .find((part) => part.type === 'dayPeriod')?.value ?? ''
    );
  } catch {
    return '';
  }
}

function parseLocalizedMonthDay(
  text: string,
  locale: string,
): { month: number; day: number } | null {
  for (const monthStyle of ['long', 'short', 'numeric'] as const) {
    for (let month = 0; month < 12; month += 1) {
      try {
        const parts = new Intl.DateTimeFormat(locale, {
          month: monthStyle,
          day: 'numeric',
        }).formatToParts(new Date(2024, month, 23, 12));
        if (!parts.some((part) => part.type === 'month')) continue;
        const pattern = parts
          .map((part) => {
            if (part.type === 'day') return '(\\d{1,2})';
            const value = normalizeLocalizedDigits(part.value, locale);
            if (part.type === 'literal' && !value) return '\\s*';
            return `${escapeRegex(value).replace(/\s+/g, '\\s*')}\\s*`;
          })
          .join('');
        const match = text.match(new RegExp(pattern, 'iu'));
        if (!match) continue;
        const day = Number(match[1]);
        if (day >= 1 && day <= 31) return { month, day };
      } catch {
        // Try the next representation; Intl can reject an unexpected locale.
      }
    }
  }
  return null;
}

/** Convert Gemini's localized reset text into a local epoch for the countdown. */
export function parseResetEpoch(
  text: string,
  now: number,
  locale: string = 'en',
): number | undefined {
  const normalized = normalizeLocalizedDigits(text, locale || 'en');
  const timeMatch = normalized.match(/(\d{1,2})\s*[:：.]\s*(\d{2})/u);
  if (!timeMatch) return undefined;

  let hour = Number(timeMatch[1]);
  const minute = Number(timeMatch[2]);
  if (hour > 23 || minute > 59) return undefined;

  const amTokens = [localizedDayPeriod(locale, 1), 'am', 'a.m.', '上午', '凌晨'];
  const pmTokens = [localizedDayPeriod(locale, 13), 'pm', 'p.m.', '下午', '晚上', '中午'];
  const hasToken = (tokens: string[]): boolean =>
    tokens.some((token) => token && normalized.includes(normalizeLocalizedDigits(token, locale)));
  if (hasToken(pmTokens) && hour < 12) hour += 12;
  else if (hasToken(amTokens) && hour === 12) hour = 0;

  const nowDate = new Date(now);
  const monthDay = [...new Set([locale || 'en', 'en', 'zh-CN', 'zh-TW'])]
    .map((candidateLocale) => parseLocalizedMonthDay(normalized, candidateLocale))
    .find((value) => value !== null);
  const candidate = monthDay
    ? new Date(nowDate.getFullYear(), monthDay.month, monthDay.day, hour, minute)
    : new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate(), hour, minute);

  if (monthDay) {
    // The UI omits the year. A January date shown in December belongs to next year.
    if (candidate.getTime() < now - 180 * 24 * 60 * 60_000) {
      candidate.setFullYear(candidate.getFullYear() + 1);
    }
  } else if (candidate.getTime() <= now) {
    // A time-only reset label denotes the next occurrence in the user's timezone.
    candidate.setDate(candidate.getDate() + 1);
  }

  return Math.floor(candidate.getTime() / 1000);
}

/** Upgrade older DOM-only caches so the countdown works before /usage is revisited. */
export function hydrateUsageResetEpochs(
  snapshot: UsageSnapshot,
  now: number,
  locales: Array<string | undefined>,
): UsageSnapshot {
  const candidates = [...new Set(locales.filter((locale): locale is string => !!locale))];
  const hydrate = (metric: UsageMetric | null): UsageMetric | null => {
    if (!metric || typeof metric.resetEpoch === 'number') return metric;
    for (const locale of candidates) {
      const resetEpoch = parseResetEpoch(metric.resetLabel, now, locale);
      if (typeof resetEpoch === 'number') return { ...metric, resetEpoch };
    }
    return metric;
  };
  const daily = hydrate(snapshot.daily);
  const weekly = hydrate(snapshot.weekly);
  return daily === snapshot.daily && weekly === snapshot.weekly
    ? snapshot
    : { ...snapshot, daily, weekly };
}

function parseMetric(block: Element | null, now: number): UsageMetric | null {
  if (!block) return null;
  const percent = parsePercent(block.textContent ?? '');
  if (percent === null) return null;
  const resetText = (block.querySelector('[class*="reset-time"]')?.textContent ?? '').trim();
  const resetEpoch = parseResetEpoch(
    resetText,
    now,
    block.ownerDocument.documentElement.lang || 'en',
  );
  return {
    percent,
    resetLabel: parseResetLabel(block),
    ...(typeof resetEpoch === 'number' ? { resetEpoch } : {}),
  };
}

function parseTier(root: Element): string | undefined {
  // Tier badge ("PRO") renders near the header, before the body copy. Match a
  // known tier token in the header region to avoid grabbing stray words.
  const header = root.querySelector('.usage-metrics-header') ?? root;
  const match = (header.textContent ?? '').match(KNOWN_TIERS);
  return match ? match[0].replace(/\s+/g, ' ').trim().toUpperCase() : undefined;
}

/**
 * Parse the rendered `/usage` page into a {@link UsageSnapshot}. Pure /
 * side-effect-free (DOM in, data out) so it can be unit-tested in isolation.
 * Returns null when the usage component isn't present or neither bucket parses
 * — callers treat null as "don't clobber the cache".
 */
export function scrapeUsageFromDocument(
  doc: Document = document,
  now: number = Date.now(),
): UsageSnapshot | null {
  const root =
    doc.querySelector('usage-metrics-window') ?? doc.querySelector('.usage-metrics-container');
  if (!root) return null;

  const daily = parseMetric(root.querySelector('.gxu-currently'), now);
  const weekly = parseMetric(root.querySelector('.gxu-weekly'), now);
  if (!daily && !weekly) return null;

  return { daily, weekly, tier: parseTier(root), updatedAt: now };
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

export function selectUsageSnapshotForAccount(
  scoped: unknown,
  legacy: unknown,
  accountKey: string,
): UsageSnapshot | null {
  const isMatch = (raw: unknown): raw is UsageSnapshot =>
    !!raw &&
    typeof raw === 'object' &&
    typeof (raw as UsageSnapshot).updatedAt === 'number' &&
    (raw as UsageSnapshot).accountKey === accountKey;

  if (isMatch(scoped)) return scoped;
  if (isMatch(legacy)) return legacy;
  return null;
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
    render();
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

// -----------------------------------------------------------------------------
// RPC parsing (silent refresh) — pure, exported for tests
//
// The usage data comes from a `batchexecute` RPC (rpcid `jSf9Qc`, args `[]`)
// whose payload is `[flag, [metric, metric], bool]` and each metric is
// `[limit, fractionUsed, periodEnum, [[resetEpochSec, nanos]]]`. We parse it
// structurally (not by hard-coded rpcid) so it keeps working if Google rotates
// the obfuscated id, and DOM-verify it before trusting it. Envelope decoding
// lives in the shared `decodeBatchExecute` util.
// -----------------------------------------------------------------------------

/** True for a `[limit, fraction, period, [[epoch, nanos]]]` metric tuple. */
function readMetric(m: unknown): ParsedMetric | null {
  if (!Array.isArray(m) || m.length < 4) return null;
  const fraction = m[1];
  const period = m[2];
  const resetWrap = m[3];
  if (typeof fraction !== 'number' || fraction < 0 || fraction > 1.5) return null;
  if (typeof period !== 'number') return null;
  if (!Array.isArray(resetWrap) || !Array.isArray(resetWrap[0])) return null;
  const epoch = resetWrap[0][0];
  if (typeof epoch !== 'number' || epoch < 1_600_000_000) return null;
  return { metric: { percent: Math.round(fraction * 100), resetEpoch: epoch }, period };
}

/** Pull {daily, weekly} out of a usage RPC payload, or null if it isn't one. */
export function extractUsagePayload(
  payload: unknown,
): { daily: RawMetric | null; weekly: RawMetric | null } | null {
  if (!Array.isArray(payload)) return null;
  // Gemini may append new quota buckets with a different tuple layout. Keep
  // parsing the known 5h/weekly metrics instead of rejecting the whole array
  // because one sibling bucket is unfamiliar.
  const metricsArr = payload.find(
    (x): x is unknown[] => Array.isArray(x) && x.some((m) => readMetric(m) !== null),
  );
  if (!metricsArr) return null;
  const metrics = metricsArr.map(readMetric).filter((m): m is ParsedMetric => m !== null);
  if (metrics.length === 0) return null;
  // Real captures show period 1 = rolling 5h window, period 2 = weekly limit.
  // Do not infer from reset time: the weekly boundary can arrive before 5h.
  const daily = metrics.find((m) => m.period === 1)?.metric ?? null;
  const weekly = metrics.find((m) => m.period === 2)?.metric ?? null;
  return daily || weekly ? { daily, weekly } : null;
}

/** Parse a raw batchexecute response into usage metrics + the carrying rpcid. */
export function parseUsageRpcResponse(
  text: string,
): { rpcid: string; daily: RawMetric | null; weekly: RawMetric | null } | null {
  for (const { rpcid, payload } of decodeBatchExecute(text)) {
    const usage = extractUsagePayload(payload);
    if (usage && (usage.daily || usage.weekly)) return { rpcid, ...usage };
  }
  return null;
}

/**
 * Format a reset epoch into a short label: time-only today, else date + time.
 * `locale` (a BCP-47 tag derived from the Voyager language) localizes it so a
 * zh user sees `6月16日 22:47` rather than the browser's system locale.
 */
export function formatResetLabel(epochSec: number, now: number, locale?: string): string {
  try {
    const d = new Date(epochSec * 1000);
    const n = new Date(now);
    const sameDay =
      d.getFullYear() === n.getFullYear() &&
      d.getMonth() === n.getMonth() &&
      d.getDate() === n.getDate();
    return sameDay
      ? d.toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString(locale, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        });
  } catch {
    return '';
  }
}

function metricFromRaw(m: RawMetric | null, now: number): UsageMetric | null {
  return m
    ? {
        percent: m.percent,
        resetLabel: formatResetLabel(m.resetEpoch, now, uiLocale),
        resetEpoch: m.resetEpoch,
      }
    : null;
}

/** Re-localize a metric's reset label from its epoch (used on language change). */
function reformatReset(m: UsageMetric): string {
  return typeof m.resetEpoch === 'number'
    ? formatResetLabel(m.resetEpoch, Date.now(), uiLocale)
    : m.resetLabel;
}

/** Build a snapshot from parsed RPC metrics, carrying the tier forward. */
function snapshotFromParsed(
  parsed: { daily: RawMetric | null; weekly: RawMetric | null },
  now: number,
  tier: string | undefined,
  sourceStartedAt: number = now,
  regressionVerified = false,
): UsageSnapshot {
  return {
    daily: metricFromRaw(parsed.daily, now),
    weekly: metricFromRaw(parsed.weekly, now),
    tier,
    accountKey: currentUsageAccountKey(),
    sourceStartedAt,
    regressionVerified,
    updatedAt: now,
  };
}

// -----------------------------------------------------------------------------
// Injector — the pill
// -----------------------------------------------------------------------------

/** "updated X ago" stamp from a timestamp. Pure so it can be unit-tested. */
export function formatUpdatedAgo(updatedAt: number, now: number): string {
  const diffMs = Math.max(0, now - updatedAt);
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return t('usageStatusJustUpdated', 'Just updated');
  if (min < 60) return t('usageStatusMinutesAgo', 'Updated {n}m ago').replace('{n}', String(min));
  const hours = Math.floor(min / 60);
  if (hours < 24) return t('usageStatusHoursAgo', 'Updated {n}h ago').replace('{n}', String(hours));
  const days = Math.floor(hours / 24);
  return t('usageStatusDaysAgo', 'Updated {n}d ago').replace('{n}', String(days));
}

export function formatResetCountdown(epochSec: number | undefined, now: number): string {
  if (typeof epochSec !== 'number') return '';
  const diffMs = epochSec * 1000 - now;
  if (diffMs <= 0) return '';
  const mins = Math.floor(diffMs / 60_000);
  const hours = Math.floor(mins / 60);
  const restMins = mins % 60;
  if (hours < 1) return `${mins}m`;
  if (hours < 24) return restMins > 0 ? `${hours}h${restMins}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days}d${rest}h`;
}

const OPEN_ICON = `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h280v80H200v560h560v-280h80v280q0 33-23.5 56.5T760-120H200Zm188-212-56-56 372-372H560v-80h280v280h-80v-144L388-332Z"/></svg>`;

/** Build a compact metric segment: label · thin bar · percent. */
function buildMetric(kind: 'daily' | 'weekly'): HTMLElement {
  const seg = document.createElement('div');
  seg.className = 'gv-usage-metric';
  seg.dataset.kind = kind;

  const name = document.createElement('span');
  name.className = 'gv-usage-label';
  seg.appendChild(name);

  const track = document.createElement('span');
  track.className = 'gv-usage-track';
  const fill = document.createElement('span');
  fill.className = 'gv-usage-fill';
  track.appendChild(fill);
  seg.appendChild(track);

  const pct = document.createElement('span');
  pct.className = 'gv-usage-pct';
  seg.appendChild(pct);

  return seg;
}

/**
 * Build the pill skeleton once. Labels/titles are (re)applied on every render so
 * a late-initialised i18n language still lands correctly (no frozen English).
 */
function ensurePill(): HTMLElement {
  const existing = document.getElementById(PILL_ID);
  if (existing) {
    pill = existing;
    return existing;
  }

  const el = document.createElement('div');
  el.id = PILL_ID;
  el.className = 'gv-usage-pill';
  el.setAttribute('role', 'group');

  const tier = document.createElement('span');
  tier.className = 'gv-usage-tier';
  el.appendChild(tier);

  const empty = document.createElement('a');
  empty.className = 'gv-usage-empty';
  empty.target = '_blank';
  empty.rel = 'noopener noreferrer';
  empty.addEventListener('click', (e) => e.stopPropagation());
  el.appendChild(empty);

  el.appendChild(buildMetric('daily'));
  el.appendChild(buildMetric('weekly'));

  // Refresh = force an immediate silent replay. Never navigates.
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'gv-usage-refresh';
  refresh.innerHTML = USAGE_REFRESH_ICON;
  refresh.addEventListener('click', (e) => {
    e.stopPropagation();
    e.preventDefault();
    requestReplay(true);
  });
  el.appendChild(refresh);

  // The only affordance that opens the native /usage page — a real link, new tab.
  const open = document.createElement('a');
  open.className = 'gv-usage-open';
  open.href = usageUrlForPathname(location.pathname);
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  open.innerHTML = OPEN_ICON;
  open.addEventListener('click', (e) => e.stopPropagation());
  el.appendChild(open);

  // Draggable: grab anywhere on the bar to reposition; the spot is persisted.
  // The refresh/open controls opt out so they stay clickable.
  el.addEventListener('pointerdown', onPillPointerDown);

  document.body.appendChild(el);
  pill = el;
  return el;
}

function setMetric(el: HTMLElement, kind: 'daily' | 'weekly', metric: UsageMetric | null): void {
  const seg = el.querySelector<HTMLElement>(`.gv-usage-metric[data-kind="${kind}"]`);
  if (!seg) return;
  const label = seg.querySelector<HTMLElement>('.gv-usage-label');
  const fill = seg.querySelector<HTMLElement>('.gv-usage-fill');
  const pct = seg.querySelector<HTMLElement>('.gv-usage-pct');
  if (label) {
    label.textContent =
      kind === 'daily' ? t('usageStatusDaily', '5h') : t('usageStatusWeekly', 'Weekly');
  }
  if (metric) {
    seg.removeAttribute('hidden');
    if (fill) fill.style.width = `${metric.percent}%`;
    if (pct) {
      const reset = formatResetCountdown(metric.resetEpoch, Date.now());
      pct.textContent = `${metric.percent}%${reset ? ` (${reset})` : ''}`;
    }
    seg.classList.toggle('gv-usage-high', metric.percent >= 90);
    seg.classList.toggle('gv-usage-mid', metric.percent >= 70 && metric.percent < 90);
    // Reset time lives in the segment tooltip to keep the bar short.
    seg.title = metric.resetLabel ? `${t('usageStatusResets', 'Resets')} ${metric.resetLabel}` : '';
  } else {
    seg.setAttribute('hidden', '');
  }
}

function updatePillContent(el: HTMLElement, snap: UsageSnapshot | null): void {
  el.setAttribute('aria-label', t('usageStatusTitle', 'Gemini usage limits'));

  const hasData = Boolean(snap?.daily || snap?.weekly);
  const empty = el.querySelector<HTMLAnchorElement>('.gv-usage-empty');
  if (empty) {
    const label = t('usageStatusEmptyHint', 'Click to load usage');
    empty.textContent = label;
    empty.href = usageUrlForPathname(location.pathname);
    empty.toggleAttribute('hidden', hasData);
    empty.setAttribute('aria-label', label);
  }

  const tier = el.querySelector<HTMLElement>('.gv-usage-tier');
  if (tier) {
    tier.textContent = snap?.tier ?? '';
    tier.toggleAttribute('hidden', !snap?.tier);
  }
  const refresh = el.querySelector<HTMLElement>('.gv-usage-refresh');
  if (refresh) {
    const label = t('usageStatusRefresh', 'Refresh');
    refresh.setAttribute('aria-label', label);
    refresh.title = label;
    refresh.toggleAttribute('hidden', !hasData);
  }
  const open = el.querySelector<HTMLElement>('.gv-usage-open');
  if (open) {
    const label = t('usageStatusOpenHint', 'Open usage limits');
    open.setAttribute('aria-label', label);
    open.title = label;
    if (open instanceof HTMLAnchorElement) open.href = usageUrlForPathname(location.pathname);
    open.toggleAttribute('hidden', !hasData);
  }

  setMetric(el, 'daily', snap?.daily ?? null);
  setMetric(el, 'weekly', snap?.weekly ?? null);

  // Freshness lives in the pill's own tooltip (segment tooltips show resets).
  el.title = snap
    ? formatUpdatedAgo(snap.updatedAt, Date.now())
    : t('usageStatusEmptyHint', 'Click to load usage');
}

/** Clamp a top-left position so the pill stays fully on screen. */
function clampPos(x: number, y: number): { x: number; y: number } {
  const w = pill?.offsetWidth ?? 240;
  const h = pill?.offsetHeight ?? 32;
  return {
    x: Math.max(8, Math.min(window.innerWidth - w - 8, x)),
    y: Math.max(8, Math.min(window.innerHeight - h - 8, y)),
  };
}

/** Position the bar: at the user-dragged spot if set, else bottom-centered. */
function positionPill(el: HTMLElement): void {
  if (dragging) return;
  if (dragPos) {
    const { x, y } = clampPos(dragPos.x, dragPos.y);
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.transform = 'none';
  } else {
    // Default: centered along the bottom edge, clear of the corner.
    el.style.left = '50%';
    el.style.top = 'auto';
    el.style.right = 'auto';
    el.style.bottom = '20px';
    el.style.transform = 'translateX(-50%)';
  }
}

function onPillPointerDown(ev: PointerEvent): void {
  if (ev.button !== 0 || !pill) return;
  // Don't start a drag from the interactive controls.
  if ((ev.target as Element | null)?.closest('.gv-usage-empty, .gv-usage-refresh, .gv-usage-open'))
    return;
  dragging = true;
  dragMoved = false;
  const rect = pill.getBoundingClientRect();
  dragOffset = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  dragStart = { x: ev.clientX, y: ev.clientY };
  try {
    pill.setPointerCapture(ev.pointerId);
  } catch {
    // ignore
  }
  pill.classList.add('gv-usage-dragging');
  pillMoveHandler = onPillPointerMove;
  window.addEventListener('pointermove', pillMoveHandler);
  window.addEventListener('pointerup', onPillPointerUp, { once: true });
}

function onPillPointerMove(ev: PointerEvent): void {
  if (!dragging || !pill) return;
  if (Math.abs(ev.clientX - dragStart.x) + Math.abs(ev.clientY - dragStart.y) > 3) dragMoved = true;
  const { x, y } = clampPos(ev.clientX - dragOffset.x, ev.clientY - dragOffset.y);
  pill.style.left = `${x}px`;
  pill.style.top = `${y}px`;
  pill.style.right = 'auto';
  pill.style.bottom = 'auto';
  // Drop the centered-default transform so `left` maps 1:1 to the pointer.
  pill.style.transform = 'none';
}

function onPillPointerUp(): void {
  if (!dragging) return;
  dragging = false;
  if (pillMoveHandler) {
    window.removeEventListener('pointermove', pillMoveHandler);
    pillMoveHandler = null;
  }
  pill?.classList.remove('gv-usage-dragging');
  if (dragMoved && pill) {
    const rect = pill.getBoundingClientRect();
    dragPos = { x: Math.round(rect.left), y: Math.round(rect.top) };
    void saveDragPos(dragPos);
  }
}

async function loadDragPos(): Promise<void> {
  try {
    const r = await browser.storage.local.get(StorageKeys.GV_USAGE_POS);
    const raw = (r as Record<string, unknown>)[StorageKeys.GV_USAGE_POS];
    if (raw && typeof raw === 'object') {
      const p = raw as { x?: unknown; y?: unknown };
      if (typeof p.x === 'number' && typeof p.y === 'number') dragPos = { x: p.x, y: p.y };
    }
  } catch {
    // ignore
  }
}

async function saveDragPos(pos: { x: number; y: number }): Promise<void> {
  try {
    await browser.storage.local.set({ [StorageKeys.GV_USAGE_POS]: pos });
  } catch {
    // ignore
  }
}

function setSpinning(on: boolean): void {
  pill?.classList.toggle('gv-usage-loading', on);
}

function removePill(): void {
  if (pillMoveHandler) {
    window.removeEventListener('pointermove', pillMoveHandler);
    pillMoveHandler = null;
  }
  dragging = false;
  if (pill) {
    pill.remove();
    pill = null;
  }
  const stray = document.getElementById(PILL_ID);
  if (stray) stray.remove();
  if (stampTimer !== null) {
    clearInterval(stampTimer);
    stampTimer = null;
  }
  window.removeEventListener('resize', onResize);
}

function onResize(): void {
  if (pill) positionPill(pill);
}

export function getUsagePillMode(
  isEnabled: boolean,
  hostname: string,
  currentSnapshot: UsageSnapshot | null,
): UsagePillMode {
  if (!isEnabled || hostname !== 'gemini.google.com') return 'hidden';
  return currentSnapshot?.daily || currentSnapshot?.weekly ? 'ready' : 'empty';
}

function render(): void {
  const mode = getUsagePillMode(enabled, location.hostname, snapshot);
  if (mode === 'hidden') {
    removePill();
    return;
  }

  const el = ensurePill();
  updatePillContent(el, snapshot);
  positionPill(el);
  window.addEventListener('resize', onResize);

  if (stampTimer === null) {
    stampTimer = window.setInterval(() => {
      if (pill) updatePillContent(pill, snapshot);
    }, STAMP_REFRESH_MS);
  }
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
      render();
      if (enabled) {
        startReplayLoop();
      } else {
        stopReplayLoop();
      }
      return;
    }
    if (changes[StorageKeys.LANGUAGE]) {
      // Voyager language changed — re-localize reset dates + labels.
      void getCurrentLanguage().then((lang) => {
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
        render();
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
        render();
      }
    }
    if (areaName === 'local' && changes[StorageKeys.GV_USAGE_RECIPE]) {
      // Another tab calibrated the recipe — adopt it so this tab can replay too.
      const raw = changes[StorageKeys.GV_USAGE_RECIPE].newValue as UsageRecipe | undefined;
      if (raw && typeof raw.rpcid === 'string') recipe = raw;
    }
    if (areaName === 'local' && changes[StorageKeys.GV_USAGE_POS]) {
      // Another tab moved the bar — mirror its placement.
      const raw = changes[StorageKeys.GV_USAGE_POS].newValue as
        | { x?: unknown; y?: unknown }
        | undefined;
      dragPos =
        raw && typeof raw.x === 'number' && typeof raw.y === 'number'
          ? { x: raw.x, y: raw.y }
          : null;
      if (pill) positionPill(pill);
    }
  };
  browser.storage.onChanged.addListener(storageListener);
}

function handleNavigation(): void {
  clearRegressionConfirmation();
  window.setTimeout(() => {
    void (async () => {
      snapshot = await loadSnapshot();
      if (isOnUsagePage()) {
        setupScrapeObserver();
      } else {
        teardownScrapeObserver();
      }
      render();
      if (enabled) maybeReplay();
    })();
  }, 250);
}

// -----------------------------------------------------------------------------
// MAIN-world observer bridge (silent refresh)
// -----------------------------------------------------------------------------

async function loadRecipe(): Promise<UsageRecipe | null> {
  try {
    const result = await browser.storage.local.get(StorageKeys.GV_USAGE_RECIPE);
    const raw = (result as Record<string, unknown>)[StorageKeys.GV_USAGE_RECIPE];
    if (raw && typeof raw === 'object' && typeof (raw as UsageRecipe).rpcid === 'string') {
      return raw as UsageRecipe;
    }
  } catch {
    // ignore
  }
  return null;
}

async function saveRecipe(next: UsageRecipe): Promise<void> {
  recipe = next;
  try {
    await browser.storage.local.set({ [StorageKeys.GV_USAGE_RECIPE]: next });
  } catch {
    // ignore
  }
}

/** Adopt a freshly parsed snapshot if it has data; carry the tier forward. */
function applyParsed(
  parsed: { daily: RawMetric | null; weekly: RawMetric | null },
  tier: string | undefined,
  options: MergeUsageSnapshotOptions = {},
  sourceStartedAt: number = Date.now(),
): void {
  if (!parsed.daily && !parsed.weekly) return;
  const now = Date.now();
  snapshot = mergeUsageSnapshots(
    snapshot,
    snapshotFromParsed(
      parsed,
      now,
      tier ?? snapshot?.tier,
      sourceStartedAt,
      options.allowRegression === true,
    ),
    options,
  );
  void saveSnapshot(snapshot);
  render();
}

function clearRegressionConfirmation(): void {
  pendingRegression = null;
  if (regressionConfirmTimer !== null) {
    clearTimeout(regressionConfirmTimer);
    regressionConfirmTimer = null;
  }
}

function scheduleRegressionConfirmation(): void {
  if (!enabled || regressionConfirmTimer !== null) return;
  regressionConfirmTimer = window.setTimeout(() => {
    regressionConfirmTimer = null;
    requestReplay();
  }, REGRESSION_CONFIRM_MS);
}

function applyAutomaticParsed(
  parsed: { daily: RawMetric | null; weekly: RawMetric | null },
  sourceStartedAt: number,
): void {
  if (!parsed.daily && !parsed.weekly) return;
  const now = Date.now();
  const next = snapshotFromParsed(parsed, now, snapshot?.tier, sourceStartedAt);
  const result = mergeAutomaticUsageSnapshots(snapshot, pendingRegression, next, now);
  snapshot = result.snapshot;
  pendingRegression = result.candidate;
  if (result.needsConfirmation) scheduleRegressionConfirmation();
  else clearRegressionConfirmation();
  void saveSnapshot(snapshot);
  render();
}

/**
 * A capture arrived from the observer (only fires on /usage). Parse it; if it's
 * the usage RPC and its numbers agree with the rendered DOM, remember the
 * {rpcid, args} recipe for silent replay and adopt the precise values.
 */
function handleCapture(payload: { rpcid?: string; args?: string | null; body?: string }): void {
  if (!enabled || !isOnUsagePage()) return;
  if (!payload || typeof payload.body !== 'string') return;
  const parsed = parseUsageRpcResponse(payload.body);
  if (!parsed) return;

  // Cross-verify against the rendered DOM (ground truth) before trusting it as
  // the recipe — a wrong recipe would silently feed bad numbers off /usage.
  const dom = scrapeUsageFromDocument();
  const close = (a: UsageMetric | null, b: RawMetric | null): boolean =>
    !a || !b || Math.abs(a.percent - b.percent) <= 2;
  if (dom && (!close(dom.daily, parsed.daily) || !close(dom.weekly, parsed.weekly))) return;

  void saveRecipe({
    rpcid: typeof payload.rpcid === 'string' ? payload.rpcid : parsed.rpcid,
    args: typeof payload.args === 'string' ? payload.args : '[]',
  });
  clearRegressionConfirmation();
  applyParsed(parsed, dom?.tier, { allowRegression: true });
}

function handleReplayResult(payload: { id?: number; body?: string; error?: string }): void {
  setSpinning(false);
  if (spinTimer !== null) {
    clearTimeout(spinTimer);
    spinTimer = null;
  }
  const request = typeof payload.id === 'number' ? replayRequests.get(payload.id) : undefined;
  if (typeof payload.id === 'number') replayRequests.delete(payload.id);
  if (typeof payload.error === 'string' && payload.error) {
    console.warn('[UsageStatus] Usage refresh failed:', payload.error);
  }
  if (!enabled || !payload || typeof payload.body !== 'string') return;
  const parsed = parseUsageRpcResponse(payload.body);
  if (!parsed) return;
  if (request?.allowRegression) {
    clearRegressionConfirmation();
    applyParsed(parsed, undefined, { allowRegression: true }, request.startedAt);
  } else {
    applyAutomaticParsed(parsed, request?.startedAt ?? Date.now());
  }
}

/** A Gemini generation just finished → usage changed → refresh shortly after. */
function onGenerationComplete(): void {
  if (!enabled || !recipe) return;
  if (genTimer !== null) clearTimeout(genTimer);
  genTimer = window.setTimeout(() => {
    genTimer = null;
    requestReplay();
  }, GEN_DEBOUNCE_MS);
}

function setupObserverBridge(): void {
  if (observerMessageHandler) return;
  observerMessageHandler = (ev: MessageEvent) => {
    if (ev.source !== window) return;
    const data = ev.data as { source?: string; type?: string; payload?: unknown } | null;
    if (!data || data.source !== OBS_SRC) return;
    if (data.type === 'ready') {
      observerReady = true;
    } else if (data.type === 'capture') {
      handleCapture(data.payload as { rpcid?: string; args?: string | null; body?: string });
    } else if (data.type === 'replay-result') {
      handleReplayResult(data.payload as { id?: number; body?: string; error?: string });
    } else if (data.type === 'generation-complete') {
      onGenerationComplete();
    }
  };
  window.addEventListener('message', observerMessageHandler);
  window.postMessage({ source: OBS_CMD, type: 'ping' }, window.location.origin);
}

function teardownObserverBridge(): void {
  if (observerMessageHandler) {
    window.removeEventListener('message', observerMessageHandler);
    observerMessageHandler = null;
  }
  observerReady = false;
  stopReplayLoop();
  if (spinTimer !== null) {
    clearTimeout(spinTimer);
    spinTimer = null;
  }
}

/** Ask the MAIN-world observer to re-issue the usage RPC with the page's tokens. */
function requestReplay(allowRegression = false): void {
  if (!recipe) return;
  setSpinning(true);
  if (spinTimer !== null) clearTimeout(spinTimer);
  spinTimer = window.setTimeout(() => {
    spinTimer = null;
    setSpinning(false);
    console.warn(
      observerReady
        ? '[UsageStatus] Usage refresh timed out.'
        : '[UsageStatus] Usage observer unavailable; refresh could not run.',
    );
  }, 6_000);
  const id = ++replaySeq;
  const startedAt = Date.now();
  for (const [requestId, request] of replayRequests) {
    if (startedAt - request.startedAt > 30_000) replayRequests.delete(requestId);
  }
  replayRequests.set(id, { allowRegression, startedAt });
  try {
    window.postMessage(
      {
        source: OBS_CMD,
        type: 'replay',
        payload: {
          id,
          rpcid: recipe.rpcid,
          args: recipe.args,
          // This RPC belongs to Gemini's usage surface. Passing the current
          // conversation route worked only while the backend ignored
          // `source-path`; account-scoped `/usage` keeps replay faithful to the
          // request we originally captured.
          sourcePath: usagePathForPathname(location.pathname),
        },
      },
      location.origin,
    );
  } catch {
    // ignore — page gone / context invalidated
  }
}

/** Idle fallback: replay only when off /usage, holding a recipe, and stale. */
function maybeReplay(): void {
  if (!enabled || !recipe || isOnUsagePage()) return;
  if (snapshot && Date.now() - snapshot.updatedAt < STALE_MS) return;
  requestReplay();
}

function startReplayLoop(): void {
  if (replayTimer !== null) return;
  maybeReplay();
  replayTimer = window.setInterval(maybeReplay, HEARTBEAT_MS);
  if (!visibilityHandler) {
    visibilityHandler = () => {
      if (document.visibilityState === 'visible') maybeReplay();
    };
    document.addEventListener('visibilitychange', visibilityHandler);
  }
}

function stopReplayLoop(): void {
  if (replayTimer !== null) {
    clearInterval(replayTimer);
    replayTimer = null;
  }
  if (genTimer !== null) {
    clearTimeout(genTimer);
    genTimer = null;
  }
  clearRegressionConfirmation();
  replayRequests.clear();
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

export async function startUsageStatus(): Promise<() => void> {
  if (started) return () => {};
  started = true;

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
  recipe = (await loadRecipe()) ?? DEFAULT_RECIPE;
  await loadDragPos();
  setupStorageListener();
  setupObserverBridge();

  if (isOnUsagePage()) setupScrapeObserver();
  render();
  if (enabled) startReplayLoop();

  stopRouteWatcher = watchRouteChanges(handleNavigation);

  return () => {
    started = false;
    teardownScrapeObserver();
    teardownObserverBridge();
    removePill();
    stopRouteWatcher?.();
    stopRouteWatcher = null;
    if (storageListener) {
      browser.storage.onChanged.removeListener(storageListener);
      storageListener = null;
    }
  };
}
