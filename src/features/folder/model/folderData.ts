import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';

export type ConversationSortMode = 'manual' | 'recent';

export function sortFolders(folders: readonly Folder[]): Folder[] {
  return [...folders].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    const aIndex = a.sortIndex ?? -1;
    const bIndex = b.sortIndex ?? -1;
    if (aIndex >= 0 && bIndex >= 0) return aIndex - bIndex;

    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  });
}

/** Pinned first, then oldest first. */
export function sortFoldersByCreation(folders: readonly Folder[]): Folder[] {
  return [...folders].sort(
    (a, b) => Number(!!b.pinned) - Number(!!a.pinned) || a.createdAt - b.createdAt,
  );
}

/** Whether a record shows starred; by default its own stored `starred`. */
export type StarredReader = (conversation: ConversationReference) => boolean;
const storedStar: StarredReader = (conversation) => !!conversation.starred;

export function sortConversationsByPriority(
  conversations: readonly ConversationReference[],
  mode: ConversationSortMode = 'manual',
  starred: StarredReader = storedStar,
): ConversationReference[] {
  return [...conversations].sort((a, b) => {
    const starOrder = Number(starred(b)) - Number(starred(a));
    if (starOrder !== 0) return starOrder;

    if (mode === 'manual') {
      const aIndex = a.sortIndex;
      const bIndex = b.sortIndex;
      if (aIndex != null && bIndex != null && aIndex !== bIndex) return aIndex - bIndex;
    }

    const timeDifference = (b.lastOpenedAt ?? b.addedAt ?? 0) - (a.lastOpenedAt ?? a.addedAt ?? 0);
    if (timeDifference !== 0) return timeDifference;
    return a.conversationId.localeCompare(b.conversationId);
  });
}

/**
 * Whether a folder shows at the root: its parent is unset (`null`, missing or
 * `''`, all of which stored and imported data hold) or names no folder. Read
 * only for display and removal; stored data keeps its `parentId`.
 */
export function isRootFolder(folder: Folder, folderIds: { has: (id: string) => boolean }): boolean {
  return !folder.parentId || !folderIds.has(folder.parentId);
}

/**
 * The folders that stand in as roots because a cycle of stored parents keeps
 * every real root from reaching them: the first of each such group in stored
 * order. A repeated id counts by its first record. The tree shows each one at
 * the root with the rest of its group under it as stored, and removal cuts the
 * cycle at the same folder. Imports cut cycles without losing buckets; stored
 * parents stay untouched, including cycles from Drive merges or older data.
 */
export function findCycleRoots(folders: readonly Folder[]): Set<string> {
  const unique = new Map<string, Folder>();
  for (const folder of folders) if (!unique.has(folder.id)) unique.set(folder.id, folder);
  const kidsOf = new Map<string, string[]>();
  const reached = new Set<string>();
  const pending: string[] = [];
  for (const folder of unique.values()) {
    if (isRootFolder(folder, unique)) {
      reached.add(folder.id);
      pending.push(folder.id);
      continue;
    }
    const kids = kidsOf.get(folder.parentId as string) ?? [];
    kids.push(folder.id);
    kidsOf.set(folder.parentId as string, kids);
  }
  const reachFromPending = () => {
    while (pending.length > 0) {
      for (const kid of kidsOf.get(pending.pop()!) ?? []) {
        if (reached.has(kid)) continue;
        reached.add(kid);
        pending.push(kid);
      }
    }
  };
  reachFromPending();
  const cycleRoots = new Set<string>();
  for (const id of unique.keys()) {
    if (reached.has(id)) continue;
    cycleRoots.add(id);
    reached.add(id);
    pending.push(id);
    reachFromPending();
  }
  return cycleRoots;
}

/**
 * Moves the folder `findCycleRoots` picks to cut each parent cycle to the root,
 * where the tree already shows it, so an imported file keeps every folder and
 * bucket and stores no cycle. Returns `folders` itself when there is none.
 */
export function cutFolderCycles(folders: Folder[]): Folder[] {
  const cycleRoots = findCycleRoots(folders);
  if (cycleRoots.size === 0) return folders;
  return folders.map((folder) =>
    cycleRoots.has(folder.id) ? { ...folder, parentId: null } : folder,
  );
}

/**
 * Includes the requested ID, even when only its legacy contents bucket remains.
 * Follows what the tree shows: the first record of a repeated id, and a parent
 * cycle cut where `findCycleRoots` cuts it.
 */
export function getFolderAndDescendants(data: FolderData, folderId: string): string[] {
  const cycleRoots = findCycleRoots(data.folders);
  const children = new Map<string, string[]>();
  const listed = new Set<string>();
  for (const folder of data.folders) {
    if (listed.has(folder.id)) continue;
    listed.add(folder.id);
    if (folder.parentId === null || cycleRoots.has(folder.id)) continue;
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder.id);
    children.set(folder.parentId, siblings);
  }

  const result: string[] = [];
  const seen = new Set<string>();
  const pending = [folderId];
  while (pending.length > 0) {
    const id = pending.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    const descendants = children.get(id) ?? [];
    for (let index = descendants.length - 1; index >= 0; index--) {
      pending.push(descendants[index]);
    }
  }
  return result;
}

/** Unknown folders have depth zero. Cyclic legacy parents are read without rewriting them. */
export function getFolderDepth(data: FolderData, folderId: string): number {
  let depth = 0;
  let current = data.folders.find((folder) => folder.id === folderId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    depth++;
    current = data.folders.find((folder) => folder.id === current?.parentId);
  }
  return depth;
}

function isFolderDescendant(data: FolderData, folderId: string, ancestorId: string): boolean {
  let currentId: string | null = folderId;
  const seen = new Set<string>();
  while (currentId && !seen.has(currentId)) {
    if (currentId === ancestorId) return true;
    seen.add(currentId);
    currentId = data.folders.find((folder) => folder.id === currentId)?.parentId || null;
  }
  return false;
}

/** Returns the original data when rejected; descendants and conversation records stay untouched. */
export function moveFolder(
  data: FolderData,
  folderId: string,
  targetParentId: string | null,
  now: number,
  insertIndex?: number,
): FolderData {
  const folder = data.folders.find((candidate) => candidate.id === folderId);
  if (!folder || folder.pinned || folderId === targetParentId) return data;
  if (targetParentId && isFolderDescendant(data, targetParentId, folderId)) return data;

  const sourceParentId = folder.parentId;
  if (insertIndex == null && sourceParentId === targetParentId) return data;

  const siblings = (parentId: string | null) =>
    sortFolders(
      data.folders.filter(
        (candidate) =>
          candidate.parentId === parentId &&
          candidate.id !== folderId &&
          !!candidate.pinned === !!folder.pinned,
      ),
    );
  const sourceSiblings = siblings(sourceParentId);
  const targetSiblings = siblings(targetParentId);
  let normalizedIndex = insertIndex ?? targetSiblings.length;
  if (sourceParentId === targetParentId) {
    const originalIndex = sortFolders(
      data.folders.filter(
        (candidate) =>
          candidate.parentId === sourceParentId && !!candidate.pinned === !!folder.pinned,
      ),
    ).findIndex((candidate) => candidate.id === folderId);
    if (originalIndex >= 0 && originalIndex < normalizedIndex) normalizedIndex--;
  }

  const nextOrder = [...targetSiblings];
  nextOrder.splice(Math.max(0, Math.min(normalizedIndex, targetSiblings.length)), 0, folder);
  const indices = new Map<Folder, number>(nextOrder.map((sibling, index) => [sibling, index]));
  if (sourceParentId !== targetParentId) {
    sourceSiblings.forEach((sibling, index) => indices.set(sibling, index));
  }

  return {
    ...data,
    folders: data.folders.map((candidate) => {
      const sortIndex = indices.get(candidate);
      if (candidate === folder)
        return { ...folder, parentId: targetParentId, updatedAt: now, sortIndex };
      return sortIndex != null && sortIndex !== candidate.sortIndex
        ? { ...candidate, sortIndex }
        : candidate;
    }),
  };
}

/** Removes only the selected subtree and its exact contents keys after the caller confirms. */
export function removeFolder(data: FolderData, folderId: string): FolderData {
  const removedIds = new Set(getFolderAndDescendants(data, folderId));
  const folders = data.folders.filter((folder) => !removedIds.has(folder.id));
  const folderContents = { ...data.folderContents };
  let removedContents = false;
  for (const id of removedIds) {
    if (!Object.hasOwn(folderContents, id)) continue;
    delete folderContents[id];
    removedContents = true;
  }
  return folders.length === data.folders.length && !removedContents
    ? data
    : { ...data, folders, folderContents };
}

/**
 * Moves stored references, retaining their metadata and ordering within the
 * dragged starred group. `starred` is the star the tree shows (a conversation's,
 * from any of its records), so the groups match the rows the drop was aimed at;
 * stored `starred` values are left as they are.
 */
export function reorderConversations(
  data: FolderData,
  conversationIds: readonly string[],
  sourceParentId: string,
  targetParentId: string,
  insertIndex: number,
  mode: ConversationSortMode = 'manual',
  starred: StarredReader = storedStar,
): FolderData {
  const removeSet = new Set(conversationIds);
  const uniqueIds = [...removeSet];
  const source = ownBucket(data.folderContents, sourceParentId) ?? [];
  if (!source.some((conversation) => removeSet.has(conversation.conversationId))) return data;

  const folderContents = {
    ...data.folderContents,
    [sourceParentId]: source.map((conversation) => ({ ...conversation })),
  };
  if (sourceParentId !== targetParentId) {
    setBucket(
      folderContents,
      targetParentId,
      (ownBucket(data.folderContents, targetParentId) ?? []).map((conversation) => ({
        ...conversation,
      })),
    );
  }
  // The first record of each id, as a per-id `find` took it, from one pass.
  const firstById = firstIndexById(folderContents[sourceParentId], removeSet);
  const moving = uniqueIds.flatMap((id) => {
    const index = firstById.get(id);
    return index === undefined ? [] : [folderContents[sourceParentId][index]];
  });
  const isStarred = starred(moving[0]);
  const inGroup = (conversation: ConversationReference) => starred(conversation) === isStarred;

  if (sourceParentId === targetParentId) {
    const originalSorted = sortConversationsByPriority(
      folderContents[targetParentId].filter(inGroup),
      mode,
      starred,
    );
    const originalIndices = firstIndexById(originalSorted, removeSet);
    let adjustment = 0;
    for (const id of uniqueIds) {
      const originalIndex = originalIndices.get(id) ?? -1;
      if (originalIndex >= 0 && originalIndex < insertIndex) adjustment++;
    }
    insertIndex -= adjustment;
  }

  setBucket(
    folderContents,
    sourceParentId,
    folderContents[sourceParentId].filter(
      (conversation) => !removeSet.has(conversation.conversationId),
    ),
  );
  if (sourceParentId !== targetParentId) {
    sortConversationsByPriority(folderContents[sourceParentId], mode, starred).forEach(
      (conversation, index) => {
        conversation.sortIndex = index;
      },
    );
  }

  const target = folderContents[targetParentId].filter(
    (conversation) => !removeSet.has(conversation.conversationId),
  );
  const sameGroup = sortConversationsByPriority(target.filter(inGroup), mode, starred);
  const otherGroup = target.filter((conversation) => !inGroup(conversation));
  // Keep the existing splice semantics: the UI supplies an index in the original starred group.
  sameGroup.splice(Math.min(insertIndex, sameGroup.length), 0, ...moving);
  sameGroup.forEach((conversation, index) => {
    conversation.sortIndex = index;
  });
  otherGroup.forEach((conversation, index) => {
    if (conversation.sortIndex == null) conversation.sortIndex = index;
  });
  setBucket(folderContents, targetParentId, [...sameGroup, ...otherGroup]);
  return { ...data, folderContents };
}

/** Where each of `ids` first occurs in `conversations`, the index a `findIndex` would return. */
function firstIndexById(
  conversations: readonly ConversationReference[],
  ids: ReadonlySet<string>,
): Map<string, number> {
  const indices = new Map<string, number>();
  conversations.forEach((conversation, index) => {
    const id = conversation.conversationId;
    if (ids.has(id) && !indices.has(id)) indices.set(id, index);
  });
  return indices;
}

/** Repairs the existing persistence invariants without pruning legacy buckets or rewriting IDs/parents. */
export function normalizeFolderData(data: FolderData): FolderData {
  let changed = !data.folders || !data.folderContents;
  const originalFolders = data.folders ?? [];
  const folderContents = { ...data.folderContents };
  for (const folder of originalFolders) {
    // A missing bucket, including one only inherited (`__proto__` and
    // `constructor` read truthy), is repaired. A malformed bucket the folder
    // does own is not: the check below throws, so the load recovers a backup.
    if (!Object.hasOwn(folderContents, folder.id) || !folderContents[folder.id]) {
      setBucket(folderContents, folder.id, []);
      changed = true;
    }
  }

  const foldersByParent = new Map<string, Folder[]>();
  for (const folder of originalFolders) {
    const parentKey = folder.parentId ?? '__root__';
    const siblings = foldersByParent.get(parentKey) ?? [];
    siblings.push(folder);
    foldersByParent.set(parentKey, siblings);
  }
  const folderIndices = new Map<Folder, number>();
  for (const siblings of foldersByParent.values()) {
    if (!siblings.some((folder) => folder.sortIndex == null)) continue;
    [...siblings]
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
      )
      .forEach((folder, index) => {
        if (folder.sortIndex == null) folderIndices.set(folder, index);
      });
  }
  const folders = originalFolders.map((folder) => {
    const sortIndex = folderIndices.get(folder);
    if (sortIndex == null) return folder;
    changed = true;
    return { ...folder, sortIndex };
  });

  for (const [folderId, conversations] of Object.entries(folderContents)) {
    if (!Array.isArray(conversations)) {
      throw new TypeError(`Folder bucket "${folderId}" is not a list`);
    }
    const seen = new Set<string>();
    let normalized = conversations.filter((conversation) => {
      if (seen.has(conversation.conversationId)) return false;
      seen.add(conversation.conversationId);
      return true;
    });
    const missingIndices = new Map<ConversationReference, number>();
    if (normalized.some((conversation) => conversation.sortIndex == null)) {
      [...normalized]
        .sort((a, b) => (b.lastOpenedAt ?? b.addedAt ?? 0) - (a.lastOpenedAt ?? a.addedAt ?? 0))
        .forEach((conversation, index) => {
          if (conversation.sortIndex == null) missingIndices.set(conversation, index);
        });
    }
    if (normalized.length === conversations.length && missingIndices.size === 0) continue;
    normalized = normalized.map((conversation) => {
      const sortIndex = missingIndices.get(conversation);
      return sortIndex == null ? conversation : { ...conversation, sortIndex };
    });
    setBucket(folderContents, folderId, normalized);
    changed = true;
  }
  return changed ? { ...data, folders, folderContents } : data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Structural check shared by load, migration and backup recovery; legacy metadata stays optional. */
export function validateFolderData(data: unknown): boolean {
  if (!isRecord(data) || !Array.isArray(data.folders) || !isRecord(data.folderContents))
    return false;
  const contents = data.folderContents;
  const prototype = Object.getPrototypeOf(contents);
  if (
    (prototype !== Object.prototype && prototype !== null) ||
    !data.folders.every((folder: unknown) => isRecord(folder) && typeof folder.id === 'string')
  )
    return false;
  const folderIds = new Set(data.folders.map((folder: { id: string }) => folder.id));
  // Only listed folders have falsy buckets repaired by normalizeFolderData.
  return Object.entries(contents).every(
    ([id, bucket]) =>
      (!bucket && folderIds.has(id)) || (Array.isArray(bucket) && bucket.every(isRecord)),
  );
}

/**
 * Whether `id` names a property every plain object inherits (`__proto__`,
 * `constructor`, `toString`…). No folder id or bucket key may be one: reading
 * it finds the inherited value, and assigning `__proto__` sets the prototype.
 */
export function isInheritedObjectKey(id: string): boolean {
  return id in Object.prototype;
}

/** The first folder id or bucket key in an imported file that is an inherited object key. */
export function findInheritedFolderKey(
  folders: readonly { id?: unknown }[],
  folderContents: object,
): string | null {
  const keys = [...folders.map((folder) => folder.id), ...Object.keys(folderContents)];
  const found = keys.find((key) => typeof key === 'string' && isInheritedObjectKey(key));
  return typeof found === 'string' ? found : null;
}

/**
 * The first folder id an imported file holds more than once. Two records with
 * one id share a bucket, and one naming itself as parent would nest forever.
 */
export function findRepeatedFolderId(folders: readonly { id?: unknown }[]): string | null {
  const seen = new Set<unknown>();
  for (const id of folders.map((folder) => folder?.id)) {
    if (seen.has(id)) return typeof id === 'string' ? id : String(id);
    seen.add(id);
  }
  return null;
}

/**
 * Stores `bucket` under `id` as an own property. Plain assignment would set the
 * prototype for `__proto__` and leave the folder without a bucket, so every
 * write that rebuilds `folderContents` by id goes through here.
 */
export function setBucket<T>(contents: Record<string, T[]>, id: string, bucket: T[]): void {
  Object.defineProperty(contents, id, {
    value: bucket,
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

/**
 * The bucket stored under `id` itself. Ids from a drag payload are page-readable
 * data, so an inherited key (`__proto__`, `constructor`) is never a bucket.
 */
export function ownBucket<T>(
  contents: Record<string, T[]>,
  id: string | undefined,
): T[] | undefined {
  if (!id || !Object.hasOwn(contents, id)) return undefined;
  const bucket = contents[id];
  return Array.isArray(bucket) ? bucket : undefined;
}

/** Copy folders and conversation references so a snapshot cannot alias live data. */
export function cloneFolderData(data: FolderData): FolderData {
  const folders = data.folders.map((folder) => ({ ...folder }));
  const folderContents = Object.fromEntries(
    Object.entries(data.folderContents || {}).map(([folderId, conversations]) => [
      folderId,
      Array.isArray(conversations)
        ? conversations.map((conversation) => ({ ...conversation }))
        : conversations,
    ]),
  );
  return { folders, folderContents };
}
