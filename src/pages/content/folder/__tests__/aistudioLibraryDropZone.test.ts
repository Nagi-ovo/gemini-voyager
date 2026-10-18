import { afterEach, describe, expect, it, vi } from 'vitest';

import { type LibraryDropZone, mountLibraryDropZone } from '../aistudioLibraryDropZone';
import type { Folder, FolderData } from '../types';

const folder = (id: string, parentId: string | null, createdAt: number): Folder => ({
  id,
  name: id,
  parentId,
  isExpanded: true,
  createdAt,
  updatedAt: createdAt,
});

/** A dragstart from an AI Studio library row, which is what shows the zone. */
function dragLibraryRow(): void {
  const row = document.createElement('tr');
  row.className = 'mat-mdc-row';
  row.innerHTML = '<td><a href="/prompts/p1">Prompt</a></td>';
  document.body.append(row);
  row.dispatchEvent(new Event('dragstart', { bubbles: true }));
  vi.runOnlyPendingTimers();
}

const listed = () =>
  Array.from(document.querySelectorAll<HTMLElement>('.gv-library-folder-item[data-folder-id]'));

describe('AI Studio library drop zone', () => {
  let zone: LibraryDropZone | null = null;

  afterEach(() => {
    zone?.destroy();
    zone = null;
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('offers every level as a drop target, under its parent and indented deeper', () => {
    vi.useFakeTimers();
    const data: FolderData = {
      folders: [
        folder('Work', null, 1),
        folder('Notes', 'Work', 2),
        folder('Drafts', 'Notes', 3),
        folder('Old', 'Drafts', 4),
        folder('Home', null, 5),
      ],
      folderContents: { Work: [], Notes: [], Drafts: [], Old: [], Home: [] },
    };
    const onDrop = vi.fn();
    zone = mountLibraryDropZone({
      t: (key) => key,
      canEdit: () => true,
      data: () => data,
      ensureFolder: () => {},
      onDrop,
    });

    dragLibraryRow();

    const items = listed();
    expect(items.map((item) => item.dataset.folderId)).toEqual([
      'Work',
      'Notes',
      'Drafts',
      'Old',
      'Home',
    ]);
    const indent = (id: string) =>
      parseFloat(items.find((item) => item.dataset.folderId === id)!.style.paddingLeft);
    expect(indent('Old')).toBeGreaterThan(indent('Drafts'));
    expect(indent('Drafts')).toBeGreaterThan(indent('Notes'));
    expect(indent('Notes')).toBeGreaterThan(indent('Work'));

    items[2].dispatchEvent(new Event('drop', { bubbles: true }));
    expect(onDrop.mock.calls[0]?.[1]).toMatchObject({ id: 'Drafts' });
  });
});
