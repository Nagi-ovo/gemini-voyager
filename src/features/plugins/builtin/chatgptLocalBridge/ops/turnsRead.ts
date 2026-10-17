/**
 * `turns.read` (spec §3.4, passive): one finished reply as Markdown, through
 * the export's own extractor and ChatGPT dialect. No clipboard hook, no
 * backend JSON. The localized role heading ("ChatGPT 说：") is left out by
 * structure; a heading text line is dropped only as a fallback.
 *
 * Phase B reports no file candidates; `files.download` arrives in Phase C.
 */
import type { TurnsReadParams, TurnsReadResult } from '@/features/bridge/protocol';
import { createContentExtractor } from '@/features/export/services/DOMContentExtractor';
import type { SiteAdapter } from '@/features/plugins/types';
import { extractAssistantMessage } from '@/pages/content/export/adapter/chatgptThread';
import { buildChatGptAdapter } from '@/pages/content/export/adapter/platform/chatgpt';

import type { OpContext } from '../opContext';
import {
  ASSISTANT_HEADING_SELECTOR,
  conversationItems,
  findReply,
  hasStopControl,
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
  const found = findReplyByKey(params.assistantTurnKey);
  if (!found) ctx.fail('selector-missing', 'The reply is not on the page.');
  const state = turnStateOf(found.item);
  if ((state !== null && !isCompleteTurnState(state)) || hasStopControl(adapter)) {
    ctx.fail('unverified', 'The reply is still being written.', { reason: 'still-generating' });
  }

  const extractor = createContentExtractor(buildChatGptAdapter(siteOf(adapter)));
  const content = extractAssistantMessage(found.item, withoutHeading(found.reply), extractor);
  const markdown = content.text.trim().replace(HEADING_LINE, '').trim();
  const messageId = replyIdOf(found.reply);
  return {
    markdown,
    turnKey: params.assistantTurnKey,
    ...(messageId ? { messageId } : {}),
    textSha256: await sha256Hex(markdown),
    files: [],
  };
}
