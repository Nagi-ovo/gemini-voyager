import { describe, expect, it } from 'vitest';

import {
  filterItemsBySelectedIds,
  findSelectionStartIdAtLine,
  selectBelowIds,
} from '../selectionUtils';

describe('selectionUtils', () => {
  describe('filterItemsBySelectedIds', () => {
    it('filters items by selected ids and keeps order', () => {
      const items: Array<{ id: string }> = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
      const selected = new Set(['c', 'b']);

      const result = filterItemsBySelectedIds(items, (x) => x.id, selected);

      expect(result.map((x) => x.id)).toEqual(['b', 'c']);
    });

    it('drops items without an id', () => {
      const items: Array<{ id?: string }> = [{ id: 'a' }, {}, { id: 'b' }];
      const selected = new Set(['a', 'b']);

      const result = filterItemsBySelectedIds(items, (x) => x.id, selected);

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('a');
      expect(result[1].id).toBe('b');
    });
  });

  describe('selectBelowIds', () => {
    it('selects ids starting from the given id (inclusive)', () => {
      const ids = ['a', 'b', 'c', 'd'];
      const selected = selectBelowIds(ids, 'c');

      expect(Array.from(selected)).toEqual(['c', 'd']);
    });

    it('returns empty set when start id is not found', () => {
      const ids = ['a', 'b'];
      const selected = selectBelowIds(ids, 'missing');

      expect(selected.size).toBe(0);
    });
  });

  describe('findSelectionStartIdAtLine', () => {
    it('returns intersecting item when line falls inside its bounds', () => {
      const items = [
        { id: 'a', top: -10, bottom: 10 },
        { id: 'b', top: 12, bottom: 20 },
      ];

      expect(findSelectionStartIdAtLine(items, 0)).toBe('a');
    });

    it('returns next item when no item intersects the line', () => {
      const items = [
        { id: 'a', top: -20, bottom: -10 },
        { id: 'b', top: 5, bottom: 20 },
        { id: 'c', top: 25, bottom: 40 },
      ];

      expect(findSelectionStartIdAtLine(items, 0)).toBe('b');
    });

    it('returns null when there is no item at or below line', () => {
      const items = [{ id: 'a', top: -20, bottom: -10 }];

      expect(findSelectionStartIdAtLine(items, 0)).toBe(null);
    });
  });
});

