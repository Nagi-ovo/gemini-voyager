import {
  extractConversationIdFromUrl,
  isSameConversationRoute,
} from '@/core/utils/conversationIdentity';

import type { StarredMessage, StarredMessagesData } from './starredTypes';

function upsertMessage(messageMap: Map<string, StarredMessage>, message: StarredMessage): void {
  const existing = messageMap.get(message.turnId);
  if (!existing || message.starredAt >= existing.starredAt) {
    messageMap.set(message.turnId, message);
  }
}

export function findMatchingStarredMessages(
  data: StarredMessagesData,
  conversationId: string,
  currentUrl: string,
): {
  messages: StarredMessage[];
  sourceConversationIds: string[];
} {
  const messageMap = new Map<string, StarredMessage>();
  const sourceConversationIds = new Set<string>();
  const currentNativeConversationId = extractConversationIdFromUrl(currentUrl);

  const directMessages = data.messages[conversationId] || [];
  if (directMessages.length > 0) {
    sourceConversationIds.add(conversationId);
    directMessages.forEach((message) => upsertMessage(messageMap, message));
  }

  for (const [sourceConversationId, messages] of Object.entries(data.messages)) {
    if (sourceConversationId === conversationId || messages.length === 0) continue;

    const matchedMessages = messages.filter((message) => {
      if (isSameConversationRoute(message.conversationUrl, currentUrl)) {
        return true;
      }

      if (!currentNativeConversationId) return false;
      return extractConversationIdFromUrl(message.conversationUrl) === currentNativeConversationId;
    });

    if (matchedMessages.length === 0) continue;

    sourceConversationIds.add(sourceConversationId);
    matchedMessages.forEach((message) => upsertMessage(messageMap, message));
  }

  return {
    messages: Array.from(messageMap.values()),
    sourceConversationIds: Array.from(sourceConversationIds),
  };
}
