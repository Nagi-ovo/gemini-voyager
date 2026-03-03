/**
 * Types for conversation fork feature
 */

export interface ForkNode {
  /** The user turn where the fork happened */
  turnId: string;
  /** Conversation ID (computed hash) */
  conversationId: string;
  /** Full URL of this conversation */
  conversationUrl: string;
  /** Title of this conversation */
  conversationTitle?: string;
  /** Shared ID linking all forks from the same point */
  forkGroupId: string;
  /** 0-based index within the fork group */
  forkIndex: number;
  /** Timestamp when the fork was created */
  createdAt: number;
}

export interface ForkNodesData {
  /** conversationId -> array of fork nodes in that conversation */
  nodes: Record<string, ForkNode[]>;
  /** forkGroupId -> array of "conversationId:turnId" keys */
  groups: Record<string, string[]>;
}
