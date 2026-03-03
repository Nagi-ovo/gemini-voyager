import { describe, expect, it } from 'vitest';

import { chunk, deduplicateBy, filterTopLevel, lowerBound, sortFolders, upperBound } from '../array';

// ---------------------------------------------------------------------------
// filterTopLevel
// ---------------------------------------------------------------------------
describe('filterTopLevel', () => {
  function makeElement(tag = 'div'): HTMLElement {
    return document.createElement(tag);
  }

  it('returns an empty array when given an empty array', () => {
    expect(filterTopLevel([])).toEqual([]);
  });

  it('returns the same single element unchanged', () => {
    const el = makeElement();
    expect(filterTopLevel([el])).toEqual([el]);
  });

  it('returns all elements when none are descendants of each other', () => {
    const a = makeElement();
    const b = makeElement();
    const c = makeElement();
    const result = filterTopLevel([a, b, c]);
    expect(result).toEqual([a, b, c]);
  });

  it('removes a child element when its parent is also in the list', () => {
    const parent = makeElement();
    const child = makeElement();
    parent.appendChild(child);

    const result = filterTopLevel([parent, child]);
    expect(result).toEqual([parent]);
    expect(result).not.toContain(child);
  });

  it('removes deeply nested descendants while keeping the top-level ancestor', () => {
    const grandparent = makeElement();
    const parent = makeElement();
    const child = makeElement();
    grandparent.appendChild(parent);
    parent.appendChild(child);

    const result = filterTopLevel([grandparent, parent, child]);
    expect(result).toEqual([grandparent]);
  });

  it('keeps elements from different subtrees', () => {
    const root1 = makeElement();
    const child1 = makeElement();
    root1.appendChild(child1);

    const root2 = makeElement();
    const child2 = makeElement();
    root2.appendChild(child2);

    const result = filterTopLevel([root1, child1, root2, child2]);
    expect(result).toEqual([root1, root2]);
  });
});

// ---------------------------------------------------------------------------
// deduplicateBy
// ---------------------------------------------------------------------------
describe('deduplicateBy', () => {
  it('returns an empty array when given an empty array', () => {
    expect(deduplicateBy([], (x: string) => x)).toEqual([]);
  });

  it('returns the same array when there are no duplicates', () => {
    const items = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const result = deduplicateBy(items, (item) => item.id);
    expect(result).toEqual(items);
  });

  it('keeps only the first occurrence of each duplicate', () => {
    const items = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'a', value: 3 }, // duplicate — should be removed
    ];
    const result = deduplicateBy(items, (item) => item.id);
    expect(result).toEqual([
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
    ]);
  });

  it('preserves insertion order', () => {
    const items = ['banana', 'apple', 'banana', 'cherry', 'apple'];
    const result = deduplicateBy(items, (s) => s);
    expect(result).toEqual(['banana', 'apple', 'cherry']);
  });

  it('treats items as duplicates only when keys are identical strings', () => {
    const items = [{ id: '1' }, { id: '01' }]; // different strings
    const result = deduplicateBy(items, (item) => item.id);
    expect(result).toHaveLength(2);
  });

  it('returns an empty array when all items share the same key', () => {
    const items = [{ id: 'same' }, { id: 'same' }, { id: 'same' }];
    const result = deduplicateBy(items, (item) => item.id);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'same' });
  });
});

// ---------------------------------------------------------------------------
// lowerBound — first index where arr[i] >= target
// ---------------------------------------------------------------------------
describe('lowerBound', () => {
  it('returns 0 for an empty array', () => {
    expect(lowerBound([], 5)).toBe(0);
  });

  it('returns 0 when target is smaller than all elements', () => {
    expect(lowerBound([3, 5, 7], 1)).toBe(0);
  });

  it('returns arr.length when target is larger than all elements', () => {
    expect(lowerBound([1, 3, 5], 10)).toBe(3);
  });

  it('returns the index of the target when it exists in the array', () => {
    expect(lowerBound([1, 3, 5, 7], 5)).toBe(2);
  });

  it('returns the insertion index when the target is not present', () => {
    // 4 would be inserted at index 2 (between 3 and 5)
    expect(lowerBound([1, 3, 5, 7], 4)).toBe(2);
  });

  it('returns the index of the first occurrence when there are duplicates', () => {
    expect(lowerBound([1, 3, 3, 3, 7], 3)).toBe(1);
  });

  it('handles a single-element array — target equals the element', () => {
    expect(lowerBound([5], 5)).toBe(0);
  });

  it('handles a single-element array — target is less than the element', () => {
    expect(lowerBound([5], 3)).toBe(0);
  });

  it('handles a single-element array — target is greater than the element', () => {
    expect(lowerBound([5], 9)).toBe(1);
  });

  it('handles an array where all elements are equal and target matches', () => {
    expect(lowerBound([4, 4, 4, 4], 4)).toBe(0);
  });

  it('handles an array where all elements are equal and target is larger', () => {
    expect(lowerBound([4, 4, 4, 4], 5)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// upperBound — last index where arr[i] <= target
// ---------------------------------------------------------------------------
describe('upperBound', () => {
  it('returns -1 for an empty array', () => {
    expect(upperBound([], 5)).toBe(-1);
  });

  it('returns -1 when target is smaller than all elements', () => {
    expect(upperBound([3, 5, 7], 1)).toBe(-1);
  });

  it('returns arr.length - 1 when target is larger than all elements', () => {
    expect(upperBound([1, 3, 5], 10)).toBe(2);
  });

  it('returns the index of the target when it exists in the array', () => {
    expect(upperBound([1, 3, 5, 7], 5)).toBe(2);
  });

  it('returns the index of the largest element <= target when target is not present', () => {
    // 4 is not in [1, 3, 5, 7]; largest element <= 4 is 3 at index 1
    expect(upperBound([1, 3, 5, 7], 4)).toBe(1);
  });

  it('returns the index of the last occurrence when there are duplicates', () => {
    expect(upperBound([1, 3, 3, 3, 7], 3)).toBe(3);
  });

  it('handles a single-element array — target equals the element', () => {
    expect(upperBound([5], 5)).toBe(0);
  });

  it('handles a single-element array — target is less than the element', () => {
    expect(upperBound([5], 3)).toBe(-1);
  });

  it('handles a single-element array — target is greater than the element', () => {
    expect(upperBound([5], 9)).toBe(0);
  });

  it('handles an array where all elements are equal and target matches', () => {
    expect(upperBound([4, 4, 4, 4], 4)).toBe(3);
  });

  it('handles an array where all elements are equal and target is smaller', () => {
    expect(upperBound([4, 4, 4, 4], 3)).toBe(-1);
  });
});

// ---------------------------------------------------------------------------
// chunk
// ---------------------------------------------------------------------------
describe('chunk', () => {
  it('returns an empty array when given an empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('splits an array into chunks of the specified size', () => {
    expect(chunk([1, 2, 3, 4, 5, 6], 2)).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('handles a remainder — last chunk may be smaller than size', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when size equals the array length', () => {
    expect(chunk([1, 2, 3], 3)).toEqual([[1, 2, 3]]);
  });

  it('returns a single chunk when size is larger than the array length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns single-element chunks when size is 1', () => {
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]]);
  });

  it('preserves the original array items without mutation', () => {
    const original = [1, 2, 3, 4];
    chunk(original, 2);
    expect(original).toEqual([1, 2, 3, 4]);
  });
});

// ---------------------------------------------------------------------------
// sortFolders
// ---------------------------------------------------------------------------
describe('sortFolders', () => {
  it('returns an empty array when given an empty array', () => {
    expect(sortFolders([])).toEqual([]);
  });

  it('places pinned folders before unpinned folders', () => {
    const folders = [
      { name: 'Bravo', pinned: false },
      { name: 'Alpha', pinned: true },
    ];
    const result = sortFolders(folders);
    expect(result[0].name).toBe('Alpha');
    expect(result[0].pinned).toBe(true);
  });

  it('sorts unpinned folders alphabetically by name (case-insensitive)', () => {
    const folders = [
      { name: 'Zebra' },
      { name: 'apple' },
      { name: 'Mango' },
    ];
    const result = sortFolders(folders);
    expect(result.map((f) => f.name.toLowerCase())).toEqual(['apple', 'mango', 'zebra']);
  });

  it('sorts pinned folders among themselves alphabetically', () => {
    const folders = [
      { name: 'Zoo', pinned: true },
      { name: 'Ant', pinned: true },
    ];
    const result = sortFolders(folders);
    expect(result[0].name).toBe('Ant');
    expect(result[1].name).toBe('Zoo');
  });

  it('uses numeric collation — folder10 comes after folder9', () => {
    const folders = [
      { name: 'folder10' },
      { name: 'folder2' },
      { name: 'folder9' },
    ];
    const result = sortFolders(folders);
    expect(result.map((f) => f.name)).toEqual(['folder2', 'folder9', 'folder10']);
  });

  it('does not mutate the original array', () => {
    const folders = [{ name: 'B' }, { name: 'A' }];
    const original = [...folders];
    sortFolders(folders);
    expect(folders).toEqual(original);
  });

  it('handles a mix of pinned and unpinned: pinned first, then alphabetical within each group', () => {
    const folders = [
      { name: 'Delta', pinned: false },
      { name: 'Beta', pinned: true },
      { name: 'Alpha', pinned: false },
      { name: 'Gamma', pinned: true },
    ];
    const result = sortFolders(folders);
    expect(result.map((f) => f.name)).toEqual(['Beta', 'Gamma', 'Alpha', 'Delta']);
  });
});
