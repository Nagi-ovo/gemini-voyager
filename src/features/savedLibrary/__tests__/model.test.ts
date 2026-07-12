import { describe, expect, it } from 'vitest';

import type { HighlightRecordV1 } from '@/core/types/highlight';
import type { StarredMessage } from '@/pages/content/timeline/starredTypes';

import { buildSavedLibraryItemUrl, filterSavedLibraryItems, toSavedLibraryItems } from '../model';

const starred: StarredMessage = {
  turnId: 'turn-star',
  content: 'A starred response',
  conversationId: 'conversation-one',
  conversationUrl: 'https://gemini.google.com/u/1/app/abc#old',
  conversationTitle: 'First conversation',
  starredAt: 100,
};

const highlight: HighlightRecordV1 = {
  id: 'highlight-one',
  schemaVersion: 1,
  platform: 'gemini',
  accountHash: 'account-hash',
  conversationId: 'conversation-two',
  conversationUrl: 'https://gemini.google.com/u/1/app/def',
  conversationTitle: 'Second conversation',
  turnId: 'turn-highlight',
  role: 'assistant',
  anchor: {
    quote: { exact: 'The selected passage', prefix: 'before ', suffix: ' after' },
    position: { start: 7, end: 27 },
    sourceTextHash: 'source-hash',
  },
  note: 'Remember this proof',
  color: 'yellow',
  createdAt: 150,
  updatedAt: 200,
  revision: { counter: 1, deviceId: 'device-one' },
};

describe('saved library model', () => {
  it('combines stars and active highlights in newest-first order', () => {
    const deleted = { ...highlight, id: 'deleted', updatedAt: 300, deletedAt: 300 };
    const items = toSavedLibraryItems([starred], [highlight, deleted]);

    expect(items.map((item) => item.kind)).toEqual(['highlight', 'starred']);
    expect(items[0]).toMatchObject({
      id: 'highlight-one',
      content: 'The selected passage',
      note: 'Remember this proof',
    });
  });

  it('filters by kind and searches quote, note, and conversation metadata', () => {
    const items = toSavedLibraryItems([starred], [highlight]);

    expect(filterSavedLibraryItems(items, 'starred', '')).toHaveLength(1);
    expect(filterSavedLibraryItems(items, 'highlights', 'proof')).toHaveLength(1);
    expect(filterSavedLibraryItems(items, 'all', 'first conversation')[0]?.kind).toBe('starred');
    expect(filterSavedLibraryItems(items, 'all', 'not present')).toEqual([]);
  });

  it('builds account-preserving deep links for stars and highlights', () => {
    const [highlightItem, starredItem] = toSavedLibraryItems([starred], [highlight]);

    expect(buildSavedLibraryItemUrl(highlightItem)).toBe(
      'https://gemini.google.com/u/1/app/def#gv-highlight-highlight-one',
    );
    expect(buildSavedLibraryItemUrl(starredItem)).toBe(
      'https://gemini.google.com/u/1/app/abc#gv-turn-turn-star',
    );
    expect(() =>
      buildSavedLibraryItemUrl({ ...highlightItem, conversationUrl: 'data:text/html,unsafe' }),
    ).toThrow(TypeError);
  });
});
