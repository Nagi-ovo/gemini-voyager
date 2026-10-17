/**
 * `composer.send` (spec §3.4, leased): write the prompt into an empty composer,
 * press the composer's own send control once, then confirm the send.
 *
 * The composer belongs to the person first: any draft, attachment we were not
 * told about, or input from them in the last {@link RECENT_INPUT_MS} makes this
 * `composer-busy`, and their draft is never cleared.
 *
 * Confirmation needs both halves the result reports: a new prompt in the thread
 * whose text starts like ours, and a route whose conversation id the server has
 * named (a new chat passes through a provisional `local-…` id first). Once the
 * click went out, every failure — a terminate included — is `send-unverified`:
 * the prompt may have been sent, so the caller must never send it again.
 */
import { readComposer } from '@/core/services/composer';
import {
  type BridgeError,
  type ComposerSendParams,
  type ComposerSendResult,
  bridgeError,
} from '@/features/bridge/protocol';
import {
  hasAttachmentPreview,
  hasComposerAttachments,
} from '@/features/plugins/builtin/chatgptTemporaryHandoff/composerDelivery';
import type { SiteAdapter } from '@/features/plugins/types';

import { type OpContext, OpFailure, OpTermination } from '../opContext';
import {
  composerFormOf,
  conversationItems,
  findComposerField,
  findSendButton,
  hasStopControl,
  isEnabledButton,
  normalizeForCompare,
  readTurnKey,
  settledConversationId,
  userTextOf,
} from './pageReaders';

export const RECENT_INPUT_MS = 8_000;
const COMPOSER_TIMEOUT_MS = 10_000;
const SEND_ENABLED_TIMEOUT_MS = 5_000;
const FILL_CONFIRM_MS = 1_500;
const CONFIRM_MIN_MS = 5_000;
const CONFIRM_MAX_MS = 60_000;
const PROMPT_PREFIX_CHARS = 120;

export interface ComposerActivity {
  /** Whether the person typed, pasted, dropped or pressed in a composer within `ms`. */
  hadRecentUserInput(ms: number): boolean;
}

function sendUnverified(cause: BridgeError | null, evidence: Record<string, unknown>): never {
  throw new OpFailure(
    bridgeError('send-unverified', 'The send was pressed but could not be confirmed.', {
      sent: 'unknown',
      ...evidence,
      ...(cause ? { cause: cause.code } : {}),
    }),
  );
}

export async function runComposerSend(
  ctx: OpContext,
  params: ComposerSendParams,
  adapter: SiteAdapter | null,
  activity: ComposerActivity,
): Promise<ComposerSendResult> {
  const field = await ctx.waitFor(() => findComposerField(adapter), {
    timeoutMs: COMPOSER_TIMEOUT_MS,
  });
  if (!field) ctx.fail('selector-missing', 'The ChatGPT composer was not found.');
  const form = composerFormOf(field);
  const expected = params.expectAttachments ?? [];

  if (normalizeForCompare(readComposer(field)) !== '') {
    ctx.fail('composer-busy', 'The composer holds a draft.', { reason: 'draft' });
  }
  if (expected.length === 0 && hasComposerAttachments(form)) {
    ctx.fail('composer-busy', 'The composer holds attachments.', { reason: 'attachments' });
  }
  const missing = expected.filter((name) => !hasAttachmentPreview(field, name));
  if (missing.length > 0) {
    ctx.fail('attachment-rejected', 'An expected attachment is not in the composer.', { missing });
  }
  if (activity.hadRecentUserInput(RECENT_INPUT_MS)) {
    ctx.fail('composer-busy', 'The person is using the composer.', { reason: 'recent-input' });
  }
  if (hasStopControl(adapter)) {
    ctx.fail('composer-busy', 'ChatGPT is still writing a reply.', { reason: 'generating' });
  }

  const baseline = new Set(conversationItems().map(readTurnKey));
  const wanted = normalizeForCompare(params.text);
  ctx.insertText(field, params.text);
  // The editor may commit its transaction a frame later than the command returns.
  const filled = await ctx.waitFor(() => normalizeForCompare(readComposer(field)) === wanted, {
    timeoutMs: FILL_CONFIRM_MS,
  });
  if (!filled) {
    ctx.fail('unverified', 'The composer did not take the prompt as written.', { stage: 'fill' });
  }

  const button = await ctx.waitFor(
    () => {
      const candidate = findSendButton(field, adapter);
      return candidate && isEnabledButton(candidate) ? candidate : null;
    },
    { timeoutMs: SEND_ENABLED_TIMEOUT_MS },
  );
  if (!button) ctx.fail('selector-missing', 'The send control did not become available.');
  // The person may have started typing while the control enabled: their words must not go out.
  if (
    activity.hadRecentUserInput(RECENT_INPUT_MS) ||
    normalizeForCompare(readComposer(field)) !== wanted
  ) {
    ctx.fail('composer-busy', 'The person is using the composer.', { reason: 'recent-input' });
  }

  ctx.click(button);
  ctx.endPageEvents();
  const prefix = wanted.slice(0, PROMPT_PREFIX_CHARS);
  let userTurnKey: string | null = null;
  let conversationId: string | null = null;
  const confirmMs = Math.min(
    CONFIRM_MAX_MS,
    Math.max(CONFIRM_MIN_MS, ctx.grant.deadline - ctx.now()),
  );
  try {
    const confirmed = await ctx.waitFor(
      () => {
        // The newest prompt only: an older, identical one may mount as the thread scrolls.
        const turn = conversationItems()
          .filter((item) => userTextOf(item) !== null)
          .at(-1);
        if (turn && !baseline.has(readTurnKey(turn)) && userTextOf(turn)?.startsWith(prefix)) {
          userTurnKey ??= readTurnKey(turn) || null;
        }
        conversationId = settledConversationId();
        return userTurnKey && conversationId ? { userTurnKey, conversationId } : null;
      },
      { timeoutMs: confirmMs },
    );
    if (confirmed) return { ...confirmed, url: location.href };
  } catch (error) {
    const cause = error instanceof OpTermination || error instanceof OpFailure ? error.error : null;
    sendUnverified(cause, { userTurnKey, conversationId });
  }
  return sendUnverified(null, { userTurnKey, conversationId });
}
