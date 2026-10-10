import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Folder } from '@/core/types/folder';
import { layoutFolders } from '@/pages/content/folder/floatingTree/shared';

import { FOLDER_PICKER_CLASS, openFolderPicker } from '../chatgptFolderPicker';

type Row = { id: string; padding: string; label: string; path: string | null; name: string };

function root(): ShadowRoot {
  const host = document.querySelector<HTMLElement>(`.${FOLDER_PICKER_CLASS}`);
  if (!host?.shadowRoot) throw new Error('picker is not open');
  return host.shadowRoot;
}

function renderedRows(): Row[] {
  return [...root().querySelectorAll<HTMLButtonElement>('.item')].map((item) => ({
    id: item.dataset.folderId ?? '',
    padding: item.style.paddingInlineStart,
    label: item.getAttribute('aria-label') ?? '',
    path: item.querySelector('.path')?.textContent ?? null,
    name: item.querySelector('.name')?.textContent ?? '',
  }));
}

function type(query: string): void {
  const search = root().querySelector<HTMLInputElement>('.search')!;
  search.value = query;
  search.dispatchEvent(new Event('input'));
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const NAMES = ['Work', 'work', 'Folder 2', 'folder 10', 'A / B', '  Spaced  ', 'Ä', 'x'];

/** Repeated ids, `null`/`undefined`/`''`/orphan/self parents, cycles, mixed sortIndex. */
function randomFolders(seed: number, size: number): Folder[] {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const ids = Array.from({ length: Math.max(2, Math.floor(size * 0.8)) }, (_, i) => `f${i}`);
  return Array.from({ length: size }, (_, i) => {
    const id = pick(ids);
    const roll = random();
    const parentId =
      roll < 0.25
        ? null
        : roll < 0.3
          ? (undefined as unknown as null)
          : roll < 0.35
            ? ''
            : roll < 0.4
              ? 'ghost'
              : roll < 0.43
                ? id
                : pick(ids);
    const indexRoll = random();
    return {
      id,
      name: `${pick(NAMES)}${random() < 0.4 ? ` ${i}` : ''}`,
      parentId,
      isExpanded: true,
      pinned: random() < 0.2 || undefined,
      sortIndex: indexRoll < 0.3 ? undefined : indexRoll < 0.4 ? -1 : Math.floor(random() * 4),
      createdAt: 1,
      updatedAt: 1,
    };
  });
}

afterEach(() => {
  for (const host of document.querySelectorAll(`.${FOLDER_PICKER_CLASS}`)) host.remove();
});

function folder(id: string, name: string, parentId: string | null): Folder {
  return { id, name, parentId, isExpanded: true, createdAt: 1, updatedAt: 1 };
}

describe('ChatGPT folder picker listing', () => {
  it.each(Array.from({ length: 40 }, (_, i) => i))(
    'lists random folders #%i once each, under the parent the sidebar tree shows',
    (seed) => {
      const folders = randomFolders(seed + 1, 3 + seed * 2);
      const data = { folders, folderContents: {} };
      const { roots, children } = layoutFolders(data);
      openFolderPicker(data, () => {});
      const rows = renderedRows();

      expect(rows.map((row) => row.id).sort()).toEqual(
        [...new Set(folders.map((f) => f.id))].sort(),
      );
      expect(rows.filter((row) => row.padding === '12px').map((row) => row.id)).toEqual(
        roots.map((f) => f.id),
      );
      const ancestors: Row[] = [];
      for (const row of rows) {
        const level = (parseInt(row.padding, 10) - 12) / 16;
        ancestors.length = level;
        const parent = ancestors.at(-1);
        if (parent) {
          expect(children.get(parent.id)?.map((f) => f.id)).toContain(row.id);
          expect(row.label).toBe(`${parent.label} / ${row.name}`);
          expect(row.path).toBe(row.label);
        } else {
          expect(row).toMatchObject({ label: row.name, path: null });
        }
        ancestors.push(row);
      }
    },
  );

  it('lists orphans, unset parents and cut cycles where the tree does, and a repeated id once', () => {
    const folders: Folder[] = [
      folder('a', 'A1', null),
      folder('b', 'B', 'a'),
      folder('a', 'A2', 'b'),
      folder('c', 'C', 'ghost'),
      folder('d', 'D', ''),
      folder('x', 'X', 'y'),
      folder('y', 'Y', 'x'),
    ];
    openFolderPicker({ folders, folderContents: {} }, () => {});
    expect(renderedRows().map((row) => row.label)).toEqual([
      'A1',
      'A1 / B',
      'C',
      'D',
      'X',
      'X / Y',
    ]);
  });

  it('searches full paths ignoring case and the spacing around separators', () => {
    const folders = [
      folder('w', 'Work', null),
      folder('f', 'Folder 10', 'w'),
      folder('h', 'Home', null),
    ];
    openFolderPicker({ folders, folderContents: {} }, () => {});

    type('WORK');
    expect(renderedRows().map((row) => row.id)).toEqual(['w', 'f']);
    type(' work / folder ');
    expect(renderedRows().map((row) => row.id)).toEqual(['f']);
    type('zzz');
    expect(renderedRows()).toEqual([]);
    expect(root().querySelector('.empty')).not.toBeNull();
    type('');
    expect(renderedRows().map((row) => row.id)).toEqual(['h', 'w', 'f']);
    expect(root().querySelector('.empty')).toBeNull();
  });

  it('selects the folder of a row reused across searches', () => {
    const onSelect = vi.fn();
    const folders = randomFolders(5, 12);
    openFolderPicker({ folders, folderContents: {} }, onSelect);
    const first = root().querySelector<HTMLButtonElement>('.item')!;
    type('zzz');
    type('');
    expect(root().querySelector('.item')).toBe(first);
    first.click();
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith(first.dataset.folderId);
    expect(document.querySelector(`.${FOLDER_PICKER_CLASS}`)).toBeNull();
  });
});
