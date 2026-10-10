import type { ConversationReference, FolderData } from '@/core/types/folder';

import { ownBucket } from './folderData';

/** How a site names one conversation across its records; each `FolderSitePolicy` is one. */
export interface ConversationIdentity {
  /** Every key a stored record answers to. */
  keysOf: (conversation: ConversationReference) => readonly string[];
  /** The key an id is looked up under (`null`: matches nothing). */
  idKey: (id: string) => string | null;
}

/** A record answers to its stored id alone, as on ChatGPT and AI Studio. */
export const EXACT_CONVERSATION_IDENTITY: ConversationIdentity = {
  keysOf: (conversation) => [conversation.conversationId],
  idKey: (id) => id || null,
};

/**
 * Whether a filed conversation shows starred. A star belongs to the
 * conversation, not to one folder's record: a row is starred when any record
 * its id names is starred, the same records `setConversationStarred` with
 * scope `everywhere` writes, so data that stars only some copies shows one
 * star everywhere and one click sets them all.
 */
export function readConversationStars(
  data: FolderData,
  identity: ConversationIdentity,
): (conversation: ConversationReference) => boolean {
  const starredKeys = new Set<string>();
  for (const bucketId of Object.keys(data.folderContents)) {
    for (const record of ownBucket(data.folderContents, bucketId) ?? []) {
      if (record.starred) for (const key of identity.keysOf(record)) starredKeys.add(key);
    }
  }
  // Every key, not the id alone: an imported Gemini record keeps a synthetic id
  // and answers to its chat through the route in its URL.
  return (conversation) =>
    !!conversation.starred || identity.keysOf(conversation).some((key) => starredKeys.has(key));
}
