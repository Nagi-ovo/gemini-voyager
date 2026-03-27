import { describe, expect, it } from 'vitest';

import { buildConversationIdFromUrl } from '@/core/utils/conversationIdentity';

import { findMatchingStarredMessages } from '../starredLookup';
import type { StarredMessagesData } from '../starredTypes';

describe('findMatchingStarredMessages', () => {
  it('finds legacy starred messages for the same route when query parameters change', () => {
    const currentUrl = 'https://gemini.google.com/app/abc123?hl=zh-CN';
    const stableConversationId = buildConversationIdFromUrl(currentUrl);
    const legacyConversationId = 'gemini:legacy-conversation-id';

    const data: StarredMessagesData = {
      messages: {
        [legacyConversationId]: [
          {
            turnId: 'u-1',
            content: 'First starred turn',
            conversationId: legacyConversationId,
            conversationUrl: 'https://gemini.google.com/app/abc123?hl=en',
            conversationTitle: 'Conversation',
            starredAt: 100,
          },
        ],
      },
    };

    const result = findMatchingStarredMessages(data, stableConversationId, currentUrl);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].turnId).toBe('u-1');
    expect(result.sourceConversationIds).toEqual([legacyConversationId]);
  });

  it('deduplicates matching messages by turn id and keeps the newer star', () => {
    const currentUrl = 'https://gemini.google.com/app/abc123?hl=zh-CN';
    const stableConversationId = buildConversationIdFromUrl(currentUrl);
    const legacyConversationId = 'gemini:legacy-conversation-id';

    const data: StarredMessagesData = {
      messages: {
        [stableConversationId]: [
          {
            turnId: 'u-1',
            content: 'Older star',
            conversationId: stableConversationId,
            conversationUrl: currentUrl,
            conversationTitle: 'Conversation',
            starredAt: 100,
          },
        ],
        [legacyConversationId]: [
          {
            turnId: 'u-1',
            content: 'Newer legacy star',
            conversationId: legacyConversationId,
            conversationUrl: 'https://gemini.google.com/app/abc123?hl=en',
            conversationTitle: 'Conversation',
            starredAt: 200,
          },
        ],
      },
    };

    const result = findMatchingStarredMessages(data, stableConversationId, currentUrl);

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toBe('Newer legacy star');
    expect(result.sourceConversationIds.sort()).toEqual(
      [legacyConversationId, stableConversationId].sort(),
    );
  });
});
