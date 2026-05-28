import { describe, expect, it } from 'vitest';

import { sanitizeSelectedTags } from '../tagFilterState';

describe('sanitizeSelectedTags', () => {
  it('keeps only tags that still exist, ordered by the known set', () => {
    expect(sanitizeSelectedTags(['work', 'gone', 'ideas'], ['ideas', 'misc', 'work'])).toEqual([
      'ideas',
      'work',
    ]);
  });

  it('returns an empty filter for a fresh / never-saved value', () => {
    expect(sanitizeSelectedTags([], ['work', 'ideas'])).toEqual([]);
  });

  it('drops a tag whose prompts were all deleted or retagged (#729 self-heal)', () => {
    // "work" used to exist but no prompt carries it anymore.
    expect(sanitizeSelectedTags(['work'], ['ideas', 'misc'])).toEqual([]);
  });

  it('normalizes case to match how tags are stored on prompts', () => {
    expect(sanitizeSelectedTags(['Work', 'IDEAS'], ['work', 'ideas'])).toEqual(['work', 'ideas']);
  });

  it('de-duplicates repeated selections', () => {
    expect(sanitizeSelectedTags(['work', 'work', 'WORK'], ['work', 'ideas'])).toEqual(['work']);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'work'],
    ['an object', { work: true }],
    ['a number', 42],
  ])('returns an empty filter when the stored value is %s (corrupt/malformed)', (_label, value) => {
    expect(sanitizeSelectedTags(value, ['work', 'ideas'])).toEqual([]);
  });

  it('ignores non-string entries inside the saved array without throwing', () => {
    expect(
      sanitizeSelectedTags(['work', 7, null, undefined, { x: 1 }, 'ideas'], ['ideas', 'work']),
    ).toEqual(['ideas', 'work']);
  });

  it('returns an empty filter when no tags are known yet (empty prompt set)', () => {
    expect(sanitizeSelectedTags(['work', 'ideas'], [])).toEqual([]);
  });
});
