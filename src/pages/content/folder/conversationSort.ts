import type { ConversationReference } from './types';

function getConversationSortTime(conversation: ConversationReference): number {
  return conversation.lastOpenedAt ?? conversation.addedAt ?? 0;
}

export function sortConversationsByPriority(
  conversations: ConversationReference[],
): ConversationReference[] {
  return [...conversations].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;

    // Within the same starred state, use sortIndex if both have one
    const aIdx = a.sortIndex ?? -1;
    const bIdx = b.sortIndex ?? -1;
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;

    // Fall back to time-based sort
    return getConversationSortTime(b) - getConversationSortTime(a);
  });
}
