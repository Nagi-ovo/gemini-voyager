import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';
/**
 * AI Studio's folder edits, in the shapes AI Studio has always stored: folders
 * carry no `sortIndex`, a new folder's id is two random base-36 runs, and a
 * prompt lives in exactly one bucket. Each applies to the live data in place
 * (the session saves it) and returns whether anything changed; `placePrompt`
 * returns the next data instead.
 */
import { normalizeText } from '@/core/utils/text';
import { AISTUDIO_ROOT_BUCKET_ID } from '@/features/folder/constants';
import { ownBucket, removeFolder, setBucket } from '@/features/folder/model/folderData';
import { canCreateFolderUnder } from '@/features/folder/model/folderDepth';
import { placeConversations } from '@/features/folder/model/placeConversations';

/** An id for a new AI Studio folder, in the format AI Studio has always stored. */
export function newFolderId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function addFolder(
  data: FolderData,
  folder: { id: string; name: string; parentId: string | null; at: number },
): boolean {
  if (folder.parentId && !data.folders.some((candidate) => candidate.id === folder.parentId)) {
    return false;
  }
  if (!canCreateFolderUnder(data, folder.parentId)) return false;
  data.folders.push({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    isExpanded: true,
    createdAt: folder.at,
    updatedAt: folder.at,
  });
  setBucket(data.folderContents, folder.id, []);
  return true;
}

function findFolder(data: FolderData, folderId: string): Folder | undefined {
  return data.folders.find((folder) => folder.id === folderId);
}

export function renameFolder(data: FolderData, folderId: string, name: string, at: number) {
  const folder = findFolder(data, folderId);
  if (!folder || folder.name === name) return false;
  folder.name = name;
  folder.updatedAt = at;
  return true;
}

/** Removes a folder, the folders the tree shows inside it, and what they hold. */
export function deleteFolder(data: FolderData, folderId: string): boolean {
  const next = removeFolder(data, folderId);
  if (next === data) return false;
  data.folders = next.folders;
  data.folderContents = next.folderContents;
  return true;
}

export function toggleFolderPinned(data: FolderData, folderId: string): boolean {
  const folder = findFolder(data, folderId);
  if (!folder) return false;
  folder.pinned = !folder.pinned;
  return true;
}

export function toggleFolderExpanded(data: FolderData, folderId: string): boolean {
  const folder = findFolder(data, folderId);
  if (!folder) return false;
  folder.isExpanded = !folder.isExpanded;
  return true;
}

export function removeConversation(
  data: FolderData,
  folderId: string,
  conversationId: string,
): boolean {
  const bucket = ownBucket(data.folderContents, folderId);
  if (!bucket?.some((conversation) => conversation.conversationId === conversationId)) {
    return false;
  }
  setBucket(
    data.folderContents,
    folderId,
    bucket.filter((conversation) => conversation.conversationId !== conversationId),
  );
  return true;
}

/**
 * Places a dropped prompt in one bucket (`null`: Uncategorized) and takes it out
 * of every other: an AI Studio prompt lives in one place. A stored prompt moves
 * with its whole record (rename, open time and all), preferring the dragged
 * copy because legacy data can hold differing copies; the drag payload builds a
 * record only for a prompt no bucket holds yet. No `sortIndex` is added: AI
 * Studio shows buckets in stored order.
 */
/** A dropped prompt: its id, what the drag said about it, and the folder it left, if any. */
export interface DroppedPrompt {
  readonly conversationId: string;
  readonly title?: string;
  readonly url?: string;
  readonly sourceFolderId?: string;
}

export function placePrompt(
  data: FolderData,
  prompt: DroppedPrompt,
  targetFolderId: string | null,
  created: { untitledTitle: string; at: number },
): FolderData {
  const { conversationId } = prompt;
  const held = (list: ConversationReference[] | undefined) =>
    list?.find((conversation) => conversation.conversationId === conversationId);
  const stored =
    held(ownBucket(data.folderContents, prompt.sourceFolderId)) ??
    held(Object.values(data.folderContents).flat());
  const record: ConversationReference = stored ?? {
    conversationId,
    title: normalizeText(prompt.title) || created.untitledTitle,
    url: prompt.url || '',
    addedAt: created.at,
  };
  return placeConversations(data, [record], {
    target: targetFolderId || AISTUDIO_ROOT_BUCKET_ID,
    placement: 'keep',
    removeFrom: 'everywhere',
    removeWhenPresent: true,
  }).data;
}
