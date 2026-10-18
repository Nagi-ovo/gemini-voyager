/**
 * `turns.read` (spec §3.4, passive): one finished reply as Markdown, through
 * the export's own extractor and ChatGPT dialect. No clipboard hook, no
 * backend JSON. The localized role heading ("ChatGPT 说：") is left out by
 * structure; a heading text line is dropped only as a fallback.
 *
 * With `latest` it reads the conversation's last turn, once the thread has
 * stopped mounting turns. That turn must show a finished reply: one still being
 * written is `unverified`, never an earlier reply in its place.
 *
 * Phase B reports no file candidates; `files.download` arrives in Phase C.
 */
import type { TurnsReadParams, TurnsReadResult } from '@/features/bridge/protocol';
import { createContentExtractor } from '@/features/export/services/DOMContentExtractor';
import { hasReplyActions } from '@/features/plugins/builtin/chatgptResponseNotification/page';
import type { SiteAdapter } from '@/features/plugins/types';
import { extractAssistantMessage } from '@/pages/content/export/adapter/chatgptThread';
import { buildChatGptAdapter } from '@/pages/content/export/adapter/platform/chatgpt';

import type { OpContext } from '../opContext';
import {
  ASSISTANT_HEADING_SELECTOR,
  conversationItems,
  findReply,
  hasStopControl,
  hasThinkingSignal,
  isCompleteTurnState,
  readTurnKey,
  replyIdOf,
  settledConversationId,
  sha256Hex,
  siteOf,
  turnStateOf,
} from './pageReaders';

// Fallback only: the heading's text in the UI languages measured or shipped by ChatGPT.
const HEADING_LINE = /^(?:#{1,6}\s*)?(?:ChatGPT said:|ChatGPT 说：|ChatGPT 說：)\s*\n+/;

function findReplyByKey(key: string): { item: HTMLElement; reply: HTMLElement } | null {
  for (const item of conversationItems()) {
    const reply = findReply(item);
    if (!reply) continue;
    if (replyIdOf(reply) === key || readTurnKey(item) === key) return { item, reply };
  }
  return null;
}

const SETTLE_POLL_MS = 500;
/** Polls in a row the thread's last turn must stay the same before it counts as the last. */
const SETTLE_POLLS = 3;
const SETTLE_TIMEOUT_MS = 15_000;

interface FoundReply {
  readonly item: HTMLElement;
  readonly reply: HTMLElement;
  readonly turnKey: string;
}

/** The last mounted turn, once the opened thread stops adding turns; null when none mounts. */
async function settledLastItem(ctx: OpContext): Promise<HTMLElement | null> {
  let previous: string | null = null;
  let same = 0;
  const settled = await ctx.waitFor(
    () => {
      const items = conversationItems();
      const last = items.at(-1);
      if (!last) return null;
      const key = `${items.length}|${readTurnKey(last)}|${findReply(last) ? 'r' : ''}`;
      same = key === previous ? same + 1 : 0;
      previous = key;
      return same + 1 >= SETTLE_POLLS ? last : null;
    },
    { timeoutMs: SETTLE_TIMEOUT_MS, intervalMs: SETTLE_POLL_MS },
  );
  return settled ?? null;
}

/**
 * The conversation's last turn and its reply, proven finished: the reply has
 * rendered with its action row, the turn state (when the turn has one) reads
 * complete, and nothing is still thinking or streaming.
 */
async function findLatestReply(ctx: OpContext, adapter: SiteAdapter | null): Promise<FoundReply> {
  const item = await settledLastItem(ctx);
  if (!item) {
    if (conversationItems().length > 0) {
      ctx.fail('unverified', 'The conversation kept changing while it was read.', {
        reason: 'thread-unsettled',
      });
    }
    ctx.fail('selector-missing', 'The conversation shows no turns.');
  }
  const reply = findReply(item);
  const state = turnStateOf(item);
  const unfinished =
    !reply ||
    (state !== null && !isCompleteTurnState(state)) ||
    hasStopControl(adapter) ||
    hasThinkingSignal(item) ||
    !hasReplyActions(reply);
  if (unfinished) {
    ctx.fail('unverified', 'The last reply is still being written.', {
      reason: 'still-generating',
      turnState: state,
      hasReply: reply !== null,
    });
  }
  return { item, reply, turnKey: replyIdOf(reply) ?? readTurnKey(item) };
}

async function findKeyedReply(
  ctx: OpContext,
  key: string,
  adapter: SiteAdapter | null,
): Promise<FoundReply> {
  const found = findReplyByKey(key);
  if (!found) ctx.fail('selector-missing', 'The reply is not on the page.');
  const state = turnStateOf(found.item);
  if ((state !== null && !isCompleteTurnState(state)) || hasStopControl(adapter)) {
    ctx.fail('unverified', 'The reply is still being written.', { reason: 'still-generating' });
  }
  return { ...found, turnKey: key };
}

// Measured 2026-10-18: the reply's text; file cards and source chips render beside it.
const MARKDOWN_ROOT_SELECTOR = '[data-markdown-text-style="assistant-message"]';

/** The reply's one Markdown body when it has exactly one, else the whole reply. */
function replyBody(reply: HTMLElement): HTMLElement {
  const roots = reply.querySelectorAll<HTMLElement>(MARKDOWN_ROOT_SELECTOR);
  return roots.length === 1 ? roots[0] : withoutHeading(reply);
}

/** The reply without its role heading; a copy only when the heading sits inside it. */
function withoutHeading(reply: HTMLElement): HTMLElement {
  if (!reply.querySelector(ASSISTANT_HEADING_SELECTOR)) return reply;
  const copy = reply.cloneNode(true) as HTMLElement;
  copy.querySelectorAll(ASSISTANT_HEADING_SELECTOR).forEach((heading) => heading.remove());
  return copy;
}

export async function runTurnsRead(
  ctx: OpContext,
  params: TurnsReadParams,
  adapter: SiteAdapter | null,
): Promise<TurnsReadResult> {
  if (settledConversationId() !== params.conversationId) {
    ctx.fail('unverified', 'The tab shows another conversation.', {
      expected: params.conversationId,
      actual: settledConversationId(),
    });
  }
  const found =
    'latest' in params
      ? await findLatestReply(ctx, adapter)
      : await findKeyedReply(ctx, params.assistantTurnKey, adapter);

  const extractor = createContentExtractor(buildChatGptAdapter(siteOf(adapter)));
  const content = extractAssistantMessage(found.item, replyBody(found.reply), extractor);
  const markdown = content.text.trim().replace(HEADING_LINE, '').trim();
  const messageId = replyIdOf(found.reply);
  return {
    markdown,
    turnKey: found.turnKey,
    ...(messageId ? { messageId } : {}),
    textSha256: await sha256Hex(markdown),
    files: [],
  };
}
