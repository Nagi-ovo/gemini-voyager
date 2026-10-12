import { detectAccountContextFromDocument } from '@/core/services/AccountIsolationService';

import { type AccountHints, isDifferentAccount } from '../selectionToolbar/pageIdentity';

/** The account the page names right now: its `/u/N` slot and the email it shows, if any. */
export function readPageAccountHints(): AccountHints {
  const { routeUserId, email } = detectAccountContextFromDocument(location.href, document);
  return { routeUserId, email };
}

/**
 * Compare the account shown records were loaded for with the page now. `switched` is another
 * signed-in account (the email went from A to B, or the slot moved); otherwise the hints to keep,
 * with an email that only appeared since filled in, so a later change away from it still counts.
 */
export function followPageAccount(
  loaded: AccountHints,
  now: AccountHints = readPageAccountHints(),
): AccountHints | 'switched' {
  if (isDifferentAccount(loaded, now)) return 'switched';
  return loaded.email === null ? now : loaded;
}
