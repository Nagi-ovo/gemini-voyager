import { describe, expect, it } from 'vitest';

import {
  addItem,
  buildItemId,
  clearItems,
  createEmptyPack,
  isNewerPackVersion,
  moveItem,
  parsePack,
  removeItem,
  setInstruction,
} from '../packModel';
import { RESEARCH_PACK_LIMITS, type ResearchPackDraftItem } from '../types';

function draft(overrides: Partial<ResearchPackDraftItem> = {}): ResearchPackDraftItem {
  return {
    text: 'Answer body',
    excerpt: false,
    prompt: 'What is X?',
    sourceTitle: 'Conversation',
    sourceUrl: 'https://gemini.google.com/u/1/app/abc',
    platform: 'gemini',
    citations: [],
    ...overrides,
  };
}

function packWith(texts: string[]) {
  return texts.reduce(
    (pack, text, index) => addItem(pack, draft({ text }), index + 1).pack,
    createEmptyPack(),
  );
}

describe('research pack model', () => {
  it('adds an item, keeping the account route in its source URL', () => {
    const { pack, outcome } = addItem(createEmptyPack(), draft(), 42);

    expect(outcome).toBe('added');
    expect(pack.items).toHaveLength(1);
    expect(pack.items[0]).toMatchObject({
      text: 'Answer body',
      sourceUrl: 'https://gemini.google.com/u/1/app/abc',
      addedAt: 42,
    });
    expect(pack.updatedAt).toBe(42);
  });

  it('treats the same text from the same conversation as a duplicate, even after re-wrapping', () => {
    const first = addItem(createEmptyPack(), draft({ text: 'Line one\n\n\n\nLine two' }), 1).pack;
    const again = addItem(
      first,
      draft({ text: 'Line one\r\n\r\nLine two  ', sourceUrl: `${draft().sourceUrl}?hl=en` }),
      2,
    );

    expect(again.outcome).toBe('duplicate');
    expect(again.pack).toBe(first);
  });

  it('keeps the same text from a different conversation as a separate item', () => {
    const first = addItem(createEmptyPack(), draft(), 1).pack;
    const other = addItem(first, draft({ sourceUrl: 'https://gemini.google.com/app/other' }), 2);

    expect(other.outcome).toBe('added');
    expect(other.pack.items).toHaveLength(2);
  });

  it('rejects empty text and refuses to grow past the item cap', () => {
    expect(addItem(createEmptyPack(), draft({ text: '  \n ' }), 1).outcome).toBe('empty');

    const full = packWith(Array.from({ length: RESEARCH_PACK_LIMITS.maxItems }, (_, i) => `#${i}`));
    const overflow = addItem(full, draft({ text: 'one more' }), 99);
    expect(overflow.outcome).toBe('full');
    expect(overflow.pack.items).toHaveLength(RESEARCH_PACK_LIMITS.maxItems);
  });

  it('truncates oversized answers and marks the cut', () => {
    const long = 'x'.repeat(RESEARCH_PACK_LIMITS.maxItemChars + 500);
    const { pack } = addItem(createEmptyPack(), draft({ text: long }), 1);

    expect(pack.items[0].text.length).toBe(RESEARCH_PACK_LIMITS.maxItemChars);
    expect(pack.items[0].text.endsWith('…[truncated]')).toBe(true);
  });

  it('dedupes citations on the way in', () => {
    const { pack } = addItem(
      createEmptyPack(),
      draft({
        citations: [
          { url: 'https://example.com/a?utm_source=x#top', title: '' },
          { url: 'https://example.com/a', title: 'Example A' },
          { url: 'javascript:alert(1)', title: 'bad' },
        ],
      }),
      1,
    );

    expect(pack.items[0].citations).toEqual([{ url: 'https://example.com/a', title: 'Example A' }]);
  });

  it('reorders within bounds and ignores moves past either end', () => {
    const pack = packWith(['a', 'b', 'c']);
    const [a, b, c] = pack.items.map((item) => item.id);

    expect(moveItem(pack, c, -2, 9).items.map((item) => item.text)).toEqual(['c', 'a', 'b']);
    expect(moveItem(pack, a, 1, 9).items.map((item) => item.text)).toEqual(['b', 'a', 'c']);
    expect(moveItem(pack, a, -1, 9)).toBe(pack);
    expect(moveItem(pack, c, 1, 9)).toBe(pack);
    expect(moveItem(pack, 'missing', 1, 9)).toBe(pack);
    expect(removeItem(pack, b, 9).items.map((item) => item.text)).toEqual(['a', 'c']);
    expect(removeItem(pack, 'missing', 9)).toBe(pack);
  });

  it('clears items but keeps the instruction', () => {
    const pack = setInstruction(packWith(['a', 'b']), 'Compare them', 5);
    const cleared = clearItems(pack, 6);

    expect(cleared.items).toEqual([]);
    expect(cleared.instruction).toBe('Compare them');
    expect(clearItems(cleared, 7)).toBe(cleared);
  });

  it('caps the instruction and returns the same pack when nothing changes', () => {
    const pack = setInstruction(createEmptyPack(), 'y'.repeat(10_000), 1);
    expect(pack.instruction).toHaveLength(RESEARCH_PACK_LIMITS.maxInstructionChars);
    expect(setInstruction(pack, pack.instruction, 2)).toBe(pack);
  });

  it('parses stored data defensively', () => {
    const good = packWith(['a']);
    const raw = {
      ...good,
      items: [
        good.items[0],
        good.items[0],
        { text: '' },
        'junk',
        { text: 'legacy', sourceUrl: 'https://gemini.google.com/app/x', citations: 'nope' },
      ],
    };

    const parsed = parsePack(raw);
    expect(parsed.items.map((item) => item.text)).toEqual(['a', 'legacy']);
    expect(parsed.items[1].id).toBe(buildItemId('https://gemini.google.com/app/x', 'legacy'));
    expect(parsed.items[1].citations).toEqual([]);
    expect(parsePack(null)).toEqual(createEmptyPack());
    expect(parsePack({ version: 2, items: [good.items[0]] }).items).toEqual([]);
  });

  it('reads the revision, and a pack stored without one as revision 0', () => {
    const good = packWith(['a']);
    expect(parsePack({ ...good, revision: 7 }).revision).toBe(7);
    const { revision: _omitted, ...legacy } = { ...good, revision: 3 };
    expect(parsePack(legacy).revision).toBe(0);
    for (const revision of [-1, 1.5, '4', Number.NaN]) {
      expect(parsePack({ ...good, revision }).revision, String(revision)).toBe(0);
    }
  });

  it('keeps only http(s) source URLs, on add and on load', () => {
    for (const sourceUrl of [
      'javascript:alert(1)',
      ' JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
      'file:///etc/passwd',
    ]) {
      const { pack } = addItem(createEmptyPack(), draft({ sourceUrl }), 1);
      expect(pack.items[0].sourceUrl, sourceUrl).toBe('');

      const stored = { ...packWith(['a']), items: [{ ...packWith(['a']).items[0], sourceUrl }] };
      expect(parsePack(stored).items[0].sourceUrl, sourceUrl).toBe('');
    }
    expect(addItem(createEmptyPack(), draft(), 1).pack.items[0].sourceUrl).toBe(
      'https://gemini.google.com/u/1/app/abc',
    );
  });

  it('recognizes a pack written by a newer build', () => {
    expect(isNewerPackVersion({ version: 2 })).toBe(true);
    expect(isNewerPackVersion({ version: 1 })).toBe(false);
    expect(isNewerPackVersion(undefined)).toBe(false);
  });
});
