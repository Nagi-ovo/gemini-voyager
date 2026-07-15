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

  it('sorts by lastOpenedAt in recently-opened mode', () => {
    const sorted = sortConversationsByPriority(
      [
        createConversation('opened-earlier', { addedAt: 999, lastOpenedAt: 100 }),
        createConversation('opened-latest', { addedAt: 1, lastOpenedAt: 200 }),
        createConversation('never-opened', { addedAt: 150 }),
      ],
      'recent',
    );

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

  it('uses persisted sortIndex by default', () => {
    const sorted = sortConversationsByPriority([
      createConversation('manual-first-old', { sortIndex: 0, addedAt: 100 }),
      createConversation('manual-last-new', { sortIndex: 2, addedAt: 300 }),
      createConversation('manual-middle', { sortIndex: 1, addedAt: 200 }),
    ]);

    expect(sorted.map((item) => item.conversationId)).toEqual([
      'manual-first-old',
      'manual-middle',
      'manual-last-new',
    ]);
  });

  it('keeps starred conversations first while respecting manual order within each group', () => {
    const sorted = sortConversationsByPriority([
      createConversation('normal-manual-first-old', { sortIndex: 0, addedAt: 100 }),
      createConversation('normal-manual-last-new', { sortIndex: 1, addedAt: 300 }),
      createConversation('starred-manual-first-old', { starred: true, sortIndex: 0, addedAt: 200 }),
      createConversation('starred-manual-last-new', { starred: true, sortIndex: 1, addedAt: 400 }),
    ]);

    expect(sorted.map((item) => item.conversationId)).toEqual([
      'starred-manual-first-old',
      'starred-manual-last-new',
      'normal-manual-first-old',
      'normal-manual-last-new',
    ]);
  });

  it('ignores sortIndex in recently-opened mode', () => {
    const sorted = sortConversationsByPriority(
      [
        createConversation('manual-first-old', { sortIndex: 0, lastOpenedAt: 100 }),
        createConversation('manual-last-new', { sortIndex: 1, lastOpenedAt: 300 }),
      ],
      'recent',
    );

    expect(sorted.map((item) => item.conversationId)).toEqual([
      'manual-last-new',
      'manual-first-old',
    ]);
  });
});
