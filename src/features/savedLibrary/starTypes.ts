/**
 * Types for starred message history
 */

export interface StarredMessage {
  /** Unique ID of the starred turn */
  turnId: string;
  /** Content preview of the message */
  content: string;
  text?: string;
  /** Conversation ID (computed hash) */
  conversationId: string;
  /** Conversation URL */
  conversationUrl: string;
  /** Conversation title (optional) */
  conversationTitle?: string;
  /** Opaque account context captured when available */
  account?: string;
  /** Timestamp when the message was starred */
  starredAt: number;
}

export interface StarredMessagesData {
  /** Map of conversationId -> array of starred messages */
  messages: Record<string, StarredMessage[]>;
}

export interface StarTombstone {
  conversationId: string;
  turnId: string;
  conversationUrl: string;
  starredAt: number;
  deletedAt: number;
  movedTo?: string;
  account?: string;
}
