import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';
import type { PromptItem } from '@/core/types/sync';

/**
 * Merges two lists of items based on ID and updatedAt timestamp.
 * Prefers the item with the later updatedAt timestamp.
 */
function mergeItems<T extends { id: string; updatedAt?: number; createdAt?: number }>(
  localItems: T[],
  cloudItems: T[],
): T[] {
  const itemMap = new Map<string, T>();

  // Add all local items first
  localItems.forEach((item) => {
    itemMap.set(item.id, item);
  });

  // Merge cloud items
  cloudItems.forEach((cloudItem) => {
    const localItem = itemMap.get(cloudItem.id);
    if (!localItem) {
      // New item from cloud
      itemMap.set(cloudItem.id, cloudItem);
    } else {
      // Conflict: compare timestamps
      // Use createdAt as fallback for updatedAt
      const cloudTime = cloudItem.updatedAt || cloudItem.createdAt || 0;
      const localTime = localItem.updatedAt || localItem.createdAt || 0;

      if (cloudTime > localTime) {
        itemMap.set(cloudItem.id, cloudItem);
      }
      // If local is newer or equal, keep local
    }
  });

  return Array.from(itemMap.values());
}

/**
 * Merges local and cloud folder data.
 */
export function mergeFolderData(local: FolderData, cloud: FolderData): FolderData {
  // 1. Merge Folders list
  const mergedFolders = mergeItems(local.folders, cloud.folders);

  // 2. Merge Folder Contents
  const mergedContents: Record<string, ConversationReference[]> = { ...local.folderContents };

  // Iterate over cloud folders to ensure we capture all content
  // (Even for folders we might have just added)
  const allFolderIds = new Set([
    ...Object.keys(local.folderContents),
    ...Object.keys(cloud.folderContents),
  ]);

  allFolderIds.forEach((folderId) => {
    const localConvos = local.folderContents[folderId] || [];
    const cloudConvos = cloud.folderContents[folderId] || [];

    // Simple de-duplication by conversationId
    // We don't have updatedAt for conversation references typically,
    // but we can check if they are identical.
    // If valid conflict resolution is needed for convos, we'd need more data.
    // For now: Union by conversationId.
    // If dup, keep LOCAL version (preserves local state if there's any diff, though refs are usually static).

    const convoMap = new Map<string, ConversationReference>();

    // Add Cloud first (so Local can overwrite)
    cloudConvos.forEach((c) => convoMap.set(c.conversationId, c));
    localConvos.forEach((c) => convoMap.set(c.conversationId, c));

    mergedContents[folderId] = Array.from(convoMap.values());
  });

  return {
    folders: mergedFolders,
    folderContents: mergedContents,
  };
}

/**
 * Merges local and cloud prompts.
 */
export function mergePrompts(local: PromptItem[], cloud: PromptItem[]): PromptItem[] {
  return mergeItems(local, cloud);
}
