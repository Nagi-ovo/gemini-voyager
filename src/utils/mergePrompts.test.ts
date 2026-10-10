import { describe, expect, it } from 'vitest';

import type { PromptItem } from '@/core/types/sync';

import { mergePrompts } from './merge';

const copy = (text: string, extra: Partial<PromptItem> = {}): PromptItem => ({
  id: 'p',
  text,
  tags: [],
  createdAt: 1,
  updatedAt: 20,
  ...extra,
});

describe('mergePrompts (full cloud restore)', () => {
  it('keeps the same copy on both devices when two edits share a time', () => {
    const apple = copy('Apple');
    const banana = copy('Banana');

    expect(mergePrompts([apple], [banana])).toEqual(mergePrompts([banana], [apple]));
    expect(mergePrompts([apple], [banana])).toEqual([banana]);
  });

  it('does not let a legacy copy without a name win a tie against a named one', () => {
    const named = copy('Body', { name: 'Title', tags: ['local'] });

    expect(mergePrompts([named], [copy('Body')])).toEqual([named]);
  });

  it('keeps the winning copy as it came, edit time and explicit unpin included', () => {
    const local = copy('Body', { pinnedAt: 10, updatedAt: 10, name: 'Title' });
    const cloud = copy('Body', { updatedAt: 30, name: 'Title', pinnedAt: null });

    expect(mergePrompts([local], [cloud])).toEqual([cloud]);
    expect(mergePrompts([cloud], [local])).toEqual([cloud]);
  });

  it('keeps the local pin when the newer cloud copy has no pinnedAt at all', () => {
    // An older version omits the field on every unpinned prompt, so its absence says nothing.
    const local = copy('Body', { pinnedAt: 10, updatedAt: 10 });
    const cloud = copy('Edited', { updatedAt: 30 });

    expect(mergePrompts([local], [cloud])).toEqual([{ ...cloud, pinnedAt: 10 }]);
  });
});
