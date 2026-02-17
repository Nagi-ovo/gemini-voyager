/**
 * Folder-specific types
 * Extracted from the monolithic FolderManager
 */
import type { ConversationId, FolderId } from './common';

export interface Folder {
  readonly id: FolderId;
  name: string;
  parentId: FolderId | null;
  isExpanded: boolean;
  pinned?: boolean;
  color?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationReference {
  readonly conversationId: ConversationId;
  title: string;
  url: string;
  addedAt: number;
  lastOpenedAt?: number; // Timestamp when the conversation was last opened
  updatedAt?: number; // Timestamp when the reference was last updated (e.g., renamed)
  isGem?: boolean;
  gemId?: string;
  starred?: boolean; // Whether this conversation is starred in the folder
  customTitle?: boolean; // Whether title was manually renamed in folder (don't auto-sync from native)
}

export interface FolderData {
  folders: Folder[];
  folderContents: Record<string, ConversationReference[]>;
}

export type DragDataType = 'conversation' | 'folder';

export interface BaseDragData {
  type: DragDataType;
  title: string;
}

export interface ConversationDragData extends BaseDragData {
  type: 'conversation';
  conversationId: ConversationId;
  url: string;
  isGem?: boolean;
  gemId?: string;
  sourceFolderId?: FolderId;
}

export interface FolderDragData extends BaseDragData {
  type: 'folder';
  folderId: FolderId;
}

export type DragData = ConversationDragData | FolderDragData;

export interface GemConfig {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
}
