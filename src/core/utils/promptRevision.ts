/**
 * Which of two copies of the same prompt (same id) a merge keeps.
 *
 * A copy's edit time is its own `updatedAt`, else its `createdAt`. A merge
 * never stamps the time it ran: that would make a copy look edited when it
 * was only synced, and a real but earlier edit from another device would then
 * lose to it. Pinning and unpinning bump `updatedAt` (see `promptPinning.ts`),
 * so a pin change wins like any other edit.
 */
export interface PromptCopy {
  text: string;
  name?: string;
  pinnedAt?: number | null;
  createdAt?: number;
  updatedAt?: number;
}

/** When this copy was last edited. */
export function promptEditTime(copy: PromptCopy): number {
  return copy.updatedAt || copy.createdAt || 0;
}

/**
 * What two copies edited at the same moment are told apart by. Only the order
 * has to be the same everywhere; a missing name sorts low, so a legacy copy
 * without one does not win a tie against a named copy.
 */
function contentKey(copy: PromptCopy): string {
  return JSON.stringify([copy.text, copy.name ?? '', copy.pinnedAt ?? 0]);
}

/**
 * Whether `incoming` replaces `current`. The later edit wins. On a tie the copy
 * with the greater content wins; equal content never replaces. Missing, null
 * and zero pins share a key, so same-time legacy copies may not converge.
 */
export function isNewerPromptCopy(incoming: PromptCopy, current: PromptCopy): boolean {
  const incomingTime = promptEditTime(incoming);
  const currentTime = promptEditTime(current);
  if (incomingTime !== currentTime) return incomingTime > currentTime;
  return contentKey(incoming) > contentKey(current);
}
