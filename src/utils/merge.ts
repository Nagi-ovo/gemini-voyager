import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';
import type { PromptItem } from '@/core/types/sync';
import type { ForkNode, ForkNodesData } from '@/pages/content/fork/forkTypes';
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

function getFolderPath(folderId: string, folderMap: Map<string, Folder>): string | null {
  const folder = folderMap.get(folderId);
  if (!folder) return null;
  let path = folder.name;
  let current = folder;
  let depth = 0;

  while (current.parentId) {
    if (depth++ > 50) return null; // Prevent infinite loop protection
    const parent = folderMap.get(current.parentId);
    if (!parent) return null;
    path = `${parent.name}\0${path}`;
    current = parent;
  }
  return path;
  return path;
}

/**
 * Merges local and cloud folder data.
 */
export function mergeFolderData(local: FolderData, cloud: FolderData): FolderData {
  const localFolderMap = new Map(local.folders.map((f) => [f.id, f]));
  const cloudFolderMap = new Map(cloud.folders.map((f) => [f.id, f]));

  const localPathMap = new Map<string, string>();
  const cloudPathMap = new Map<string, string>();

  local.folders.forEach((f) => {
    const p = getFolderPath(f.id, localFolderMap);
    if (p) localPathMap.set(p, f.id);
  });

  cloud.folders.forEach((f) => {
    const p = getFolderPath(f.id, cloudFolderMap);
    if (p) cloudPathMap.set(p, f.id);
  });

  const idRemap = new Map<string, string>();

  // Find overlapping paths
  for (const [path, localId] of localPathMap.entries()) {
    const cloudId = cloudPathMap.get(path);
    if (cloudId && localId !== cloudId) {
      idRemap.set(localId, cloudId);
    }
  }

  // Rewrite local folders using remapped IDs
  const rewrittenLocalFolders = local.folders.map((f) => {
    const newId = idRemap.get(f.id) || f.id;
    const newParentId = f.parentId ? (idRemap.get(f.parentId) || f.parentId) : null;
    return { ...f, id: newId, parentId: newParentId } as typeof f;
  });

  // Rewrite local folderContents keys
  const rewrittenLocalContents: Record<string, ConversationReference[]> = {};
  for (const [folderId, convos] of Object.entries(local.folderContents)) {
    const newId = idRemap.get(folderId) || folderId;
    if (!rewrittenLocalContents[newId]) {
      rewrittenLocalContents[newId] = [];
    }
    rewrittenLocalContents[newId].push(...convos);
  }

  // 1. Merge Folders list
  const mergedFolders = mergeItems(rewrittenLocalFolders, cloud.folders);

  // Deduplicate merged folders array by ID to handle local duplicate paths safely
  const uniqueFoldersMap = new Map<string, typeof mergedFolders[0]>();
  mergedFolders.forEach((f) => {
    const existing = uniqueFoldersMap.get(f.id);
    if (!existing || (f.updatedAt && existing.updatedAt && f.updatedAt > existing.updatedAt)) {
      uniqueFoldersMap.set(f.id, f);
    }
  });

  // 2. Merge Folder Contents
  const mergedContents: Record<string, ConversationReference[]> = { ...rewrittenLocalContents };

  // Iterate over cloud folders to ensure we capture all content
  const allFolderIds = new Set([
    ...Object.keys(rewrittenLocalContents),
    ...Object.keys(cloud.folderContents),
  ]);

  allFolderIds.forEach((folderId) => {
    const localConvos = rewrittenLocalContents[folderId] || [];
    const cloudConvos = cloud.folderContents[folderId] || [];

    const convoMap = new Map<string, ConversationReference>();

    // Add local conversations first
    localConvos.forEach((c) => convoMap.set(c.conversationId, c));

    // Cloud conversations override local
    cloudConvos.forEach((c) => {
      const existing = convoMap.get(c.conversationId);
      if (!existing) {
        convoMap.set(c.conversationId, c);
      } else {
        convoMap.set(c.conversationId, {
          ...existing,
          ...c,
          starred: c.starred ?? existing.starred,
        });
      }
    });

    mergedContents[folderId] = Array.from(convoMap.values());
  });

  return {
    folders: Array.from(uniqueFoldersMap.values()),
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

/**
 * Merges local and cloud fork nodes.
 * Uses forkGroupId + turnId as the unique key within each conversation.
 * Prefers the node with the newer createdAt timestamp when duplicates exist.
 */
export function mergeForkNodes(local: ForkNodesData, cloud: ForkNodesData): ForkNodesData {
  const localNodes = local?.nodes || {};
  const cloudNodes = cloud?.nodes || {};

  const allConversationIds = new Set([...Object.keys(localNodes), ...Object.keys(cloudNodes)]);

  const mergedNodes: Record<string, ForkNode[]> = {};

  allConversationIds.forEach((conversationId) => {
    const localConvoNodes = localNodes[conversationId] || [];
    const cloudConvoNodes = cloudNodes[conversationId] || [];

    // Use "forkGroupId:turnId" as unique key
    const nodeMap = new Map<string, ForkNode>();

    // Add cloud nodes first
    cloudConvoNodes.forEach((node) => {
      const key = `${node.forkGroupId}:${node.turnId}`;
      nodeMap.set(key, node);
    });

    // Merge local nodes - prefer newer createdAt
    localConvoNodes.forEach((localNode) => {
      const key = `${localNode.forkGroupId}:${localNode.turnId}`;
      const existing = nodeMap.get(key);
      if (!existing) {
        nodeMap.set(key, localNode);
      } else if (localNode.createdAt >= existing.createdAt) {
        nodeMap.set(key, localNode);
      }
    });

    const mergedArray = Array.from(nodeMap.values());
    if (mergedArray.length > 0) {
      mergedNodes[conversationId] = mergedArray;
    }
  });

  // Rebuild groups index from merged nodes
  const mergedGroups: Record<string, string[]> = {};
  for (const [conversationId, nodes] of Object.entries(mergedNodes)) {
    for (const node of nodes) {
      if (!mergedGroups[node.forkGroupId]) {
        mergedGroups[node.forkGroupId] = [];
      }
      const groupKey = `${conversationId}:${node.turnId}`;
      if (!mergedGroups[node.forkGroupId].includes(groupKey)) {
        mergedGroups[node.forkGroupId].push(groupKey);
      }
    }
  }

  return { nodes: mergedNodes, groups: mergedGroups };
}
