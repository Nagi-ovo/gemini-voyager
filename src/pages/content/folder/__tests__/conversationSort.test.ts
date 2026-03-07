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

  it('sorts by sortIndex when both items have one (within same starred group)', () => {
    const sorted = sortConversationsByPriority([
      createConversation('c', { sortIndex: 2, addedAt: 300 }),
      createConversation('a', { sortIndex: 0, addedAt: 100 }),
      createConversation('b', { sortIndex: 1, addedAt: 200 }),
    ]);

    expect(sorted.map((item) => item.conversationId)).toEqual(['a', 'b', 'c']);
  });

  it('uses sortIndex within starred group independently', () => {
    const sorted = sortConversationsByPriority([
      createConversation('normal-last', { sortIndex: 1, addedAt: 300 }),
      createConversation('normal-first', { sortIndex: 0, addedAt: 100 }),
      createConversation('starred-last', { starred: true, sortIndex: 1, addedAt: 200 }),
      createConversation('starred-first', { starred: true, sortIndex: 0, addedAt: 300 }),
    ]);

    expect(sorted.map((item) => item.conversationId)).toEqual([
      'starred-first',
      'starred-last',
      'normal-first',
      'normal-last',
    ]);
  });

  it('falls back to time-based sort when sortIndex is missing on either item', () => {
    const sorted = sortConversationsByPriority([
      createConversation('with-index', { sortIndex: 0, addedAt: 100 }),
      createConversation('no-index-newer', { addedAt: 300 }),
      createConversation('no-index-older', { addedAt: 200 }),
    ]);

    // When comparing items where one lacks sortIndex, time-based sort applies
    // no-index-newer (addedAt=300) > no-index-older (addedAt=200) > with-index (addedAt=100)
    expect(sorted.map((item) => item.conversationId)).toEqual([
      'no-index-newer',
      'no-index-older',
      'with-index',
    ]);
  });
});
