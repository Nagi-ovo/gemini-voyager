/**
 * `turns.waitReply` (spec §3.4, passive): watch the reply to one prompt until
 * it is proven finished, for as long as a Pro answer takes.
 *
 * A turn finishes only on positive evidence, never on quiet alone (a settled
 * preamble before a long thinking phase looks quiet too). Every check must
 * hold at once:
 * - the reply's action row has rendered and held for {@link BAR_CONFIRM_CYCLES}
 *   unchanged polls — the row can flash mid-thinking, so one sighting is not
 *   enough;
 * - the reply's text has not changed for `stableMs`, and is not empty;
 * - no stop control in the composer, no thinking or streaming marker in the turn;
 * - the turn's `data-talvt-turn-state` reads `complete` when the turn carries
 *   one (its generating value was never observed, so any other value vetoes).
 *
 * The page is never touched: no scroll, no click. Progress goes out every
 * {@link PROGRESS_EVERY_MS}; a hidden tab's throttled timers may stretch that.
 */
import {
  type TurnsWaitReplyParams,
  type TurnsWaitReplyResult,
  WAIT_REPLY_DEFAULT_STABLE_MS,
  WAIT_REPLY_DEFAULT_TIMEOUT_MS,
  type WaitReplyProgress,
} from '@/features/bridge/protocol';
import { hasReplyActions } from '@/features/plugins/builtin/chatgptResponseNotification/page';
import type { SiteAdapter } from '@/features/plugins/types';

import type { OpContext } from '../opContext';
import {
  conversationItems,
  findReply,
  hashText,
  hasStopControl,
  hasThinkingSignal,
  isCompleteTurnState,
  readTurnKey,
  replyIdOf,
  replyTextOf,
  settledConversationId,
  turnStateOf,
  userTextOf,
} from './pageReaders';

export const PROGRESS_EVERY_MS = 15_000;
export const BAR_CONFIRM_CYCLES = 3;
const POLL_MS = 1_000;
// ChatGPT's terminal failure copy (oracle's measured English form); never retried here.
const THINKING_FAILED = /^thinking failed[.!]?(?:\s+retry)?$/i;
// Usage-cap and throttling banners, English forms; other UI languages are unverified.
const RATE_LIMIT_COPY =
  /too many requests|sending too many requests|temporarily limited access|please wait a few minutes|rate limit(?:ed)?|usage cap|you've reached/i;
const ALERT_SELECTOR = '[role="alert"], [aria-live="assertive"]';

interface Gate {
  contentKey: string;
  changedAt: number;
  barCycles: number;
}

function findTarget(
  afterUserTurnKey: string,
): { item: HTMLElement; reply: HTMLElement | null } | null {
  const items = conversationItems();
  const index = items.findIndex((item) => readTurnKey(item) === afterUserTurnKey);
  if (index < 0) return null;
  // ChatGPT keeps the reply in the prompt's own item; earlier DOMs gave it the next one.
  for (const item of items.slice(index)) {
    // A later prompt's item holds that prompt's reply, never this one's.
    if (item !== items[index] && userTextOf(item) !== null) break;
    const reply = findReply(item);
    if (reply) return { item, reply };
    if (item !== items[index]) break;
  }
  return { item: items[index], reply: null };
}

function rateLimitBanner(): string | null {
  for (const alert of document.querySelectorAll<HTMLElement>(ALERT_SELECTOR)) {
    if (alert.closest('[data-turn-key]')) continue;
    const text = (alert.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (text && RATE_LIMIT_COPY.test(text)) return text.slice(0, 300);
  }
  return null;
}

export async function runTurnsWaitReply(
  ctx: OpContext,
  params: TurnsWaitReplyParams,
  adapter: SiteAdapter | null,
): Promise<TurnsWaitReplyResult> {
  const startedAt = ctx.now();
  const timeoutMs = params.timeoutMs ?? WAIT_REPLY_DEFAULT_TIMEOUT_MS;
  const stableMs = params.stableMs ?? WAIT_REPLY_DEFAULT_STABLE_MS;
  const onRoute = (): boolean => settledConversationId() === params.conversationId;
  if (!onRoute()) {
    ctx.fail('unverified', 'The tab shows another conversation.', {
      expected: params.conversationId,
      actual: settledConversationId(),
    });
  }

  let gate: Gate = { contentKey: '', changedAt: startedAt, barCycles: 0 };
  let lastProgressAt = startedAt;
  let sawStop = false;
  let phase: WaitReplyProgress['phase'] = 'thinking';
  let textLength = 0;

  for (;;) {
    const now = ctx.now();
    if (!onRoute()) {
      ctx.fail('cancelled', 'The tab left the conversation.', {
        reason: 'route-changed',
        conversationId: params.conversationId,
      });
    }
    const banner = rateLimitBanner();
    if (banner) ctx.fail('rate-limited', 'ChatGPT reports a usage limit.', { banner });

    const target = findTarget(params.afterUserTurnKey);
    const reply = target?.reply ?? null;
    const text = reply ? replyTextOf(reply) : '';
    if (reply && THINKING_FAILED.test(text)) {
      ctx.fail('reply-failed', 'ChatGPT could not finish the reply.', {
        conversationId: params.conversationId,
      });
    }
    const stop = hasStopControl(adapter);
    sawStop ||= stop;
    const thinking = target ? hasThinkingSignal(target.item) : false;
    const turnState = target ? turnStateOf(target.item) : null;
    const bar = reply ? hasReplyActions(reply) : false;
    const contentKey = reply ? `${replyIdOf(reply) ?? ''}|${hashText(text)}` : '';
    const changed = contentKey !== gate.contentKey;
    const quiet = !stop && !thinking && (turnState === null || isCompleteTurnState(turnState));
    gate = {
      contentKey,
      changedAt: changed ? now : gate.changedAt,
      barCycles: bar && quiet && !changed ? gate.barCycles + 1 : 0,
    };
    textLength = text.length;

    if (
      target &&
      reply &&
      text.length > 0 &&
      quiet &&
      bar &&
      gate.barCycles >= BAR_CONFIRM_CYCLES &&
      now - gate.changedAt >= stableMs
    ) {
      return {
        assistantTurnKey: replyIdOf(reply) ?? readTurnKey(target.item),
        status: 'complete',
        elapsedMs: now - startedAt,
        evidence: {
          turnState,
          barCycles: gate.barCycles,
          stableForMs: now - gate.changedAt,
          sawStop,
          itemKey: readTurnKey(target.item),
        },
      };
    }

    phase =
      !reply || text.length === 0 || thinking
        ? 'thinking'
        : bar && quiet
          ? 'finalizing'
          : 'streaming';
    if (now - lastProgressAt >= PROGRESS_EVERY_MS) {
      lastProgressAt = now;
      ctx.progress({ phase, textLength, elapsedMs: now - startedAt });
    }
    if (now - startedAt >= timeoutMs) {
      ctx.fail('timeout', 'The reply did not finish in time.', {
        conversationId: params.conversationId,
        phase,
        textLength,
      });
    }
    await ctx.sleep(Math.min(POLL_MS, Math.max(1, startedAt + timeoutMs - now)));
  }
}
