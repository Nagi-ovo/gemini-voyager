import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';

import {
  type ConversationSortMode,
  findCycleRoots,
  isRootFolder,
  ownBucket,
  sortConversationsByPriority,
  sortFolders,
  sortFoldersByCreation,
} from './folderData';

/** `created`: pinned first, then oldest first. Default: pinned, then sortIndex, then name. */
export type FolderOrder = 'created' | undefined;

/** `stored`: a bucket as stored. Otherwise starred first, then the sort mode (`sortConversationsByPriority`). */
export type ConversationOrder = ConversationSortMode | 'stored';

/** Where each folder renders: every stored id exactly once, under one parent. */
export type FolderLayout = {
  roots: Folder[];
  children: ReadonlyMap<string, Folder[]>;
};

/**
 * A read-only projection of one folder data revision, so views look folders,
 * children, buckets and membership up instead of scanning every folder per node.
 *
 * It holds no state of its own and is never stored. Folder data is edited in
 * place, so an index stays valid only until its input next changes: build one
 * per revision (a render, an opened picker) and drop it, never cache it on the
 * data object's identity. Each part is built on first use.
 */
export interface FolderIndex {
  /** The first record of each id, in stored order; later records of a repeated id are ignored. */
  readonly folderById: ReadonlyMap<string, Folder>;
  /** The folders `findCycleRoots` cuts out of parent cycles to stand in as roots. */
  readonly cycleRoots: ReadonlySet<string>;
  /**
   * The tree's layout: unset, empty and orphan parents are roots, a repeated id
   * keeps its first record, and cycle stand-ins follow the real roots in stored
   * order. Each sibling group is sorted on its own, as the tree always has.
   */
  layout(order?: FolderOrder): FolderLayout;
  /** A folder's children in the tree's layout and order. */
  children(parentId: string, order?: FolderOrder): readonly Folder[];
  /** The references a folder's own bucket holds, in stored order. */
  refs(folderId: string): readonly ConversationReference[];
  /**
   * A bucket's references in the shared tree's order: as stored, or starred
   * first, then manual `sortIndex` or recency, with the comparator's fallbacks.
   * A view that shows only some references must sort that subset itself: with
   * missing `sortIndex` values the manual order is not transitive, so filtering
   * this list can differ from sorting the filtered references.
   */
  orderedRefs(folderId: string, order: ConversationOrder): readonly ConversationReference[];
  /**
   * The buckets holding a reference whose `conversationId` is exactly this id,
   * each once, in bucket order. Legacy URL or `c_` spellings are not matched;
   * native-row checks keep `buildConversationMembership` for those.
   */
  bucketsHolding(conversationId: string): readonly string[];
}

const NONE: readonly never[] = Object.freeze([]);

export function buildFolderIndex(data: FolderData): FolderIndex {
  let folderById: Map<string, Folder> | null = null;
  let cycleRoots: Set<string> | null = null;
  const layouts = new Map<FolderOrder, FolderLayout>();
  let membership: Map<string, string[]> | null = null;
  const orderedBuckets = new Map<
    ConversationOrder,
    Map<string, readonly ConversationReference[]>
  >();

  const uniqueFolders = (): Map<string, Folder> => {
    if (folderById) return folderById;
    folderById = new Map();
    for (const folder of data.folders)
      if (!folderById.has(folder.id)) folderById.set(folder.id, folder);
    return folderById;
  };
  const cutFolders = (): Set<string> => (cycleRoots ??= findCycleRoots(data.folders));

  const buildLayout = (order: FolderOrder): FolderLayout => {
    const sort = (folders: Folder[]) =>
      order === 'created' ? sortFoldersByCreation(folders) : sortFolders(folders);
    const unique = uniqueFolders();
    const cut = cutFolders();
    const byParent = new Map<string, Folder[]>();
    const realRoots: Folder[] = [];
    const standIns: Folder[] = [];
    for (const folder of unique.values()) {
      if (isRootFolder(folder, unique)) {
        realRoots.push(folder);
      } else if (cut.has(folder.id)) {
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
  };

  const layout = (order?: FolderOrder): FolderLayout => {
    let built = layouts.get(order);
    if (!built) {
      built = buildLayout(order);
      layouts.set(order, built);
    }
    return built;
  };

  return {
    get folderById() {
      return uniqueFolders();
    },
    get cycleRoots() {
      return cutFolders();
    },
    layout,
    children: (parentId, order) => layout(order).children.get(parentId) ?? NONE,
    refs: (folderId) => ownBucket(data.folderContents, folderId) ?? NONE,
    orderedRefs(folderId, order) {
      const refs = ownBucket(data.folderContents, folderId) ?? NONE;
      if (order === 'stored') return refs;
      let sorted = orderedBuckets.get(order);
      if (!sorted) {
        sorted = new Map();
        orderedBuckets.set(order, sorted);
      }
      let bucket = sorted.get(folderId);
      if (!bucket) {
        bucket = sortConversationsByPriority(refs, order);
        sorted.set(folderId, bucket);
      }
      return bucket;
    },
    bucketsHolding(conversationId) {
      if (!membership) {
        membership = new Map();
        for (const bucketId of Object.keys(data.folderContents)) {
          for (const conversation of ownBucket(data.folderContents, bucketId) ?? NONE) {
            const buckets = membership.get(conversation.conversationId);
            if (!buckets) membership.set(conversation.conversationId, [bucketId]);
            else if (buckets[buckets.length - 1] !== bucketId) buckets.push(bucketId);
          }
        }
      }
      return membership.get(conversationId) ?? NONE;
    },
  };
}
