export interface Folder {
  id: string;
  name: string;
  parentId: string | null; // null for root-level folders
  isExpanded: boolean;
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
}

export interface FolderData {
  folders: Folder[];
  // Maps folder ID to conversation references in that folder
  folderContents: Record<string, ConversationReference[]>;
}

export interface DragData {
  conversationId: string;
  title: string;
  url: string;
  isGem?: boolean;
  gemId?: string;
}
