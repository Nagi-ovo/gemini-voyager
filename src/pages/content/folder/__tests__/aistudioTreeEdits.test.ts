import { describe, expect, it } from 'vitest';

import { addFolder, renameFolder } from '../aistudioTree';
import type { FolderData } from '../types';

function data(): FolderData {
  return {
    folders: [
      { id: 'a', name: 'A', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
      { id: 'b', name: 'B', parentId: 'a', isExpanded: true, createdAt: 2, updatedAt: 2 },
    ],
    folderContents: { a: [], b: [] },
  };
}

describe('AI Studio tree edits', () => {
  // A subfolder form can outlive its parent: another tab or a cloud sync may
  // delete the parent while the user is still typing the name.
  it('refuses a subfolder whose parent is gone, leaving the data untouched', () => {
    const current = data();
    const before = structuredClone(current);

    expect(addFolder(current, { id: 'n', name: 'Orphan', parentId: 'gone', at: 3 })).toBe(false);
    expect(current).toEqual(before);
  });

  it('adds a subfolder with an empty bucket of its own', () => {
    const current = data();

    expect(addFolder(current, { id: 'n', name: 'Child', parentId: 'b', at: 3 })).toBe(true);
    expect(current.folders.at(-1)).toMatchObject({ id: 'n', parentId: 'b', createdAt: 3 });
    expect(Object.hasOwn(current.folderContents, 'n')).toBe(true);
    expect(current.folderContents.n).toEqual([]);
  });

  // The tree asks for every non-empty rename; it cannot see the live name.
  it('renames against the live name, and ignores a name that is already there', () => {
    const current = data();
    const before = structuredClone(current);

    expect(renameFolder(current, 'a', 'A', 9)).toBe(false);
    expect(current).toEqual(before);

    expect(renameFolder(current, 'a', 'Renamed', 9)).toBe(true);
    expect(current.folders[0]).toMatchObject({ name: 'Renamed', updatedAt: 9 });
  });
});
