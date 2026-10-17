/**
 * One op's execution context (spec §3.3): its own abort signal, the grant the
 * background issued, and the only doors to the page. `dispatch`, `click` and
 * `insertText` run `guard()` synchronously right before they touch the page;
 * an op never calls `dispatchEvent`, `click()` or `execCommand` itself.
 *
 * Two ways out, kept apart:
 * - `fail(code)` — an ordinary failure; the op may still tidy up through the
 *   guarded doors, which refuse once anything below no longer holds.
 * - `terminate(code)` — cancellation, a challenge, a lost or expired grant, a
 *   remount: the signal aborts, every wait rejects, every door stays shut. Only
 *   extension-side cleanup follows; zero page events.
 */
import { insertIntoComposer } from '@/core/services/composer';
import { hasValidExtensionContext } from '@/core/utils/extensionContext';
import {
  type BridgeError,
  type ErrorCode,
  type OpName,
  bridgeError,
} from '@/features/bridge/protocol';
import type { BridgeGrant } from '@/features/bridge/runtimeMessages';

import type { ChallengeKind } from './challengeGuard';

/** A grant stops being usable this long before its deadline: clocks and delivery are not exact. */
export const GRANT_MARGIN_MS = 250;
const DEFAULT_POLL_MS = 250;

/** Thrown by `fail`: the op ends with this error and may have tidied up first. */
export class OpFailure extends Error {
  constructor(readonly error: BridgeError) {
    super(error.message);
    this.name = 'OpFailure';
  }
}

/** Raised from every wait and door once the op is terminated. */
export class OpTermination extends Error {
  constructor(readonly error: BridgeError) {
    super(error.message);
    this.name = 'OpTermination';
  }
}

export interface OpEnvironment {
  readonly now: () => number;
  readonly isHidden: () => boolean;
  readonly challenge: () => ChallengeKind | null;
  readonly hasExtensionContext: () => boolean;
  readonly pathname: () => string;
}

export const defaultOpEnvironment = (challenge: () => ChallengeKind | null): OpEnvironment => ({
  now: Date.now,
  isHidden: () => document.visibilityState === 'hidden',
  challenge,
  hasExtensionContext: hasValidExtensionContext,
  pathname: () => location.pathname,
});

export interface OpContextOptions {
  readonly taskId: string;
  readonly op: OpName;
  readonly grant: BridgeGrant;
  /** Ops that dispatch page events need a lease and a visible tab (spec §3.2, Q2). */
  readonly interactive: boolean;
  readonly env: OpEnvironment;
  readonly onProgress?: (event: Readonly<Record<string, unknown>>) => void;
}

export interface OpContext {
  readonly taskId: string;
  readonly op: OpName;
  readonly signal: AbortSignal;
  readonly interactive: boolean;
  readonly grant: BridgeGrant;
  readonly now: () => number;
  /** The error the op was terminated with, if it was. */
  readonly terminated: BridgeError | null;
  /** True once the op has said it will send no more page events (after the send click). */
  readonly pageEventsEnded: boolean;
  guard(): void;
  dispatch(target: EventTarget, event: Event): boolean;
  click(element: HTMLElement): void;
  /** Focus the composer and insert text through the editor's own editing command. */
  insertText(field: HTMLElement, text: string): boolean;
  /** No more page events from here on; the route may change (a sent new chat gets its id). */
  endPageEvents(): void;
  sleep(ms: number): Promise<void>;
  /** Poll `probe` until it returns a value, or resolve `null` after `timeoutMs`. */
  waitFor<T>(
    probe: () => T | null | undefined | false,
    options: { readonly timeoutMs: number; readonly intervalMs?: number },
  ): Promise<T | null>;
  fail(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>): never;
  terminate(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>): void;
  progress(event: Readonly<Record<string, unknown>>): void;
}

export function createOpContext(options: OpContextOptions): OpContext {
  const { env, grant, interactive } = options;
  const controller = new AbortController();
  const routeAtStart = env.pathname();
  let terminated: BridgeError | null = null;
  let pageEventsEnded = false;

  const terminate = (
    code: ErrorCode,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ): void => {
    if (terminated) return;
    terminated = bridgeError(code, message, details);
    controller.abort(new OpTermination(terminated));
  };

  const stopped = (): never => {
    throw new OpTermination(terminated ?? bridgeError('cancelled', 'The op was stopped.'));
  };

  const guard = (): void => {
    if (controller.signal.aborted) stopped();
    if (pageEventsEnded) {
      terminate('cancelled', 'The op already ended its page events.', { reason: 'events-ended' });
      stopped();
    }
    if (interactive) {
      if (!grant.leaseId) {
        terminate('cancelled', 'No page lease was granted for this op.', { reason: 'no-lease' });
        stopped();
      }
      if (env.now() >= grant.deadline - GRANT_MARGIN_MS) {
        terminate('timeout', 'The page lease expired.', { reason: 'lease-expired' });
        stopped();
      }
      if (env.isHidden()) {
        terminate('tab-hidden', 'The ChatGPT tab must be in the foreground for this step.');
        stopped();
      }
    }
    const challenge = env.challenge();
    if (challenge) {
      terminate(challenge, 'ChatGPT is asking the person to act on this page.');
      stopped();
    }
    if (env.pathname() !== routeAtStart) {
      terminate('cancelled', 'The page left the route the op started on.', {
        reason: 'route-changed',
      });
      stopped();
    }
    if (!env.hasExtensionContext()) {
      terminate('extension-reloaded', 'The extension was reloaded.');
      stopped();
    }
  };

  const sleep = (ms: number): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const signal = controller.signal;
      if (signal.aborted) {
        reject(signal.reason);
        return;
      }
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(signal.reason);
      };
      const timer = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
      signal.addEventListener('abort', onAbort, { once: true });
    });

  return {
    taskId: options.taskId,
    op: options.op,
    signal: controller.signal,
    interactive,
    grant,
    now: env.now,
    get terminated() {
      return terminated;
    },
    get pageEventsEnded() {
      return pageEventsEnded;
    },
    guard,
    dispatch(target, event) {
      guard();
      return target.dispatchEvent(event);
    },
    click(element) {
      guard();
      element.click();
    },
    insertText(field, text) {
      guard();
      return insertIntoComposer(field, text, 'append');
    },
    endPageEvents() {
      pageEventsEnded = true;
    },
    sleep,
    async waitFor(probe, { timeoutMs, intervalMs = DEFAULT_POLL_MS }) {
      const until = env.now() + timeoutMs;
      for (;;) {
        if (controller.signal.aborted) stopped();
        const value = probe();
        if (value !== null && value !== undefined && value !== false) return value;
        const left = until - env.now();
        if (left <= 0) return null;
        await sleep(Math.min(intervalMs, left));
      }
    },
    fail(code, message, details) {
      if (controller.signal.aborted) stopped();
      throw new OpFailure(bridgeError(code, message, details));
    },
    terminate,
    progress(event) {
      if (!controller.signal.aborted) options.onProgress?.(event);
    },
  };
}
