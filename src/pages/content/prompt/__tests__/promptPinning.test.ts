import { describe, expect, it } from 'vitest';

import { isPinned, pinGroupOf, pinnedCount, sortPinnedFirst, togglePin } from '../promptPinning';

type Item = { id: string; pinnedAt?: number | null; updatedAt?: number };

const ids = (items: Item[]) => items.map((item) => item.id);

describe('sortPinnedFirst', () => {
  it('lifts pinned prompts above the rest, keeping each group in array order', () => {
    const items: Item[] = [
      { id: 'a' },
      { id: 'b', pinnedAt: 5 },
      { id: 'c' },
      { id: 'd', pinnedAt: 1 },
    ];

    expect(ids(sortPinnedFirst(items))).toEqual(['b', 'd', 'a', 'c']);
  });

  it('orders pinned prompts by the manual order, not by when they were pinned', () => {
    const items: Item[] = [
      { id: 'late', pinnedAt: 1 },
      { id: 'early', pinnedAt: 999 },
    ];

    expect(ids(sortPinnedFirst(items))).toEqual(['late', 'early']);
  });

  it('returns the input untouched when a divider would have nothing to divide', () => {
    const none: Item[] = [{ id: 'a' }, { id: 'b' }];
    const all: Item[] = [
      { id: 'a', pinnedAt: 1 },
      { id: 'b', pinnedAt: 2 },
    ];

    expect(sortPinnedFirst(none)).toBe(none);
    expect(sortPinnedFirst(all)).toBe(all);
  });
});

describe('togglePin', () => {
  it('pins and bumps updatedAt so the change survives a cloud merge', () => {
    const items: Item[] = [{ id: 'a', updatedAt: 10 }];

    const [pinned] = togglePin(items, 'a', 500);

    expect(pinned.pinnedAt).toBe(500);
    expect(pinned.updatedAt).toBe(500);
    expect(isPinned(pinned)).toBe(true);
  });

  it('unpins by writing null, which a merge reads as an intentional unpin', () => {
    const items: Item[] = [{ id: 'a', pinnedAt: 500, updatedAt: 500 }];

    const [unpinned] = togglePin(items, 'a', 900);

    expect(unpinned.pinnedAt).toBeNull();
    expect(isPinned(unpinned)).toBe(false);
    expect(unpinned.updatedAt).toBe(900);
    expect(isPinned(togglePin([unpinned], 'a', 950)[0])).toBe(true);
  });

  it('leaves the array alone when the id is gone', () => {
    const items: Item[] = [{ id: 'a' }];
    expect(togglePin(items, 'missing', 1)).toBe(items);
  });

  it('does not mutate the prompts it was given', () => {
    const items: Item[] = [{ id: 'a' }];
    togglePin(items, 'a', 1);
    expect(items[0].pinnedAt).toBeUndefined();
  });
});

describe('pinnedCount and pinGroupOf', () => {
  const items: Item[] = [{ id: 'a', pinnedAt: 1 }, { id: 'b' }];

  it('counts the pinned group', () => {
    expect(pinnedCount(items)).toBe(1);
    expect(pinnedCount([])).toBe(0);
  });

  it('groups a prompt so a drag cannot cross the divider', () => {
    expect(pinGroupOf(items, 'a')).toBe('pinned');
    expect(pinGroupOf(items, 'b')).toBe('rest');
    expect(pinGroupOf(items, 'missing')).toBe('rest');
  });
});
