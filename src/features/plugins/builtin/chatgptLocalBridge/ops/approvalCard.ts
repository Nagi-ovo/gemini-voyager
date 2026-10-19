/**
 * ChatGPT's approval card: when one of its apps (Google Drive, GitHub…) is
 * about to run a tool the person's app permissions do not cover, the reply
 * stops on a card in the thread ("允许 ChatGPT 使用 Google Drive 吗？") until
 * someone answers it. Clicking "Always allow" once does not keep it away: the
 * card comes back in later conversations (seen 2026-10-18 and 10-20).
 *
 * `turns.waitReply` with `stopOnApproval` fails `approval-required` on it, and
 * `turns.approve` (leased) clicks the answer the CLI was told to give.
 *
 * Measured structure (zh-CN, 2026-10-20, voyager-cli
 * docs/notes/2026-10-20-approval-card): a container whose classes include
 * `@container/approval-card`, holding a `role="alert"` header (app icon and
 * name, the question) and a form of buttons without test ids or labels. The
 * buttons are told apart by their keyboard hints, not their words, so any UI
 * language works: "Allow once" shows ⏎, "Deny" shows Esc, and "Always allow"
 * is the one button with text and no hint.
 */
import type {
  ApprovalCardEvidence,
  ApprovalChoice,
  TurnsApproveParams,
  TurnsApproveResult,
} from '@/features/bridge/protocol';

import type { OpContext } from '../opContext';
import { conversationItems, readTurnKey, settledConversationId, userTextOf } from './pageReaders';

const CARD_SELECTOR = '[class~="@container/approval-card"]';
const ONCE_HINTS = new Set(['⏎', '↵', 'enter', 'return']);
/** The card leaves the thread within about 5 s of a click (measured); give it twice that. */
const ANSWERED_WITHIN_MS = 10_000;

const flat = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();

/** The approval card in the reply to the prompt `afterUserTurnKey`, if there is one. */
export function findApprovalCard(afterUserTurnKey: string): HTMLElement | null {
  const items = conversationItems();
  const index = items.findIndex((item) => readTurnKey(item) === afterUserTurnKey);
  if (index < 0) return null;
  for (const item of items.slice(index)) {
    // A later prompt's item holds that prompt's reply, never this one's.
    if (item !== items[index] && userTextOf(item) !== null) break;
    const card = item.querySelector<HTMLElement>(CARD_SELECTOR);
    if (card) return card;
  }
  return null;
}

interface CardButtons {
  readonly always: HTMLButtonElement | null;
  readonly once: HTMLButtonElement | null;
  /** Every button's text, for the evidence when a choice cannot be told apart. */
  readonly texts: readonly string[];
}

function buttonsOf(card: HTMLElement): CardButtons {
  const buttons = Array.from(card.querySelectorAll<HTMLButtonElement>('form button'));
  const hintOf = (button: HTMLButtonElement): string =>
    flat(button.querySelector('kbd')?.textContent).toLowerCase();
  const only = (matches: HTMLButtonElement[]): HTMLButtonElement | null =>
    matches.length === 1 ? matches[0] : null;
  return {
    once: only(buttons.filter((button) => ONCE_HINTS.has(hintOf(button)))),
    always: only(
      buttons.filter((button) => !button.querySelector('kbd') && flat(button.textContent) !== ''),
    ),
    texts: buttons.map((button) => flat(button.textContent)),
  };
}

/** What the card asks, as `approval-required` reports it. */
export function describeApprovalCard(card: HTMLElement): ApprovalCardEvidence {
  const buttons = buttonsOf(card);
  const choices: ApprovalChoice[] = [];
  if (buttons.always) choices.push('always');
  if (buttons.once) choices.push('once');
  return {
    app: flat(card.querySelector('[role="alert"] svg + span')?.textContent),
    text: flat(card.textContent).slice(0, 300),
    choices,
  };
}

/**
 * `turns.approve`: click `choice` on the card in the reply, then wait for the
 * card to leave the thread. No card left is not a failure: someone answered it.
 */
export async function runTurnsApprove(
  ctx: OpContext,
  params: TurnsApproveParams,
): Promise<TurnsApproveResult> {
  if (settledConversationId() !== params.conversationId) {
    ctx.fail('unverified', 'The tab shows another conversation.', {
      expected: params.conversationId,
      actual: settledConversationId(),
    });
  }
  const card = findApprovalCard(params.afterUserTurnKey);
  if (!card) return { clicked: false, app: '', evidence: { reason: 'no-card' } };
  const described = describeApprovalCard(card);
  const buttons = buttonsOf(card);
  const button = params.choice === 'always' ? buttons.always : buttons.once;
  if (!button || button.disabled) {
    ctx.fail('selector-missing', `The approval card has no single "${params.choice}" button.`, {
      app: described.app,
      buttons: buttons.texts,
    });
  }
  ctx.click(button);
  const answered = await ctx.waitFor(
    () => !card.isConnected || findApprovalCard(params.afterUserTurnKey) !== card,
    { timeoutMs: ANSWERED_WITHIN_MS },
  );
  // Clicked but still showing: never click again on a guess.
  if (!answered) {
    ctx.fail('unverified', 'The approval card is still showing after the click.', {
      app: described.app,
      choice: params.choice,
    });
  }
  return {
    clicked: true,
    app: described.app,
    evidence: { choice: params.choice, button: flat(button.textContent) },
  };
}
