import { describe, expect, it } from 'vitest';

import { sortConversationsByPriority } from '../conversationSort';
import type { ConversationReference } from '../types';

function createConversation(
  conversationId: string,
  options: Partial<ConversationReference> = {},
): ConversationReference {
  return {
    conversationId,
    title: conversationId,
    url: `https://gemini.google.com/app/${conversationId}`,
    addedAt: 0,
    ...options,
  };
}

describe('sortConversationsByPriority', () => {
  it('keeps starred conversations ahead of non-starred conversations', () => {
    const sorted = sortConversationsByPriority([
      createConversation('normal-newer', { addedAt: 30 }),
      createConversation('starred-older', { starred: true, addedAt: 10 }),
      createConversation('starred-newer', { starred: true, addedAt: 20 }),
    ]);

    expect(sorted.map((item) => item.conversationId)).toEqual([
      'starred-newer',
      'starred-older',
      'normal-newer',
    ]);
  });

  it('sorts by lastOpenedAt (newest first) within the same starred state', () => {
    const sorted = sortConversationsByPriority([
      createConversation('opened-earlier', { addedAt: 999, lastOpenedAt: 100 }),
      createConversation('opened-latest', { addedAt: 1, lastOpenedAt: 200 }),
      createConversation('never-opened', { addedAt: 150 }),
    ]);

    expect(sorted.map((item) => item.conversationId)).toEqual([
      'opened-latest',
      'never-opened',
      'opened-earlier',
    ]);
  });

  it('falls back to addedAt when lastOpenedAt is missing (backward compatibility)', () => {
    const sorted = sortConversationsByPriority([
      createConversation('older', { addedAt: 100 }),
      createConversation('newer', { addedAt: 200 }),
      createConversation('newest', { addedAt: 300 }),
    ]);

    expect(sorted.map((item) => item.conversationId)).toEqual(['newest', 'newer', 'older']);
  });
});
