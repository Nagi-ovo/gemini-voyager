import { extractRouteUserIdFromUrl } from '@/core/services/AccountIsolationService';
import {
  extractConversationIdFromUrl,
  normalizeConversationUrl,
} from '@/core/utils/conversationIdentity';

import {
  type AccountHints,
  accountSlotOf,
  isDifferentAccount,
} from '../selectionToolbar/pageIdentity';

/** Which conversation, under which signed-in account, a page shows. */
export interface ConversationSession extends AccountHints {
  /** Gemini conversation id; null on a new chat that has no address yet. */
  readonly conversationId: string | null;
  /** Origin plus path, without the account slot, query or hash. */
  readonly route: string;
}

/**
 * - `same`: the page still shows the captured conversation.
 * - `addressed`: a new chat got its first address (`/app` → `/app/<id>`); its
 *   identity is only a candidate, pending fresh DOM turn confirmation.
 * - `switched`: another conversation or another account.
 */
export type SessionTransition = 'same' | 'addressed' | 'switched';

export function readConversationSession(
  href: string,
  email: string | null = null,
): ConversationSession {
  return {
    routeUserId: extractRouteUserIdFromUrl(href),
    email,
    conversationId: extractConversationIdFromUrl(href),
    route: normalizeConversationUrl(href),
  };
}

export function compareSessions(
  captured: ConversationSession,
  current: ConversationSession,
): SessionTransition {
  if (isDifferentAccount(captured, current)) return 'switched';
  if (captured.route === current.route) return 'same';
  if (captured.conversationId !== null) {
    return captured.conversationId === current.conversationId ? 'same' : 'switched';
  }
  // Opening an existing chat from a new-chat route has the same shape; the run
  // must confirm with a fresh DOM turn; optional protocol hints only veto.
  return current.conversationId !== null && current.route.startsWith(`${captured.route}/`)
    ? 'addressed'
    : 'switched';
}

export function sessionKey(session: ConversationSession): string {
  return `${accountSlotOf(session.routeUserId)}|${session.route}`;
}
