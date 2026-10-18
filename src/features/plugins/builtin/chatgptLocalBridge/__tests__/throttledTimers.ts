import { vi } from 'vitest';

import type { Defer } from '../wake';

/** Measured on Chrome: a chained timer of a tab hidden for over 5 minutes wakes about once a minute. */
export const THROTTLED_CHAIN_MS = 60_000;

export interface ThrottledClock {
  /** Where the page would run a message task: never throttled. */
  readonly defer: Defer;
  /** Advance the fake clock; what the test does next runs as a task of its own. */
  advance(ms: number): Promise<void>;
  restore(): void;
}

/**
 * The fake clock of a tab hidden for minutes (Chrome's intensive throttling):
 * a timer armed while a timer's task runs — its callback, and the promise
 * continuations after it — waits at least {@link THROTTLED_CHAIN_MS}. A timer
 * armed from any other task (an event, a message) runs on time, as measured.
 * Call after `vi.useFakeTimers()`, and `restore()` before the real timers.
 */
export function throttleChainedTimers(): ThrottledClock {
  const fakeSetTimeout = globalThis.setTimeout;
  let inTimerTask = false;
  const throttled = (handler: TimerHandler, delay?: number, ...args: unknown[]) =>
    fakeSetTimeout(
      () => {
        // Still true for the continuations this callback resolves: they run in its task.
        inTimerTask = true;
        if (typeof handler === 'function') handler(...args);
      },
      inTimerTask ? Math.max(delay ?? 0, THROTTLED_CHAIN_MS) : delay,
    );
  globalThis.setTimeout = throttled as unknown as typeof setTimeout;
  return {
    defer: (run) => {
      const timer = fakeSetTimeout(() => {
        inTimerTask = false;
        run();
      }, 0);
      return () => clearTimeout(timer);
    },
    async advance(ms) {
      await vi.advanceTimersByTimeAsync(ms);
      inTimerTask = false;
    },
    restore() {
      globalThis.setTimeout = fakeSetTimeout;
    },
  };
}
