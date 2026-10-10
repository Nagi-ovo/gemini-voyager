import { StorageKeys } from '@/core/types/common';

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

export interface MergeUsageSnapshotOptions {
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

const RESET_GRACE_MS = 2 * 60_000;
const AUTO_REGRESSION_TOLERANCE_PCT = 5;

export function isUsagePathname(pathname: string): boolean {
  return /^\/(?:u\/\d+\/)?usage(?:\/|$)/.test(pathname);
}

export function usageAccountKeyFromPathname(pathname: string): string {
  const match = pathname.match(/^\/u\/(\d+)(?:\/|$)/);
  return match ? `u/${match[1]}` : 'default';
}

export function usageCacheKeyForAccount(accountKey: string): string {
  return `${StorageKeys.GV_USAGE_CACHE}:${accountKey}`;
}

export function usageUrlForPathname(pathname: string): string {
  return `https://gemini.google.com${usagePathForPathname(pathname)}`;
}

export function usagePathForPathname(pathname: string): string {
  const match = pathname.match(/^\/u\/\d+(?=\/|$)/);
  return `${match?.[0] ?? ''}/usage`;
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

export function snapshotEquals(a: UsageSnapshot, b: UsageSnapshot): boolean {
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
