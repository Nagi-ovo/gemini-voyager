import { describe, expect, it } from 'vitest';

import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';
import { layoutFolders } from '@/pages/content/folder/floatingTree/shared';

import {
  type ConversationSortMode,
  findCycleRoots,
  isRootFolder,
  ownBucket,
  sortConversationsByPriority,
  sortFolders,
} from '../folderData';
import { buildFolderIndex } from '../folderIndex';

// ---------------------------------------------------------------------------
// Oracles: the scans the index replaces, copied verbatim from main 49bd6eec.
// ---------------------------------------------------------------------------

/** `sortFoldersByCreation` from floatingTree/shared.ts. */
function oldSortFoldersByCreation(folders: readonly Folder[]): Folder[] {
  return [...folders].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.createdAt - b.createdAt,
  );
}

/** `layoutFolders` from floatingTree/shared.ts. */
function oldLayoutFolders(data: FolderData, order?: 'created') {
  const sort = (folders: Folder[]) =>
    order === 'created' ? oldSortFoldersByCreation(folders) : sortFolders(folders);
  const unique = new Map<string, Folder>();
  for (const folder of data.folders) if (!unique.has(folder.id)) unique.set(folder.id, folder);
  const cycleRoots = findCycleRoots(data.folders);

  const byParent = new Map<string, Folder[]>();
  const realRoots: Folder[] = [];
  const standIns: Folder[] = [];
  for (const folder of unique.values()) {
    if (isRootFolder(folder, unique)) {
      realRoots.push(folder);
    } else if (cycleRoots.has(folder.id)) {
      standIns.push(folder);
    } else {
      const siblings = byParent.get(folder.parentId as string) ?? [];
      siblings.push(folder);
      byParent.set(folder.parentId as string, siblings);
    }
  }

  const children = new Map<string, Folder[]>();
  for (const [parentId, kids] of byParent) children.set(parentId, sort(kids));
  return { roots: [...sort(realRoots), ...standIns], children };
}

/** Which buckets hold a conversation, by a scan of every bucket. */
function oldBucketsHolding(data: FolderData, conversationId: string): string[] {
  return Object.keys(data.folderContents).filter(
    (bucketId) =>
      Array.isArray(data.folderContents[bucketId]) &&
      data.folderContents[bucketId].some((c) => c.conversationId === conversationId),
  );
}

// ---------------------------------------------------------------------------
// Datasets
// ---------------------------------------------------------------------------

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

const NAMES = ['Folder 2', 'folder 10', 'Folder 2', 'alpha', 'Alpha', 'beta', '', ' x ', 'Ä', 'a'];

/**
 * Random folders that hit every rule at once: repeated ids with different names
 * and parents, `null`/`undefined`/`''`/orphan/self parents, cycles, pinned
 * mixes, and missing, negative and tied `sortIndex` values, so `sortFolders`
 * runs on the inconsistent orders it gives for mixed indices.
 */
function randomData(seed: number, size: number): FolderData {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const ids = Array.from({ length: Math.max(2, Math.floor(size * 0.8)) }, (_, i) => `f${i}`);
  const folders: Folder[] = [];
  for (let i = 0; i < size; i++) {
    const id = pick(ids);
    const roll = random();
    const parentId =
      roll < 0.12
        ? null
        : roll < 0.17
          ? (undefined as unknown as null)
          : roll < 0.22
            ? ''
            : roll < 0.27
              ? 'ghost'
              : roll < 0.3
                ? id
                : pick(ids);
    const indexRoll = random();
    const sortIndex =
      indexRoll < 0.25
        ? undefined
        : indexRoll < 0.35
          ? -1
          : indexRoll < 0.5
            ? 0
            : Math.floor(random() * 6);
    folders.push({
      id,
      name: `${pick(NAMES)}${random() < 0.3 ? ` ${i}` : ''}`,
      parentId,
      isExpanded: random() < 0.5,
      pinned: random() < 0.2 ? true : random() < 0.1 ? false : undefined,
      sortIndex,
      createdAt: Math.floor(random() * 4),
      updatedAt: 1,
    });
  }
  const conversationIds = Array.from({ length: size }, (_, i) => `c_${i % 7}${i}`);
  const folderContents: Record<string, ConversationReference[]> = {};
  for (const bucketId of [...ids.slice(0, Math.ceil(ids.length / 2)), 'orphan-bucket', 'root']) {
    folderContents[bucketId] = Array.from({ length: Math.floor(random() * 5) }, () => {
      const conversationId = pick(conversationIds);
      return { conversationId, title: conversationId, url: `/app/${conversationId}`, addedAt: 1 };
    });
  }
  return { folders, folderContents };
}

function folder(id: string, parentId: string | null, extra: Partial<Folder> = {}): Folder {
  return { id, name: id, parentId, isExpanded: true, createdAt: 1, updatedAt: 1, ...extra };
}

const FIXED: Record<string, FolderData> = {
  cycle: {
    folders: [
      folder('root', null),
      folder('a', 'b'),
      folder('b', 'a'),
      folder('c', 'b'),
      folder('self', 'self'),
    ],
    folderContents: {},
  },
  orphanAndBlank: {
    folders: [
      folder('x', 'ghost', { sortIndex: 2 }),
      folder('y', '' as unknown as null, { sortIndex: 1 }),
      folder('z', undefined as unknown as null),
      folder('w', 'x', { pinned: true }),
    ],
    folderContents: {},
  },
  duplicateIds: {
    folders: [
      folder('a', null, { name: 'first a' }),
      folder('b', 'a'),
      folder('a', 'b', { name: 'second a' }),
      folder('b', null, { name: 'second b' }),
    ],
    folderContents: {},
  },
  deepLegacy: {
    folders: Array.from({ length: 3000 }, (_, i) =>
      folder(`d${i}`, i === 0 ? null : `d${i - 1}`, i % 3 ? {} : { sortIndex: i }),
    ),
    folderContents: {},
  },
};

const DATASETS: Array<[string, FolderData]> = [
  ...Object.entries(FIXED),
  ...Array.from({ length: 60 }, (_, i): [string, FolderData] => [
    `random #${i}`,
    randomData(i + 1, 4 + i * 3),
  ]),
];

/** Positions in `data.folders`, so a wrong record of a repeated id fails. */
function positions(data: FolderData, folders: readonly Folder[]): number[] {
  return folders.map((item) => data.folders.indexOf(item));
}

function parentKeys(data: FolderData): Array<string | null | undefined> {
  return [
    null,
    undefined,
    '',
    'ghost',
    'missing',
    ...new Set(data.folders.flatMap((item) => [item.id, item.parentId])),
  ];
}

describe('buildFolderIndex', () => {
  it('runs on random data holding every legacy shape', () => {
    const random = DATASETS.filter(([name]) => name.startsWith('random')).map(([, data]) => data);
    const count = (test: (data: FolderData) => boolean) => random.filter(test).length;
    expect(count((data) => findCycleRoots(data.folders).size > 0)).toBeGreaterThan(10);
    expect(
      count((data) => new Set(data.folders.map((f) => f.id)).size < data.folders.length),
    ).toBeGreaterThan(10);
    expect(count((data) => data.folders.some((f) => f.parentId === 'ghost'))).toBeGreaterThan(10);
    expect(count((data) => data.folders.some((f) => f.parentId === undefined))).toBeGreaterThan(10);
    expect(count((data) => data.folders.some((f) => f.sortIndex === undefined))).toBeGreaterThan(
      10,
    );
  });

  it.each(DATASETS)('lays out %s exactly like layoutFolders did', (_name, data) => {
    for (const order of [undefined, 'created'] as const) {
      const expected = oldLayoutFolders(data, order);
      const index = buildFolderIndex(data);
      const actual = index.layout(order);
      expect(positions(data, actual.roots)).toEqual(positions(data, expected.roots));
      expect([...actual.children.keys()]).toEqual([...expected.children.keys()]);
      for (const key of parentKeys(data)) {
        if (typeof key !== 'string') continue;
        expect(positions(data, index.children(key, order)), `${order} children of ${key}`).toEqual(
          positions(data, expected.children.get(key) ?? []),
        );
      }
    }
  });

  it.each(DATASETS)('keeps the first record of each id in %s', (_name, data) => {
    const seen = new Set<string>();
    const firsts = data.folders.filter((item) => !seen.has(item.id) && !!seen.add(item.id));
    expect([...buildFolderIndex(data).folderById.values()]).toEqual(firsts);
    for (const item of firsts) expect(buildFolderIndex(data).folderById.get(item.id)).toBe(item);
    expect([...buildFolderIndex(data).cycleRoots]).toEqual([...findCycleRoots(data.folders)]);
  });

  it.each(DATASETS)('finds the buckets holding each conversation in %s', (_name, data) => {
    const index = buildFolderIndex(data);
    const ids = new Set(
      Object.values(data.folderContents).flatMap((bucket) => bucket.map((c) => c.conversationId)),
    );
    for (const id of [...ids, 'c_unknown', '', '__proto__']) {
      expect(index.bucketsHolding(id), id).toEqual(oldBucketsHolding(data, id));
    }
    for (const bucketId of [...Object.keys(data.folderContents), 'missing']) {
      expect(index.refs(bucketId)).toBe(
        Object.hasOwn(data.folderContents, bucketId)
          ? data.folderContents[bucketId]
          : index.refs('x'),
      );
    }
  });

  it('never reads an inherited key as a bucket', () => {
    const folderContents: Record<string, ConversationReference[]> = {};
    Object.defineProperty(folderContents, '__proto__', {
      value: [{ conversationId: 'c1', title: '', url: '', addedAt: 1 }],
      enumerable: true,
    });
    const index = buildFolderIndex({ folders: [], folderContents });
    expect(index.refs('__proto__')).toHaveLength(1);
    expect(index.refs('constructor')).toEqual([]);
    expect(index.bucketsHolding('c1')).toEqual(['__proto__']);
  });

  it('builds each part once per index', () => {
    const data = randomData(99, 40);
    const index = buildFolderIndex(data);
    expect(index.layout()).toBe(index.layout());
    expect(index.layout('created')).not.toBe(index.layout());
  });
});

describe('layoutFolders', () => {
  it.each(DATASETS)('still lays out %s as before', (_name, data) => {
    for (const order of [undefined, 'created'] as const) {
      const expected = oldLayoutFolders(data, order);
      const actual = layoutFolders(data, order);
      expect(positions(data, actual.roots)).toEqual(positions(data, expected.roots));
      expect([...actual.children].map(([key, kids]) => [key, positions(data, kids)])).toEqual(
        [...expected.children].map(([key, kids]) => [key, positions(data, kids)]),
      );
    }
  });
});

/** `orderConversations` from floatingTree/FolderTree.tsx, over the bucket it reads, verbatim. */
function oldOrderedRefs(
  data: FolderData,
  folderId: string,
  conversationOrder: 'stored' | undefined,
  conversationSortMode: ConversationSortMode,
): readonly ConversationReference[] {
  const conversations = ownBucket(data.folderContents, folderId) ?? [];
  return conversationOrder === 'stored'
    ? conversations
    : sortConversationsByPriority(conversations, conversationSortMode);
}

/**
 * Buckets that hit every comparator branch: mixed `starred`, missing, tied and
 * equal `sortIndex`, tied or missing `lastOpenedAt`/`addedAt`, repeated ids.
 */
function randomBuckets(seed: number): FolderData {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];
  const folderContents: Record<string, ConversationReference[]> = {};
  for (const bucketId of ['__root__', 'a', 'b', 'empty']) {
    const size = bucketId === 'empty' ? 0 : Math.floor(random() * 14);
    folderContents[bucketId] = Array.from({ length: size }, (_, i) => {
      const conversationId = `c${Math.floor(random() * 8)}`;
      return {
        conversationId,
        title: `${bucketId}-${i}`,
        url: `/app/${conversationId}`,
        addedAt: pick([0, 1, 1, 2]),
        lastOpenedAt: pick([undefined, undefined, 1, 3]),
        starred: pick([undefined, true, false, true]),
        sortIndex: pick([undefined, 0, 1, 1, 2, 5]),
      };
    });
  }
  return { folders: [], folderContents };
}

describe('buildFolderIndex orderedRefs', () => {
  it.each(Array.from({ length: 120 }, (_, i) => i))(
    'orders random buckets #%i like the shared tree',
    (seed) => {
      const data = randomBuckets(seed + 1);
      const index = buildFolderIndex(data);
      for (const bucketId of ['__root__', 'a', 'b', 'empty', 'missing', 'constructor']) {
        const bucket = ownBucket(data.folderContents, bucketId) ?? [];
        const at = (refs: readonly ConversationReference[]) => refs.map((r) => bucket.indexOf(r));
        for (const mode of ['manual', 'recent'] as const) {
          expect(at(index.orderedRefs(bucketId, mode)), `${bucketId} ${mode}`).toEqual(
            at(oldOrderedRefs(data, bucketId, undefined, mode)),
          );
          expect(index.orderedRefs(bucketId, mode)).toBe(index.orderedRefs(bucketId, mode));
        }
        expect(index.orderedRefs(bucketId, 'stored')).toEqual(
          oldOrderedRefs(data, bucketId, 'stored', 'manual'),
        );
      }
    },
  );

  it('returns a stored bucket itself and never rewrites it', () => {
    const data = randomBuckets(3);
    const before = JSON.stringify(data);
    const index = buildFolderIndex(data);
    expect(index.orderedRefs('a', 'stored')).toBe(data.folderContents.a);
    index.orderedRefs('a', 'manual');
    index.orderedRefs('a', 'recent');
    expect(JSON.stringify(data)).toBe(before);
  });
});
