/**
 * The tab's side of a pending allowance (addendum P3P4 R3.2, amending P0
 * R1.6). The owner reserves 16 KiB per registered client; the client keeps its
 * accepted but unapplied pending keys within that, and writes one only while
 * the allowance is fresh. Freshness counts from when the granting request was
 * sent, on both the wall clock and a monotonic clock: WebKit pauses
 * `performance.now()` during system sleep, and the wall clock can go back.
 */
import { storedItemBytes } from '@/features/storage/storageBudget';

import { ALLOWANCE_BYTES } from '../ownerAllowances';

export { ALLOWANCE_BYTES };

/** The most the two elapsed times may disagree before the allowance counts as expired. */
export const CLOCK_DIVERGENCE_MS = 60_000;

export interface AllowanceClocks {
  wall: () => number;
  monotonic: () => number;
}

export interface SentAt {
  wall: number;
  monotonic: number;
}

export interface Allowance extends SentAt {
  ttlMs: number;
}

export const sentNow = (clocks: AllowanceClocks): SentAt => ({
  wall: clocks.wall(),
  monotonic: clocks.monotonic(),
});

/** The allowance a reply grants, dated from its request's send time; never from its arrival. */
export function granted(sent: SentAt, ttlMs: unknown, current: Allowance | null): Allowance {
  const ttl = typeof ttlMs === 'number' && Number.isFinite(ttlMs) && ttlMs > 0 ? ttlMs : 0;
  // A late reply to an older request never replaces a grant dated later.
  if (current && current.monotonic > sent.monotonic) return current;
  return { ...sent, ttlMs: ttl };
}

/** Whether a pending-key `set` may be dispatched now under `allowance`. */
export function isFresh(allowance: Allowance | null, clocks: AllowanceClocks): boolean {
  if (!allowance || allowance.ttlMs <= 0) return false;
  const wall = clocks.wall() - allowance.wall;
  const monotonic = clocks.monotonic() - allowance.monotonic;
  if (wall < 0 || monotonic < 0) return false;
  if (wall > allowance.ttlMs || monotonic > allowance.ttlMs) return false;
  return Math.abs(wall - monotonic) <= CLOCK_DIVERGENCE_MS;
}

/** Bytes one pending key stores, as the owner's budget counts them. */
export const pendingKeyBytes = (key: string, entry: unknown): number => storedItemBytes(key, entry);
