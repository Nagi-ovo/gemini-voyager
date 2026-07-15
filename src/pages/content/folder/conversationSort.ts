import type { ConversationReference } from './types';

export type ConversationSortMode = 'manual' | 'recent';

function getConversationSortTime(conversation: ConversationReference): number {
  return conversation.lastOpenedAt ?? conversation.addedAt ?? 0;
}

export function sortConversationsByPriority(
  conversations: ConversationReference[],
  mode: ConversationSortMode = 'manual',
): ConversationReference[] {
  return [...conversations].sort((a, b) => {
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;

    if (mode === 'manual') {
      const aIndex = a.sortIndex;
      const bIndex = b.sortIndex;
      if (aIndex != null && bIndex != null && aIndex !== bIndex) {
        return aIndex - bIndex;
      }
    }

    const timeDifference = getConversationSortTime(b) - getConversationSortTime(a);
    if (timeDifference !== 0) return timeDifference;

    // Keep ties deterministic across local/cloud merges and browser engines.
    return a.conversationId.localeCompare(b.conversationId);
  });
}
