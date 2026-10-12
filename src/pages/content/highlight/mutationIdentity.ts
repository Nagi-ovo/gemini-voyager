import type { HighlightAccountScope } from '@/core/types/highlight';

import {
  type PageIdentity,
  capturePageIdentity,
  isDifferentAccount,
} from '../selectionToolbar/pageIdentity';

/** Who a highlight create, edit or delete belongs to, taken when the user acted. */
export interface MutationIdentity {
  readonly page: PageIdentity;
  /** The manager's route epoch; a later route makes the action's UI result stale. */
  readonly epoch: number;
  /** The page's account scope at that moment, or null before the first one resolved. */
  readonly scope: HighlightAccountScope | null;
}

/** `default` and `route:N` keys are placeholders an email can still complete. */
function isCompleteScope(scope: HighlightAccountScope): boolean {
  return scope.accountKey !== 'default' && !scope.accountKey.startsWith('route:');
}

/**
 * True when the action's account is gone: the page now shows another `/u/N` slot or email, or the
 * scope resolved from the action's own hints names a different complete account than the page had.
 * A `default` or route-only scope filling in to an email account is a completion, not a switch.
 */
export function isAccountSwitch(
  identity: MutationIdentity,
  resolved: HighlightAccountScope,
  now: PageIdentity = capturePageIdentity(),
): boolean {
  if (isDifferentAccount(identity.page, now)) return true;
  const captured = identity.scope;
  if (!captured) return false;
  if (captured.platform !== resolved.platform) return true;
  return (
    isCompleteScope(captured) &&
    isCompleteScope(resolved) &&
    captured.accountKey !== resolved.accountKey
  );
}

/**
 * The page still shows the chat and account the action started from. Route keys and account
 * slots compare `/app` and `/u/0` as one account (`pageIdentity.ts`).
 */
export function isSameMutationPage(
  identity: MutationIdentity,
  now: PageIdentity = capturePageIdentity(),
): boolean {
  return identity.page.routeKey === now.routeKey && !isDifferentAccount(identity.page, now);
}
