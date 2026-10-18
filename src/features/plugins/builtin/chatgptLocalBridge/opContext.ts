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
import { readConversationId } from '@/features/plugins/builtin/chatgptResponseNotification/page';

import type { ChallengeKind } from './challengeGuard';
import {
  type Defer,
  type PageWakeSubscribe,
  type WaitOptions,
  type WakeCounts,
  createChannelDefer,
  createWaker,
} from './wake';

/**
 * A grant stops being usable this long before its deadline: clocks and delivery
 * are not exact, and a hidden tab's wake can come up to a second late.
 */
export const GRANT_MARGIN_MS = 1_000;

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
  /** Evidence only: every op runs in a background tab too. */
  readonly isHidden: () => boolean;
  readonly challenge: () => ChallengeKind | null;
  readonly hasExtensionContext: () => boolean;
  readonly pathname: () => string;
  /** Where a wait's look runs after a wake; a message task unless the tests' clock drives it. */
  readonly defer?: Defer;
}

const pageDefer = createChannelDefer();

export const defaultOpEnvironment = (
  challenge: () => ChallengeKind | null,
  defer: Defer = pageDefer,
): OpEnvironment => ({
  now: Date.now,
  isHidden: () => document.visibilityState === 'hidden',
  challenge,
  hasExtensionContext: hasValidExtensionContext,
  pathname: () => location.pathname,
  defer,
});

export interface OpContextOptions {
  readonly taskId: string;
  readonly op: OpName;
  readonly grant: BridgeGrant;
  /** Ops that dispatch page events need a lease (spec §3.2); a background tab is fine. */
  readonly interactive: boolean;
  readonly env: OpEnvironment;
  /** ChatGPT's answers and route reports, which wake a wait as page changes do. */
  readonly subscribe?: PageWakeSubscribe;
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
  /** The op is about to move the page to `pathname` itself; the guard accepts it from now on. */
  allowRoute(pathname: string): void;
  sleep(ms: number): Promise<void>;
  /**
   * Look at `probe` until it returns a value, or resolve `null` after `timeoutMs`:
   * at once, then on each page change, page data or route report (see `wake.ts`).
   */
  waitFor<T>(probe: () => T | null | undefined | false, options: WaitOptions): Promise<T | null>;
  /** The wakes of this op's waits so far, by reason. */
  wakes(): WakeCounts;
  /** The op ended: stop the waits' observers and listeners. */
  dispose(): void;
  fail(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>): never;
  terminate(code: ErrorCode, message: string, details?: Readonly<Record<string, unknown>>): void;
  progress(event: Readonly<Record<string, unknown>>): void;
}

/** The server's id of the conversation `pathname` shows; not a provisional `local-…` one. */
function namedConversation(pathname: string): string | null {
  const id = readConversationId(pathname);
  return id !== null && !id.startsWith('local-') ? id : null;
}

export function createOpContext(options: OpContextOptions): OpContext {
  const { env, grant, interactive } = options;
  const controller = new AbortController();
  const allowedRoutes = new Set([env.pathname()]);
  let terminated: BridgeError | null = null;
  let pageEventsEnded = false;
  const waker = createWaker({
    now: env.now,
    defer: env.defer ?? pageDefer,
    signal: controller.signal,
    subscribe: options.subscribe,
  });

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
    }
    const challenge = env.challenge();
    if (challenge) {
      terminate(challenge, 'ChatGPT is asking the person to act on this page.');
      stopped();
    }
    const pathname = env.pathname();
    const conversation = namedConversation(pathname);
    // ChatGPT rewrites `/c/<id>` of a project chat to `/g/<project>/c/<id>`: the same page.
    const sameConversation =
      conversation !== null &&
      [...allowedRoutes].some((route) => namedConversation(route) === conversation);
    if (!allowedRoutes.has(pathname) && !sameConversation) {
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
    allowRoute(pathname) {
      allowedRoutes.add(pathname);
    },
    sleep,
    waitFor: (probe, waitOptions) => waker.wait(probe, waitOptions),
    wakes: () => waker.counts(),
    dispose: () => waker.dispose(),
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
