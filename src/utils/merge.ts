import type { ConversationReference, FolderData } from '@/core/types/folder';
import type { PromptItem } from '@/core/types/sync';
import type { StarredMessage, StarredMessagesData } from '@/pages/content/timeline/starredTypes';

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

    // Merge conversation references: Cloud-first strategy
    // This ensures renamed titles from cloud sync are applied to local
    // - If user renamed title locally and uploaded, cloud has the new title
    // - If user downloads on another device, cloud title should override local
    // - If conversation only exists locally, keep it (new local addition)

    const convoMap = new Map<string, ConversationReference>();

    // Add local conversations first
    localConvos.forEach((c) => convoMap.set(c.conversationId, c));

    // Cloud conversations override local (this is the key change)
    cloudConvos.forEach((c) => {
      const existing = convoMap.get(c.conversationId);
      if (!existing) {
        // New from cloud
        convoMap.set(c.conversationId, c);
      } else {
        // Merge: cloud properties override, but keep local-only properties
        convoMap.set(c.conversationId, {
          ...existing, // Keep any local-only properties
          ...c, // Cloud overrides (title, customTitle, etc.)
          // Preserve starred if set locally but not in cloud
          starred: c.starred ?? existing.starred,
        });
      }
    });

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

/**
 * Merges local and cloud starred messages.
 * Uses turnId as the unique key within each conversation.
 * Prefers the message with the newer starredAt timestamp when duplicates exist.
 */
export function mergeStarredMessages(
  local: StarredMessagesData,
  cloud: StarredMessagesData,
): StarredMessagesData {
  // Ensure we have valid input structures
  const localMessages = local?.messages || {};
  const cloudMessages = cloud?.messages || {};

  // Get all conversation IDs from both sources
  const allConversationIds = new Set([
    ...Object.keys(localMessages),
    ...Object.keys(cloudMessages),
  ]);

  const mergedMessages: Record<string, StarredMessage[]> = {};

  allConversationIds.forEach((conversationId) => {
    const localConvoMessages = localMessages[conversationId] || [];
    const cloudConvoMessages = cloudMessages[conversationId] || [];

    // Use Map with turnId as key for deduplication
    const messageMap = new Map<string, StarredMessage>();

    // Add cloud messages first (so local can overwrite if newer)
    cloudConvoMessages.forEach((msg) => {
      messageMap.set(msg.turnId, msg);
    });

    // Merge local messages - prefer newer starredAt
    localConvoMessages.forEach((localMsg) => {
      const existingMsg = messageMap.get(localMsg.turnId);
      if (!existingMsg) {
        // New message from local
        messageMap.set(localMsg.turnId, localMsg);
      } else {
        // Conflict: compare starredAt timestamps
        if (localMsg.starredAt >= existingMsg.starredAt) {
          messageMap.set(localMsg.turnId, localMsg);
        }
        // If cloud is newer, keep cloud (already in map)
      }
    });

    // Only add non-empty arrays
    const mergedArray = Array.from(messageMap.values());
    if (mergedArray.length > 0) {
      mergedMessages[conversationId] = mergedArray;
    }
  });

  return { messages: mergedMessages };
}
