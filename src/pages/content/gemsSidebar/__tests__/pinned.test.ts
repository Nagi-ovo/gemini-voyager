import { describe, expect, it } from 'vitest';

import { type GemMruEntry, sanitizePinnedIds, selectVisibleGems } from '../index';
import type { GemMetadata } from '../index';

const gem = (id: string, name = id): GemMetadata => ({ id, name, href: `/gem/${id}` });
const mru = (id: string, lastUsedAt: number, name = id): GemMruEntry => ({
  ...gem(id, name),
  lastUsedAt,
});

describe('gemsSidebar selectVisibleGems', () => {
  it('degrades to pure recency order when nothing is pinned (original behavior)', () => {
    const catalog = [gem('a'), gem('b'), gem('c')];
    const recent = [mru('c', 200)];
    expect(selectVisibleGems([], recent, catalog, 2).map((g) => g.id)).toEqual(['c', 'a']);
  });

  it('renders pinned gems first, in pinned order, regardless of recency', () => {
    const catalog = [gem('a'), gem('b'), gem('c')];
    const recent = [mru('c', 300), mru('b', 200), mru('a', 100)];
    expect(selectVisibleGems(['a', 'b'], recent, catalog, 3).map((g) => g.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('never trims pinned gems by count — naming a gem outranks the limit', () => {
    const catalog = [gem('a'), gem('b'), gem('c'), gem('d')];
    expect(selectVisibleGems(['d', 'c', 'b'], [], catalog, 2).map((g) => g.id)).toEqual([
      'd',
      'c',
      'b',
    ]);
  });

  it('fills remaining slots with recent gems, excluding pinned ones', () => {
    const catalog = [gem('a'), gem('b'), gem('c'), gem('d')];
    const recent = [mru('d', 400), mru('a', 300)];
    expect(selectVisibleGems(['b'], recent, catalog, 3).map((g) => g.id)).toEqual(['b', 'd', 'a']);
  });

  it('skips pinned ids with no resolvable metadata (cache from another device)', () => {
    const catalog = [gem('a'), gem('b')];
    expect(selectVisibleGems(['ghost', 'a'], [], catalog, 2).map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('resolves pinned gems that only exist in the MRU (e.g. premade gems)', () => {
    const catalog = [gem('a')];
    const recent = [mru('premade-x', 500, 'Brainstormer')];
    const out = selectVisibleGems(['premade-x'], recent, catalog, 1);
    expect(out.map((g) => g.id)).toEqual(['premade-x']);
    expect(out[0].name).toBe('Brainstormer');
  });

  it('de-duplicates repeated pinned ids', () => {
    const catalog = [gem('a'), gem('b')];
    expect(selectVisibleGems(['a', 'a'], [], catalog, 2).map((g) => g.id)).toEqual(['a', 'b']);
  });

  it('shows only pinned gems when count is smaller than the pin list', () => {
    const catalog = [gem('a'), gem('b'), gem('c')];
    const recent = [mru('c', 100)];
    expect(selectVisibleGems(['a', 'b'], recent, catalog, 1).map((g) => g.id)).toEqual(['a', 'b']);
  });
});

describe('gemsSidebar sanitizePinnedIds', () => {
  it('accepts a clean string array', () => {
    expect(sanitizePinnedIds(['a', 'b'])).toEqual(['a', 'b']);
  });

  it('drops non-string and empty entries', () => {
    expect(sanitizePinnedIds(['a', 42, null, '', 'b'])).toEqual(['a', 'b']);
  });

  it('returns [] for non-array values', () => {
    expect(sanitizePinnedIds(undefined)).toEqual([]);
    expect(sanitizePinnedIds('a')).toEqual([]);
    expect(sanitizePinnedIds({ 0: 'a' })).toEqual([]);
  });
});
