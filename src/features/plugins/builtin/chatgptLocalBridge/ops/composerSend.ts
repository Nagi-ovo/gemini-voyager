/**
 * `composer.send` (spec §3.4, leased): write the prompt into an empty composer,
 * press the composer's own send control once, then confirm the send.
 *
 * The composer belongs to the person first: any draft, attachment we were not
 * told about, or input from them in the last {@link RECENT_INPUT_MS} makes this
 * `composer-busy`, and their draft is never cleared.
 *
 * Confirmation needs both halves the result reports, read together from the page
 * as it is: our new prompt, still the newest in the visible thread, and the route
 * of that same conversation, named by the server (an existing chat keeps its id; a
 * new chat passes through a provisional `local-…` id first). Once the
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
import { readConversationId } from '@/features/plugins/builtin/chatgptResponseNotification/page';
import type { SiteAdapter } from '@/features/plugins/types';

import { type OpContext, OpFailure, OpTermination } from '../opContext';
import { holdsAnyAttachment, inventoryAttachments } from './attachmentEvidence';
import { readMode, readPageLanguage } from './conversationReady';
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
  // The route guard only holds the route this op started on: a switch made before the op began
  // must be caught here, before the first page event. Later route changes terminate in guard().
  if (params.expect && settledConversationId() !== params.expect.conversationId) {
    ctx.fail('unverified', 'The tab shows another conversation.', {
      reason: 'conversation-mismatch',
      expected: params.expect.conversationId,
      actual: settledConversationId(),
    });
  }
  const field = await ctx.waitFor(() => findComposerField(adapter), {
    timeoutMs: COMPOSER_TIMEOUT_MS,
  });
  if (!field) ctx.fail('selector-missing', 'The ChatGPT composer was not found.');
  // Fail closed on its own, whoever calls: only a composer that positively reads as chat
  // takes a prompt, never Work or one whose label this build has not measured (other UI languages).
  const checkChatMode = (): void => {
    const { mode, labels } = readMode(field);
    if (mode === 'chat') return;
    ctx.fail(
      mode === 'work' ? 'mode-unavailable' : 'mode-unknown',
      mode === 'work'
        ? 'The composer is in ChatGPT Work mode.'
        : 'The composer does not show chat mode under a label this build knows.',
      { mode, lang: readPageLanguage(), composerLabels: labels },
    );
  };
  checkChatMode();
  const form = composerFormOf(field);
  const expected = params.expectAttachments ?? [];

  if (normalizeForCompare(readComposer(field)) !== '') {
    ctx.fail('composer-busy', 'The composer holds a draft.', { reason: 'draft' });
  }
  const checkAttachments = (): void => {
    if (expected.length === 0) {
      if (holdsAnyAttachment(form, field)) {
        ctx.fail('composer-busy', 'The composer holds attachments.', { reason: 'attachments' });
      }
      return;
    }
    // The whole set, not only the expected files: a file beside them would go out too.
    const { missing, ambiguous, unexpected } = inventoryAttachments(form, field, expected);
    if (missing.length > 0) {
      ctx.fail('attachment-rejected', 'An expected attachment is not in the composer.', {
        missing,
      });
    }
    if (unexpected > 0 || ambiguous.length > 0) {
      ctx.fail('composer-busy', 'The composer holds attachments this task did not attach.', {
        reason: 'attachments',
        unexpected,
        ambiguous,
      });
    }
  };
  checkAttachments();
  if (activity.hadRecentUserInput(RECENT_INPUT_MS)) {
    ctx.fail('composer-busy', 'The person is using the composer.', { reason: 'recent-input' });
  }
  if (hasStopControl(adapter)) {
    ctx.fail('composer-busy', 'ChatGPT is still writing a reply.', { reason: 'generating' });
  }

  const baseline = new Set(conversationItems().map(readTurnKey));
  const wanted = normalizeForCompare(params.text);
  // The conversation the prompt goes to: an existing chat keeps its id; a new one has none yet.
  const startId = settledConversationId();
  const startRoute = readConversationId();
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
  // Files can be added while the control enables; only the expected set may go out.
  checkAttachments();
  // The mode switch is outside the composer, so a switch to Work meanwhile is no recent input.
  checkChatMode();

  ctx.click(button);
  ctx.endPageEvents();
  const prefix = wanted.slice(0, PROMPT_PREFIX_CHARS);
  const route = followConversation(startId, startRoute);
  let userTurnKey: string | null = null;
  let conversationId: string | null = null;
  let left = false;
  const confirmMs = Math.min(
    CONFIRM_MAX_MS,
    Math.max(CONFIRM_MIN_MS, ctx.grant.deadline - ctx.now()),
  );
  try {
    const confirmed = await ctx.waitFor(
      () => {
        const observed = route.observe();
        if (observed === LEFT) {
          left = true;
          return LEFT;
        }
        conversationId = observed;
        // Both halves are read from the page as it is now, never from an earlier look:
        // a prompt seen in one chat must not confirm a send under another chat's id.
        const prompts = conversationItems().filter((item) => userTextOf(item) !== null);
        const newest = prompts.at(-1);
        const key = newest ? readTurnKey(newest) : '';
        const ours =
          !!newest && !!key && !baseline.has(key) && !!userTextOf(newest)?.startsWith(prefix);
        if (ours && userTurnKey === null) userTurnKey = key;
        const holds = ours && key === userTurnKey;
        // A new chat holds our prompt alone; another chat with these words does not pass.
        const fresh = startId !== null || prompts.length === 1;
        return holds && fresh && conversationId ? { userTurnKey: key, conversationId } : null;
      },
      { timeoutMs: confirmMs },
    );
    if (confirmed && confirmed !== LEFT) return { ...confirmed, url: location.href };
  } catch (error) {
    const cause = error instanceof OpTermination || error instanceof OpFailure ? error.error : null;
    sendUnverified(cause, { userTurnKey, conversationId });
  }
  return sendUnverified(null, {
    userTurnKey,
    conversationId,
    ...(left ? { reason: 'conversation-changed' } : {}),
  });
}

const LEFT = Symbol('left');

/**
 * The route's conversation after the send: the settled id it confirms under, or
 * `LEFT` once the page shows another conversation. An existing chat must keep
 * its id; a new chat may only go `/` → provisional `local-…` → one settled id.
 */
function followConversation(startId: string | null, startRoute: string | null) {
  let bound = startId;
  let last = startRoute;
  let gone = false;
  return {
    observe(): string | null | typeof LEFT {
      if (gone) return LEFT;
      const routeId = readConversationId();
      if (bound !== null) {
        if (routeId !== bound) gone = true;
        return gone ? LEFT : bound;
      }
      if (routeId !== last) {
        const named = settledConversationId();
        const provisional = routeId !== null && routeId.startsWith('local-');
        const fromNew = last === null || last.startsWith('local-');
        if (named && fromNew) bound = named;
        else if (!(provisional && last === null)) gone = true;
        last = routeId;
      }
      return gone ? LEFT : bound;
    },
  };
}
