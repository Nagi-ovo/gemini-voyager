export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null for root-level folders
  isExpanded: boolean;
  pinned?: boolean; // Whether folder is pinned to the top
  color?: string; // Optional folder color identifier
  createdAt: number;
  updatedAt: number;
}

export interface ConversationReference {
  conversationId: string; // The unique ID of the conversation
  title: string; // The conversation title
  url: string; // The conversation URL
  addedAt: number; // When it was added to the folder
  lastOpenedAt?: number; // Timestamp when the conversation was last opened
  updatedAt?: number; // Timestamp when the reference was last updated (e.g., renamed)
  isGem?: boolean; // Whether this is a Gem conversation
  gemId?: string; // Gem identifier if applicable
  starred?: boolean; // Whether this conversation is starred in the folder
  customTitle?: boolean; // Whether title was manually renamed in folder (don't auto-sync from native)
}

export interface FolderData {
  folders: Folder[];
  // Maps folder ID to conversation references in that folder
  folderContents: Record<string, ConversationReference[]>;
}

export interface DragData {
  type?: 'conversation' | 'folder'; // Type of dragged item
  conversationId?: string;
  folderId?: string; // For folder dragging
  title: string;
  url?: string;
  isGem?: boolean;
  gemId?: string;
  conversations?: ConversationReference[]; // For multi-select dragging
  sourceFolderId?: string; // Track where conversations are being dragged from
}
