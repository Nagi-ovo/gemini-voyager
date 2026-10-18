/**
 * What wakes an op's waits (spec §3.3). A tab hidden for over five minutes
 * runs a chain of timers, each armed from a timer task, about once a minute
 * (Chrome's intensive throttling, measured), and a lease lasts 25–40 s. So a
 * wait does not poll: it looks again when the page tells it something changed.
 *
 * - Wake sources: the page's own changes (one document-level observer, or the
 *   wait's `scope`), ChatGPT's answers and route reports from the page data
 *   store, and `popstate`. Menus and dialogs are body-level portals, hence the
 *   whole document by default.
 * - The observer callback only marks the wait dirty; the look itself runs in
 *   a task of its own (`defer`), once per burst, at most once per `minGapMs`.
 *   A wake inside the gap arms one trailing look at its end, so the last
 *   change of a burst is never lost.
 * - Every timer here is armed from a deferred task, never from a timer task:
 *   such a timer keeps nesting level 1, which only the 1 s alignment applies to.
 * - `recheckMs` looks again without any wake, for probes that depend on what
 *   no source sees (the clock, a settle window).
 * - The order of the old poll is kept: look first, then judge the deadline. A
 *   late wake therefore looks once more before it answers `null`.
 */
export type WakeReason = 'mutation' | 'pageData' | 'route' | 'recheck' | 'deadline';
export type WakeCounts = Record<WakeReason, number>;

/** Run `run` soon, in a task of its own; the returned function cancels it. */
export type Defer = (run: () => void) => () => void;

/** Page data and route reports, as `PageDataStore.subscribe` hands them out. */
export type PageWakeSubscribe = (listener: (reason: 'pageData' | 'route') => void) => () => void;

export interface WakeScope {
  readonly element: Node;
  /** Only these attributes count as a change; every attribute when absent. */
  readonly attributeFilter?: readonly string[];
  /** Watch the element's descendants too (default); false: its own children and attributes. */
  readonly subtree?: boolean;
}

export interface WaitOptions {
  readonly timeoutMs: number;
  /** The least time between two looks; default {@link DEFAULT_MIN_GAP_MS}. */
  readonly minGapMs?: number;
  /** Look again this long after the last look, with or without a wake. */
  readonly recheckMs?: number;
  /** Watch only these for page changes, instead of the whole document. */
  readonly scope?: readonly WakeScope[];
}

export interface Waker {
  /** Look until `probe` returns a value, or resolve `null` once `timeoutMs` has passed. */
  wait<T>(probe: () => T | null | undefined | false, options: WaitOptions): Promise<T | null>;
  /** The wakes so far, by reason, across every wait of the op. */
  counts(): WakeCounts;
  /** The op ended: stop every observer, listener and timer. */
  dispose(): void;
}

export interface WakerOptions {
  readonly now: () => number;
  readonly defer: Defer;
  readonly signal: AbortSignal;
  readonly subscribe?: PageWakeSubscribe;
  readonly doc?: Document;
}

/** Today's poll cadence, kept as the least gap between two looks. */
export const DEFAULT_MIN_GAP_MS = 250;

const PAGE_CHANGES: MutationObserverInit = {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
};

/** A deferred run on the tests' fake clock, and where a browser has no `MessageChannel`. */
export const timerDefer: Defer = (run) => {
  const timer = setTimeout(run, 0);
  return () => clearTimeout(timer);
};

/** The production defer: a message task, which a hidden tab runs at once (0.2 ms, measured). */
export function createChannelDefer(): Defer {
  if (typeof MessageChannel !== 'function') return timerDefer;
  let channel: MessageChannel | null = null;
  const due = new Set<() => void>();
  return (run) => {
    const entry = (): void => run();
    due.add(entry);
    if (!channel) {
      channel = new MessageChannel();
      channel.port1.onmessage = () => {
        const runs = [...due];
        due.clear();
        for (const next of runs) next();
      };
    }
    channel.port2.postMessage(null);
    return () => due.delete(entry);
  };
}

interface Waiter {
  mark(): void;
}

export function createWaker(options: WakerOptions): Waker {
  const { now, defer, signal } = options;
  const doc = options.doc ?? document;
  const counts: WakeCounts = { mutation: 0, pageData: 0, route: 0, recheck: 0, deadline: 0 };
  const waiters = new Set<Waiter>();
  const watchingDocument = new Set<Waiter>();
  let documentObserver: MutationObserver | null = null;
  let stopPageSources: (() => void) | null = null;

  const wakeAll = (reason: WakeReason): void => {
    counts[reason] += 1;
    for (const waiter of waiters) waiter.mark();
  };

  const onPopState = (): void => wakeAll('route');
  /** Route and page data reports reach every wait; a scope narrows page changes only. */
  const startPageSources = (): void => {
    if (stopPageSources) return;
    const view = doc.defaultView;
    view?.addEventListener('popstate', onPopState);
    const unsubscribe = options.subscribe?.((reason) => wakeAll(reason));
    stopPageSources = () => {
      view?.removeEventListener('popstate', onPopState);
      unsubscribe?.();
    };
  };

  const watchDocument = (waiter: Waiter): (() => void) => {
    documentObserver ??= new MutationObserver(() => {
      counts.mutation += 1;
      for (const each of watchingDocument) each.mark();
    });
    if (watchingDocument.size === 0) documentObserver.observe(doc, PAGE_CHANGES);
    watchingDocument.add(waiter);
    return () => {
      watchingDocument.delete(waiter);
      if (watchingDocument.size === 0) documentObserver?.disconnect();
    };
  };

  const watchScope = (waiter: Waiter, scope: readonly WakeScope[]): (() => void) => {
    const observer = new MutationObserver(() => {
      counts.mutation += 1;
      waiter.mark();
    });
    for (const { element, attributeFilter, subtree = true } of scope) {
      observer.observe(element, {
        ...PAGE_CHANGES,
        subtree,
        ...(attributeFilter ? { attributeFilter: [...attributeFilter] } : {}),
      });
    }
    return () => observer.disconnect();
  };

  const wait = <T>(
    probe: () => T | null | undefined | false,
    { timeoutMs, minGapMs = DEFAULT_MIN_GAP_MS, recheckMs, scope }: WaitOptions,
  ): Promise<T | null> =>
    new Promise<T | null>((resolve, reject) => {
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const until = now() + timeoutMs;
      let settled = false;
      let dirty = false;
      let lastLookAt = Number.NEGATIVE_INFINITY;
      let cancelRun: (() => void) | null = null;
      let gapTimer: ReturnType<typeof setTimeout> | undefined;
      let recheckTimer: ReturnType<typeof setTimeout> | undefined;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      let deadlineArmed = false;
      const teardown: (() => void)[] = [];

      const finish = (settle: () => void): void => {
        settled = true;
        cancelRun?.();
        clearTimeout(gapTimer);
        clearTimeout(recheckTimer);
        clearTimeout(deadlineTimer);
        for (const stop of teardown) stop();
        settle();
      };

      const schedule = (): void => {
        if (!settled && !cancelRun) cancelRun = defer(run);
      };
      const waiter: Waiter = {
        mark() {
          dirty = true;
          schedule();
        },
      };
      /** A timer of this wait fired: count it, and look from a task of its own. */
      const timerWake = (reason: 'recheck' | 'deadline'): void => {
        counts[reason] += 1;
        waiter.mark();
      };

      /** The deadline and recheck timers; armed only from a deferred task, never a timer's own. */
      const armTimers = (): void => {
        if (settled) return;
        const left = until - now();
        if (!deadlineArmed) {
          deadlineArmed = true;
          deadlineTimer = setTimeout(
            () => {
              deadlineArmed = false;
              timerWake('deadline');
            },
            Math.max(0, left),
          );
        }
        if (recheckMs !== undefined) {
          clearTimeout(recheckTimer);
          recheckTimer = setTimeout(() => timerWake('recheck'), recheckMs);
        }
      };

      /** True once the wait has its answer; `arm`: this runs in a deferred task. */
      const look = (arm: boolean): boolean => {
        dirty = false;
        lastLookAt = now();
        let value: T | null | undefined | false;
        try {
          value = probe();
        } catch (error) {
          finish(() => reject(error));
          return true;
        }
        if (value !== null && value !== undefined && value !== false) {
          const found = value;
          finish(() => resolve(found));
          return true;
        }
        const left = until - now();
        if (left <= 0) {
          finish(() => resolve(null));
          return true;
        }
        if (arm) armTimers();
        return false;
      };

      const run = (): void => {
        cancelRun = null;
        if (settled || !dirty) return;
        const at = now();
        const gapLeft = lastLookAt + minGapMs - at;
        // Past the deadline the gap no longer counts: the late wake looks, then judges.
        if (gapLeft > 0 && at < until) {
          if (gapTimer === undefined) {
            gapTimer = setTimeout(() => {
              gapTimer = undefined;
              schedule();
            }, gapLeft);
          }
          return;
        }
        clearTimeout(gapTimer);
        gapTimer = undefined;
        look(true);
      };

      const onAbort = (): void => finish(() => reject(signal.reason));
      signal.addEventListener('abort', onAbort, { once: true });
      teardown.push(() => signal.removeEventListener('abort', onAbort));
      waiters.add(waiter);
      teardown.push(() => waiters.delete(waiter));
      startPageSources();
      teardown.push(scope ? watchScope(waiter, scope) : watchDocument(waiter));
      // Look first, as the poll did: an answer already on the page needs no wake.
      // The caller may be running in a timer's task (after an earlier wait or a
      // sleep); timers armed there would join its throttled chain, so they are
      // armed from a deferred task instead.
      if (!look(false)) teardown.push(defer(armTimers));
    });

  return {
    wait,
    counts: () => ({ ...counts }),
    dispose() {
      documentObserver?.disconnect();
      watchingDocument.clear();
      stopPageSources?.();
      stopPageSources = null;
    },
  };
}
