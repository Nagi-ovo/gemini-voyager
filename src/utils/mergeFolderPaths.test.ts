import { describe, expect, it } from 'vitest';

import { buildFolderPathIndex, mergeFolderData } from './merge';

type PathFolder = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
  updatedAt: number;
};

// `buildFolderPathIndex` and `resolveFolderPath` from main 49bd6eec, before the
// path walk was memoized, copied verbatim.
function oldBuildFolderPathIndex(folders: PathFolder[]) {
  const foldersById = new Map(folders.map((folder) => [folder.id, folder]));
  const pathById = new Map<string, string>();
  const idsByPath = new Map<string, string[]>();

  folders.forEach((folder) => {
    const path = oldResolveFolderPath(folder, foldersById);
    if (!path) return;

    pathById.set(folder.id, path);
    const ids = idsByPath.get(path) ?? [];
    ids.push(folder.id);
    idsByPath.set(path, ids);
  });

  return { pathById, idsByPath };
}

function oldResolveFolderPath(
  folder: PathFolder,
  foldersById: Map<string, PathFolder>,
): string | null {
  const segments: string[] = [];
  const visited = new Set<string>();
  let current: PathFolder | undefined = folder;

  while (current) {
    if (visited.has(current.id)) return null;
    visited.add(current.id);

    const name = current.name.trim();
    if (!name) return null;
    segments.unshift(name);

    if (!current.parentId) {
      return segments.join('\u001f');
    }

    current = foldersById.get(current.parentId);
    if (!current) return null;
  }

  return null;
}

function folder(id: string, parentId: string | null, name = id): PathFolder {
  return { id, name, parentId, createdAt: 1, updatedAt: 1 };
}

function chain(length: number, prefix = 'd', blankAt = -1): PathFolder[] {
  return Array.from({ length }, (_, i) =>
    folder(`${prefix}${i}`, i === 0 ? null : `${prefix}${i - 1}`, i === blankAt ? '  ' : `N${i}`),
  );
}

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** Repeated ids, cycles, self parents, blank names, missing and unset parents, in any order. */
function randomFolders(seed: number, size: number): PathFolder[] {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const ids = Array.from({ length: Math.max(2, Math.floor(size * 0.8)) }, (_, i) => `f${i}`);
  return Array.from({ length: size }, () => {
    const id = pick(ids);
    const roll = random();
    const parentId =
      roll < 0.2 ? null : roll < 0.25 ? '' : roll < 0.3 ? 'ghost' : roll < 0.33 ? id : pick(ids);
    return folder(id, parentId, pick(['A', 'b', ' B ', 'A', '', 'c', 'Deep']));
  });
}

const DATASETS: Array<[string, PathFolder[]]> = [
  ['deep chain', chain(3000)],
  ['deep chain, reversed storage', chain(3000).reverse()],
  ['deep chain with a blank name', chain(500, 'd', 250)],
  ['deep chain under a cycle', [...chain(400), folder('d0', 'd399', 'loop')]],
  ['deep chain under a missing parent', chain(400).map((f, i) => (i ? f : folder('d0', 'gone')))],
  [
    'earlier record of a repeated id inside its own path',
    [folder('a', 'b', 'A1'), folder('b', 'a'), folder('a', null, 'A2')],
  ],
  ['two-record cycle', [folder('a', 'b'), folder('b', 'a'), folder('c', 'b')]],
  ...Array.from({ length: 150 }, (_, i): [string, PathFolder[]] => [
    `random #${i}`,
    randomFolders(i + 1, 3 + (i % 40) * 2),
  ]),
];

describe('buildFolderPathIndex', () => {
  it.each(DATASETS)('resolves %s like the per-folder walk', (_name, folders) => {
    const expected = oldBuildFolderPathIndex(folders);
    const actual = buildFolderPathIndex(folders);
    expect([...actual.pathById]).toEqual([...expected.pathById]);
    expect([...actual.idsByPath]).toEqual([...expected.idsByPath]);
  });

  it('reads each name a bounded number of times on a deep legacy tree', () => {
    let reads = 0;
    const folders = chain(2000).map((item) => {
      const name = item.name;
      return Object.defineProperty(item, 'name', {
        get: () => {
          reads += 1;
          return name;
        },
      });
    });
    const { pathById } = buildFolderPathIndex(folders);
    expect(pathById.get('d1999')?.split('\u001f')).toHaveLength(2000);
    // The per-folder walk read every ancestor of every folder: 2000 * 2001 / 2.
    expect(reads).toBeLessThanOrEqual(2000 * 3);
  });

  it('still remaps a deep cloud tree onto the matching local paths', () => {
    const local = chain(1500, 'local-');
    const cloud = chain(1500, 'cloud-');
    const merged = mergeFolderData(
      { folders: local, folderContents: {} },
      { folders: cloud, folderContents: { 'cloud-1499': [{ conversationId: 'c1' }] } },
    );
    expect(merged.folders.map((item) => item.id)).toEqual(local.map((item) => item.id));
    expect(merged.folderContents['local-1499']).toEqual([{ conversationId: 'c1' }]);
  });
});
