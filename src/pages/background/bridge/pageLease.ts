/**
 * Page lease arbitration (spec §3.2): at most one op may dispatch events into a
 * ChatGPT page at a time, across tabs and service worker restarts.
 *
 * - acquire/release run in a short critical section (`gv-bridge-lease` Web
 *   Lock, or a same-context promise chain), so two interleaved acquires cannot
 *   both read "free". The lock guards the read-modify-write only; nothing ever
 *   waits in line for the page: a held lease answers `busy`.
 * - A lease is granted only after it was written; a failed read or write is
 *   `busy` (fail closed).
 * - The deadline is issued here. Passing it never by itself hands the page to
 *   someone else: the lease turns `stale`, and the new holder is let in only
 *   when the old document is confirmed gone or reports that it stopped. A
 *   frozen page cannot answer, so it stays `busy-stale` until its tab closes.
 * - release matches the `leaseId`, so a late release cannot drop a newer lease.
 */
import { logger } from '@/core/services/LoggerService';
import type { OpName } from '@/features/bridge/protocol';

import { BRIDGE_SESSION_KEYS, type StorageAreaLike } from './bridgeTaskStore';

export interface PageLease {
  readonly leaseId: string;
  readonly taskId: string;
  readonly op: OpName;
  readonly tabId: number;
  readonly documentId?: string;
  readonly docNonce: string;
  readonly issuedAt: number;
  readonly deadline: number;
  readonly status: 'active' | 'stale';
}

export interface LeaseRequest {
  readonly taskId: string;
  readonly op: OpName;
  readonly tabId: number;
  readonly documentId?: string;
  readonly docNonce: string;
  readonly durationMs: number;
}

/**
 * What the old holder's document answered to `gv.bridge.lease.probe`:
 * `gone` (no such tab or document), `stopped` (its op signal is aborted and
 * nothing runs), `running`, or `no-answer` (timeout, frozen page, anything else).
 */
export type LeaseProbeOutcome = 'gone' | 'stopped' | 'running' | 'no-answer';

export type LeaseAcquireResult =
  | { readonly ok: true; readonly lease: PageLease }
  | { readonly ok: false; readonly code: 'busy' | 'busy-stale' };

export const LEASE_PROBE_TIMEOUT_MS = 2_000;

/** Lease length per page-event op (spec §3.2). */
export const LEASE_DURATION_MS: Readonly<Partial<Record<OpName, number>>> = {
  'model.select': 25_000,
  'composer.attach': 120_000,
  'composer.send': 30_000,
};

interface LockManagerLike {
  request<T>(name: string, callback: () => Promise<T>): Promise<T>;
}

let fallbackChain: Promise<unknown> = Promise.resolve();

/** Serialize lease reads and writes across every extension context sharing the lock. */
export function withBridgeLeaseLock<T>(work: () => Promise<T>): Promise<T> {
  const locks = (globalThis.navigator as { locks?: LockManagerLike } | undefined)?.locks;
  if (locks && typeof locks.request === 'function') return locks.request('gv-bridge-lease', work);
  const run = fallbackChain.then(work, work);
  fallbackChain = run.catch(() => undefined);
  return run;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseLease(raw: unknown): PageLease | null {
  if (!isRecord(raw)) return null;
  const ok =
    typeof raw.leaseId === 'string' &&
    typeof raw.taskId === 'string' &&
    typeof raw.op === 'string' &&
    typeof raw.tabId === 'number' &&
    (raw.documentId === undefined || typeof raw.documentId === 'string') &&
    typeof raw.docNonce === 'string' &&
    typeof raw.issuedAt === 'number' &&
    typeof raw.deadline === 'number' &&
    (raw.status === 'active' || raw.status === 'stale');
  return ok ? (raw as unknown as PageLease) : null;
}

export interface PageLeaseDeps {
  readonly area: StorageAreaLike;
  /** Resolves once the background has read its session state back (hydrate). */
  readonly ready: () => Promise<void>;
  readonly probe: (lease: PageLease) => Promise<LeaseProbeOutcome>;
  readonly now?: () => number;
  readonly randomId?: () => string;
  readonly withLock?: <T>(work: () => Promise<T>) => Promise<T>;
}

export interface PageLeaseArbiter {
  acquire(request: LeaseRequest): Promise<LeaseAcquireResult>;
  /** Drop the lease only while `leaseId` still holds it; true when this call dropped it. */
  release(leaseId: string): Promise<boolean>;
  /** The holder's tab closed: its document is gone, so its lease ends. */
  releaseForTab(tabId: number): Promise<boolean>;
  current(): Promise<PageLease | null>;
}

const KEY = BRIDGE_SESSION_KEYS.lease;

export function createPageLeaseArbiter(deps: PageLeaseDeps): PageLeaseArbiter {
  const now = deps.now ?? (() => Date.now());
  const randomId = deps.randomId ?? (() => crypto.randomUUID());
  const withLock = deps.withLock ?? withBridgeLeaseLock;

  const read = async (): Promise<PageLease | null> => parseLease((await deps.area.get(KEY))[KEY]);

  /** Old holder confirmed stopped? Bounded by `LEASE_PROBE_TIMEOUT_MS`. */
  const confirmStopped = async (lease: PageLease): Promise<boolean> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<LeaseProbeOutcome>((resolve) => {
      timer = setTimeout(() => resolve('no-answer'), LEASE_PROBE_TIMEOUT_MS);
    });
    try {
      const outcome = await Promise.race([
        deps.probe(lease).catch(() => 'no-answer' as const),
        timeout,
      ]);
      return outcome === 'gone' || outcome === 'stopped';
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  const grant = async (request: LeaseRequest): Promise<LeaseAcquireResult> => {
    const issuedAt = now();
    const lease: PageLease = {
      leaseId: randomId(),
      taskId: request.taskId,
      op: request.op,
      tabId: request.tabId,
      ...(request.documentId ? { documentId: request.documentId } : {}),
      docNonce: request.docNonce,
      issuedAt,
      deadline: issuedAt + request.durationMs,
      status: 'active',
    };
    try {
      await deps.area.set({ [KEY]: lease });
    } catch (error) {
      logger.warn('Bridge lease write failed', { error: String(error) });
      return { ok: false, code: 'busy' };
    }
    return { ok: true, lease };
  };

  return {
    acquire: (request) =>
      withLock(async () => {
        await deps.ready();
        let current: PageLease | null;
        try {
          current = await read();
        } catch (error) {
          logger.warn('Bridge lease read failed', { error: String(error) });
          return { ok: false, code: 'busy' };
        }
        if (!current) return grant(request);
        if (current.status === 'active' && now() < current.deadline)
          return { ok: false, code: 'busy' };
        if (current.status === 'active') {
          // Expiry alone grants nothing; record it so the popup and later calls see it.
          try {
            await deps.area.set({ [KEY]: { ...current, status: 'stale' } });
          } catch {
            return { ok: false, code: 'busy' };
          }
        }
        if (!(await confirmStopped(current))) return { ok: false, code: 'busy-stale' };
        return grant(request);
      }),

    release: (leaseId) =>
      withLock(async () => {
        await deps.ready();
        const current = await read();
        if (!current || current.leaseId !== leaseId) {
          if (current)
            logger.debug('Ignored a release for a lease that no longer holds', { leaseId });
          return false;
        }
        await deps.area.remove(KEY);
        return true;
      }),

    releaseForTab: (tabId) =>
      withLock(async () => {
        await deps.ready();
        const current = await read();
        if (!current || current.tabId !== tabId) return false;
        await deps.area.remove(KEY);
        return true;
      }),

    current: async () => {
      await deps.ready();
      return read();
    },
  };
}
