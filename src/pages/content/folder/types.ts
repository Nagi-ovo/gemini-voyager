export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null for root-level folders
  isExpanded: boolean;
  pinned?: boolean; // Whether folder is pinned to the top
  createdAt: number;
  updatedAt: number;
}

export interface ConversationReference {
  conversationId: string; // The unique ID of the conversation
  title: string; // The conversation title
  url: string; // The conversation URL
  addedAt: number; // When it was added to the folder
  isGem?: boolean; // Whether this is a Gem conversation
  gemId?: string; // Gem identifier if applicable
  starred?: boolean; // Whether this conversation is starred in the folder
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
