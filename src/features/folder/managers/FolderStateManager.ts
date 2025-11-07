/**
 * Folder State Manager
 * Manages folder data state with Repository pattern
 */

import type { Folder, FolderData, ConversationReference, FolderId, ConversationId } from '@/core';
import { logger, sortFolders } from '@/core';

export class FolderStateManager {
  private readonly logger = logger.createChild('FolderState');
  private data: FolderData = {
    folders: [],
    folderContents: {},
  };

  constructor(initialData?: FolderData) {
    if (initialData) {
      this.data = initialData;
    }
  }

  // Folder operations
  getFolders(): readonly Folder[] {
    return this.data.folders;
  }

  getFolder(id: FolderId): Folder | undefined {
    return this.data.folders.find((f) => f.id === id);
  }

  addFolder(folder: Folder): void {
    this.data.folders.push(folder);
    this.data.folderContents[folder.id] = [];
    this.logger.debug('Folder added', { id: folder.id, name: folder.name });
  }

  updateFolder(id: FolderId, updates: Partial<Omit<Folder, 'id'>>): boolean {
    const folder = this.getFolder(id);

    if (!folder) {
      this.logger.warn('Folder not found for update', { id });
      return false;
    }

    Object.assign(folder, updates, { updatedAt: Date.now() });
    this.logger.debug('Folder updated', { id, updates });

    return true;
  }

  deleteFolder(id: FolderId): boolean {
    const index = this.data.folders.findIndex((f) => f.id === id);

    if (index === -1) {
      this.logger.warn('Folder not found for deletion', { id });
      return false;
    }

    this.data.folders.splice(index, 1);
    delete this.data.folderContents[id];
    this.logger.debug('Folder deleted', { id });

    return true;
  }

  deleteFoldersRecursive(folderIds: FolderId[]): void {
    folderIds.forEach((id) => {
      this.deleteFolder(id);
    });
  }

  // Folder hierarchy operations
  getRootFolders(): Folder[] {
    const rootFolders = this.data.folders.filter((f) => f.parentId === null);
    return sortFolders(rootFolders);
  }

  getSubfolders(parentId: FolderId): Folder[] {
    const subfolders = this.data.folders.filter((f) => f.parentId === parentId);
    return sortFolders(subfolders);
  }

  hasSubfolders(folderId: FolderId): boolean {
    return this.data.folders.some((f) => f.parentId === folderId);
  }

  isFolderDescendant(folderId: FolderId, potentialAncestorId: FolderId): boolean {
    let currentId: FolderId | null = folderId;

    while (currentId) {
      if (currentId === potentialAncestorId) {
        return true;
      }

      const folder = this.getFolder(currentId);
      currentId = folder?.parentId ?? null;
    }

    return false;
  }

  getFolderAndDescendants(folderId: FolderId): FolderId[] {
    const result: FolderId[] = [folderId];
    const children = this.getSubfolders(folderId);

    children.forEach((child) => {
      result.push(...this.getFolderAndDescendants(child.id));
    });

    return result;
  }

  // Conversation operations
  getConversations(folderId: FolderId): readonly ConversationReference[] {
    return this.data.folderContents[folderId] || [];
  }

  addConversation(folderId: FolderId, conversation: ConversationReference): boolean {
    if (!this.data.folderContents[folderId]) {
      this.data.folderContents[folderId] = [];
    }

    // Check for duplicates
    const exists = this.data.folderContents[folderId].some(
      (c) => c.conversationId === conversation.conversationId
    );

    if (exists) {
      this.logger.debug('Conversation already in folder', {
        folderId,
        conversationId: conversation.conversationId,
      });

      return false;
    }

    this.data.folderContents[folderId].push(conversation);
    this.logger.debug('Conversation added to folder', {
      folderId,
      conversationId: conversation.conversationId,
    });

    return true;
  }

  removeConversation(folderId: FolderId, conversationId: ConversationId): boolean {
    if (!this.data.folderContents[folderId]) {
      return false;
    }

    const initialLength = this.data.folderContents[folderId].length;

    this.data.folderContents[folderId] = this.data.folderContents[folderId].filter(
      (c) => c.conversationId !== conversationId
    );

    const removed = this.data.folderContents[folderId].length < initialLength;

    if (removed) {
      this.logger.debug('Conversation removed from folder', { folderId, conversationId });
    }

    return removed;
  }

  moveConversation(
    sourceFolderId: FolderId,
    targetFolderId: FolderId,
    conversationId: ConversationId
  ): boolean {
    const conversation = this.data.folderContents[sourceFolderId]?.find(
      (c) => c.conversationId === conversationId
    );

    if (!conversation) {
      this.logger.warn('Conversation not found in source folder', {
        sourceFolderId,
        conversationId,
      });

      return false;
    }

    this.removeConversation(sourceFolderId, conversationId);

    return this.addConversation(targetFolderId, {
      ...conversation,
      addedAt: Date.now(),
    });
  }

  updateConversation(
    folderId: FolderId,
    conversationId: ConversationId,
    updates: Partial<Omit<ConversationReference, 'conversationId'>>
  ): boolean {
    const conversations = this.data.folderContents[folderId];

    if (!conversations) {
      return false;
    }

    const conversation = conversations.find((c) => c.conversationId === conversationId);

    if (!conversation) {
      return false;
    }

    Object.assign(conversation, updates);
    this.logger.debug('Conversation updated', { folderId, conversationId, updates });

    return true;
  }

  removeConversationFromAllFolders(conversationId: ConversationId): void {
    let removed = false;

    for (const folderId in this.data.folderContents) {
      if (this.removeConversation(folderId as FolderId, conversationId)) {
        removed = true;
      }
    }

    if (removed) {
      this.logger.debug('Conversation removed from all folders', { conversationId });
    }
  }

  // Data access
  getData(): FolderData {
    return {
      folders: [...this.data.folders],
      folderContents: { ...this.data.folderContents },
    };
  }

  setData(data: FolderData): void {
    this.data = data;
    this.logger.debug('Data set', {
      folderCount: data.folders.length,
      folderWithContents: Object.keys(data.folderContents).length,
    });
  }

  // Statistics
  getTotalFolderCount(): number {
    return this.data.folders.length;
  }

  getTotalConversationCount(): number {
    return Object.values(this.data.folderContents).reduce(
      (sum, conversations) => sum + conversations.length,
      0
    );
  }

  getConversationCount(folderId: FolderId): number {
    return this.data.folderContents[folderId]?.length || 0;
  }
}
