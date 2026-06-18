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
import { getCurrentLanguage, getTranslationSync, initI18n } from '@/utils/i18n';
import type { AppLanguage } from '@/utils/language';
import type { TranslationKey } from '@/utils/translations';

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

/** Captured recipe for replaying the usage RPC from any page. */
interface UsageRecipe {
  rpcid: string;
  args: string;
}

interface MergeUsageSnapshotOptions {
  allowRegression?: boolean;
  now?: number;
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
  /** Date.now() when scraped, for the "updated X ago" stamp. */
  updatedAt: number;
}

const PILL_ID = 'gv-usage-pill';
const SCRAPE_DEBOUNCE_MS = 300;
// Refresh the relative "updated X ago" stamp without re-scraping.
const STAMP_REFRESH_MS = 30_000;
const NAV_POLL_MS = 600;
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
let navPollTimer: number | null = null;
let lastPolledPath = '';
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let pill: HTMLElement | null = null;
let observerMessageHandler: ((ev: MessageEvent) => void) | null = null;
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
const forcedReplayIds = new Set<number>();
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
  const match = pathname.match(/^\/u\/\d+(?=\/|$)/);
  return `https://gemini.google.com${match?.[0] ?? ''}/usage`;
}

function scopeSnapshot(next: UsageSnapshot): UsageSnapshot {
  return { ...next, accountKey: currentUsageAccountKey() };
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

function snapshotEquals(a: UsageSnapshot, b: UsageSnapshot): boolean {
  return (
    a.accountKey === b.accountKey &&
    a.tier === b.tier &&
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

  const keepDaily = shouldKeepCurrentMetric(current.daily, next.daily, options);
  const keepWeekly = shouldKeepCurrentMetric(current.weekly, next.weekly, options);
  if (!keepDaily && !keepWeekly) return next;

  return {
    ...next,
    daily: keepDaily ? current.daily : next.daily,
    weekly: keepWeekly ? current.weekly : next.weekly,
    tier: next.tier ?? current.tier,
    updatedAt: current.updatedAt,
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

function parseMetric(block: Element | null): UsageMetric | null {
  if (!block) return null;
  const percent = parsePercent(block.textContent ?? '');
  if (percent === null) return null;
  return { percent, resetLabel: parseResetLabel(block) };
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
export function scrapeUsageFromDocument(doc: Document = document): UsageSnapshot | null {
  const root =
    doc.querySelector('usage-metrics-window') ?? doc.querySelector('.usage-metrics-container');
  if (!root) return null;

  const daily = parseMetric(root.querySelector('.gxu-currently'));
  const weekly = parseMetric(root.querySelector('.gxu-weekly'));
  if (!daily && !weekly) return null;

  return { daily, weekly, tier: parseTier(root), updatedAt: Date.now() };
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
    return selectUsageSnapshotForAccount(
      (result as Record<string, unknown>)[scopedKey],
      (result as Record<string, unknown>)[StorageKeys.GV_USAGE_CACHE],
      accountKey,
    );
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
// the obfuscated id, and DOM-verify it before trusting it.
// -----------------------------------------------------------------------------

/** Index of the `]` that closes the `[` at `start`, respecting JSON strings. */
function matchBracket(s: string, start: number): number {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') {
      inStr = true;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** Decode a batchexecute envelope into its `wrb.fr` payloads (length-agnostic). */
function decodeBatchExecute(text: string): Array<{ rpcid: string; payload: unknown }> {
  const out: Array<{ rpcid: string; payload: unknown }> = [];
  let idx = 0;
  while (idx < text.length) {
    const at = text.indexOf('[["wrb.fr"', idx);
    if (at < 0) break;
    const end = matchBracket(text, at);
    if (end < 0) break;
    try {
      const rows = JSON.parse(text.slice(at, end + 1)) as unknown[];
      for (const row of rows) {
        if (
          Array.isArray(row) &&
          row[0] === 'wrb.fr' &&
          typeof row[1] === 'string' &&
          typeof row[2] === 'string'
        ) {
          try {
            out.push({ rpcid: row[1], payload: JSON.parse(row[2]) });
          } catch {
            // not JSON — skip
          }
        }
      }
    } catch {
      // malformed chunk — skip past it
    }
    idx = end + 1;
  }
  return out;
}

/** True for a `[limit, fraction, period, [[epoch, nanos]]]` metric tuple. */
function readMetric(m: unknown): RawMetric | null {
  if (!Array.isArray(m) || m.length < 4) return null;
  const fraction = m[1];
  const resetWrap = m[3];
  if (typeof fraction !== 'number' || fraction < 0 || fraction > 1.5) return null;
  if (!Array.isArray(resetWrap) || !Array.isArray(resetWrap[0])) return null;
  const epoch = resetWrap[0][0];
  if (typeof epoch !== 'number' || epoch < 1_600_000_000) return null;
  return { percent: Math.round(fraction * 100), resetEpoch: epoch };
}

/** Pull {daily, weekly} out of a usage RPC payload, or null if it isn't one. */
export function extractUsagePayload(
  payload: unknown,
): { daily: RawMetric | null; weekly: RawMetric | null } | null {
  if (!Array.isArray(payload)) return null;
  const metricsArr = payload.find(
    (x): x is unknown[] =>
      Array.isArray(x) && x.length >= 1 && x.every((m) => readMetric(m) !== null),
  );
  if (!metricsArr) return null;
  const metrics = metricsArr.map(readMetric).filter((m): m is RawMetric => m !== null);
  if (metrics.length === 0) return null;
  // Daily always resets sooner than weekly; sort by reset epoch.
  metrics.sort((a, b) => a.resetEpoch - b.resetEpoch);
  return {
    daily: metrics[0] ?? null,
    weekly: metrics.length > 1 ? metrics[metrics.length - 1] : null,
  };
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
): UsageSnapshot {
  return {
    daily: metricFromRaw(parsed.daily, now),
    weekly: metricFromRaw(parsed.weekly, now),
    tier,
    accountKey: currentUsageAccountKey(),
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
  const hours = Math.floor(diffMs / 3_600_000);
  if (hours < 1) return '<1h';
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  return `${days}d${rest}h`;
}

const REFRESH_ICON = `<svg viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M480-160q-134 0-227-93t-93-227q0-134 93-227t227-93q69 0 132 28.5T720-690v-110h80v280H520v-80h168q-32-56-87.5-88T480-820q-100 0-170 70t-70 170q0 100 70 170t170 70q77 0 139-44t87-116h84q-28 106-114 173t-196 67Z"/></svg>`;
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

  el.appendChild(buildMetric('daily'));
  el.appendChild(buildMetric('weekly'));

  // Refresh = force an immediate silent replay. Never navigates.
  const refresh = document.createElement('button');
  refresh.type = 'button';
  refresh.className = 'gv-usage-refresh';
  refresh.innerHTML = REFRESH_ICON;
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

function updatePillContent(el: HTMLElement, snap: UsageSnapshot): void {
  el.setAttribute('aria-label', t('usageStatusTitle', 'Gemini usage limits'));

  const tier = el.querySelector<HTMLElement>('.gv-usage-tier');
  if (tier) {
    tier.textContent = snap.tier ?? '';
    tier.toggleAttribute('hidden', !snap.tier);
  }
  const refresh = el.querySelector<HTMLElement>('.gv-usage-refresh');
  if (refresh) {
    const label = t('usageStatusRefresh', 'Refresh');
    refresh.setAttribute('aria-label', label);
    refresh.title = label;
  }
  const open = el.querySelector<HTMLElement>('.gv-usage-open');
  if (open) {
    const label = t('usageStatusOpenHint', 'Open usage limits');
    open.setAttribute('aria-label', label);
    open.title = label;
    if (open instanceof HTMLAnchorElement) open.href = usageUrlForPathname(location.pathname);
  }

  setMetric(el, 'daily', snap.daily);
  setMetric(el, 'weekly', snap.weekly);

  // Freshness lives in the pill's own tooltip (segment tooltips show resets).
  el.title = formatUpdatedAgo(snap.updatedAt, Date.now());
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
  if ((ev.target as Element | null)?.closest('.gv-usage-refresh, .gv-usage-open')) return;
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

function render(): void {
  // Only on Gemini, only when enabled, only with data to show.
  if (!enabled || location.hostname !== 'gemini.google.com' || !snapshot) {
    removePill();
    return;
  }
  if (!snapshot.daily && !snapshot.weekly) {
    removePill();
    return;
  }

  const el = ensurePill();
  updatePillContent(el, snapshot);
  positionPill(el);
  window.addEventListener('resize', onResize);

  if (stampTimer === null) {
    stampTimer = window.setInterval(() => {
      if (pill && snapshot) updatePillContent(pill, snapshot);
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
        const merged = mergeUsageSnapshots(snapshot, raw);
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
): void {
  if (!parsed.daily && !parsed.weekly) return;
  snapshot = mergeUsageSnapshots(
    snapshot,
    snapshotFromParsed(parsed, Date.now(), tier ?? snapshot?.tier),
    options,
  );
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
  applyParsed(parsed, dom?.tier, { allowRegression: true });
}

function handleReplayResult(payload: { id?: number; body?: string; error?: string }): void {
  setSpinning(false);
  if (spinTimer !== null) {
    clearTimeout(spinTimer);
    spinTimer = null;
  }
  const allowRegression =
    typeof payload.id === 'number' ? forcedReplayIds.delete(payload.id) : false;
  if (!enabled || !payload || typeof payload.body !== 'string') return;
  const parsed = parseUsageRpcResponse(payload.body);
  if (parsed) applyParsed(parsed, undefined, { allowRegression });
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
    if (data.type === 'capture') {
      handleCapture(data.payload as { rpcid?: string; args?: string | null; body?: string });
    } else if (data.type === 'replay-result') {
      handleReplayResult(data.payload as { id?: number; body?: string; error?: string });
    } else if (data.type === 'generation-complete') {
      onGenerationComplete();
    }
  };
  window.addEventListener('message', observerMessageHandler);
}

function teardownObserverBridge(): void {
  if (observerMessageHandler) {
    window.removeEventListener('message', observerMessageHandler);
    observerMessageHandler = null;
  }
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
  }, 6_000);
  const id = ++replaySeq;
  if (allowRegression) forcedReplayIds.add(id);
  try {
    window.postMessage(
      {
        source: OBS_CMD,
        type: 'replay',
        payload: {
          id,
          rpcid: recipe.rpcid,
          args: recipe.args,
          sourcePath: location.pathname || '/app',
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
  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler);
    visibilityHandler = null;
  }
}

let origPush: typeof history.pushState | null = null;
let origReplace: typeof history.replaceState | null = null;

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

  window.addEventListener('popstate', handleNavigation);
  origPush = history.pushState;
  origReplace = history.replaceState;
  history.pushState = function (...args: Parameters<typeof history.pushState>) {
    const r = origPush!.apply(this, args);
    handleNavigation();
    return r;
  };
  history.replaceState = function (...args: Parameters<typeof history.replaceState>) {
    const r = origReplace!.apply(this, args);
    handleNavigation();
    return r;
  };

  // Gemini's own router runs in the page's main world and bypasses the wrappers
  // above, so poll the pathname to catch in-app navigations into/out of /usage.
  lastPolledPath = location.pathname;
  navPollTimer = window.setInterval(() => {
    if (location.pathname === lastPolledPath) return;
    lastPolledPath = location.pathname;
    handleNavigation();
  }, NAV_POLL_MS);

  return () => {
    started = false;
    teardownScrapeObserver();
    teardownObserverBridge();
    removePill();
    if (navPollTimer !== null) {
      clearInterval(navPollTimer);
      navPollTimer = null;
    }
    window.removeEventListener('popstate', handleNavigation);
    if (origPush) history.pushState = origPush;
    if (origReplace) history.replaceState = origReplace;
    if (storageListener) {
      browser.storage.onChanged.removeListener(storageListener);
      storageListener = null;
    }
  };
}
