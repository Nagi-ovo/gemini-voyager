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

    return getConversationSortTime(b) - getConversationSortTime(a);
  });
}
