import { describe, expect, it } from 'vitest';

import type { HighlightRecordV1 } from '@/core/types/highlight';
import type { StarredMessage } from '@/features/savedLibrary/starTypes';

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

  it('finds words beyond the preview and falls back to the preview for legacy stars', () => {
    const fullText = 'A full user prompt\nOnly the full text mentions QUASAR';
    const items = toSavedLibraryItems(
      [
        { ...starred, content: 'Old preview', text: fullText },
        { ...starred, turnId: 'legacy' },
      ],
      [highlight],
    );

    expect(filterSavedLibraryItems(items, 'starred', '  quasar  ')).toMatchObject([
      { text: fullText, content: 'Old preview' },
    ]);
    expect(filterSavedLibraryItems(items, 'starred', 'old preview')).toEqual([]);
    expect(filterSavedLibraryItems(items, 'starred', 'starred response')).toMatchObject([
      { turnId: 'legacy' },
    ]);
    expect(filterSavedLibraryItems(items, 'highlights', 'quasar')).toEqual([]);
    expect(filterSavedLibraryItems(items, 'all', 'proof')[0]?.kind).toBe('highlight');
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

it.each([
  ['chatgpt:conv:x', 'https://chatgpt.com/c/x'],
  ['chatgpt:conv:x', 'https://chat.openai.com/c/x'],
  ['deepseek:conv:x', 'https://chat.deepseek.com/a/chat/s/x'],
  ['claude:conv:x', 'https://claude.ai/chat/x'],
  ['gemini:conv:x', 'https://business.gemini.google/u/1/app/x'],
  ['gemini:hash', 'https://gemini.google.com/app/x'],
  ['legacy-id', 'https://gemini.google.com/app/x'],
  ['legacy-id', 'https://aistudio.google.cn/prompts/x'],
  ['aistudio:conv:x', 'https://aistudio.google.com/prompts/x'],
])('a saved star from %s opens its own timeline site', (conversationId, conversationUrl) => {
  const [item] = toSavedLibraryItems([{ ...starred, conversationId, conversationUrl }], []);
  expect(buildSavedLibraryItemUrl(item)).toBe(`${conversationUrl}#gv-turn-turn-star`);
});

it.each([
  ['chatgpt:conv:x', 'https://evil.example/c/x'],
  ['chatgpt:conv:x', 'https://claude.ai/chat/x'],
  ['claude:conv:x', 'https://chatgpt.com/c/x'],
  ['deepseek:conv:x', 'https://gemini.google.com/app/x'],
  ['gemini:conv:x', 'https://aistudio.google.com/prompts/x'],
  ['chatgpt:conv:x', 'javascript:alert(1)'],
  ['chatgpt:conv:x', 'http://chatgpt.com/c/x'],
  ['legacy-id', 'https://chatgpt.com/c/x'],
])(
  'a saved star with a mismatched or unsafe URL cannot open (%s, %s)',
  (conversationId, conversationUrl) => {
    const [item] = toSavedLibraryItems([{ ...starred, conversationId, conversationUrl }], []);
    expect(() => buildSavedLibraryItemUrl(item)).toThrow(TypeError);
  },
);
