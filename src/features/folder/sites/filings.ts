import type { ConversationReference, FolderData } from '@/core/types/folder';
import { ownBucket } from '@/features/folder/model/folderData';

/** A site store's reads by bare conversation id. */
export interface FiledConversations {
  /** Bare ids of every filed conversation, for one pass over the sidebar. */
  filedIds(): Set<string>;
  /** One entry per filed reference, keyed by bucket and stored id, with its bare id. */
  filings(): Map<string, string>;
}

/** Bare ids of every filed conversation in `references`, for one pass over the sidebar. */
export function filedIdsOf(
  references: Iterable<ConversationReference>,
  bareId: (conversationId: string) => string,
): Set<string> {
  const ids = new Set<string>();
  for (const conversation of references) ids.add(bareId(conversation.conversationId));
  return ids;
}

/**
 * One entry per filed reference, keyed by bucket and stored conversation id,
 * with the conversation's bare id. A key that was not here before is a new
 * reference (an add, a move or an import); a reload of the same data keeps
 * every key.
 */
export function filingsOf(
  data: FolderData,
  bareId: (conversationId: string) => string,
): Map<string, string> {
  const filings = new Map<string, string>();
  const contents = data.folderContents;
  for (const bucketId of Object.keys(contents)) {
    for (const conversation of ownBucket(contents, bucketId) ?? []) {
      const key = `${bucketId}\u0000${conversation.conversationId}`;
      filings.set(key, bareId(conversation.conversationId));
    }
  }
  return filings;
}
