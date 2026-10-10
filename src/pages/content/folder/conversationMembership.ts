import type { ConversationReference } from '@/core/types/folder';

type FolderContents = Record<string, readonly ConversationReference[]>;

/** Runs of URL-token characters long enough to contain a matchable id. */
const LONG_URL_TOKEN = /[\w-]{9,}/g;
const URL_TOKEN = /^[\w-]+$/;

export interface ConversationMembership {
  /** Whether any folder holds this conversation, by id or by its URL. */
  has(conversationId: string): boolean;
}

/**
 * Index every folder's conversations once so membership checks are O(1)
 * instead of a scan over all stored conversations per sidebar row. Matches the
 * original rules exactly: a direct id match, an id match ignoring the `c_`
 * prefix, or a stored URL containing an id longer than 8 characters.
 */
export function buildConversationMembership(
  folderContents: FolderContents,
): ConversationMembership {
  const ids = new Set<string>();
  const unprefixedIds = new Set<string>();
  const urls: string[] = [];
  for (const folderId in folderContents) {
    for (const conversation of folderContents[folderId]) {
      if (typeof conversation.conversationId === 'string') {
        ids.add(conversation.conversationId);
        unprefixedIds.add(conversation.conversationId.replace(/^c_/, ''));
      }
      if (typeof conversation.url === 'string') urls.push(conversation.url);
    }
  }
  // An id made of URL-token characters can only occur inside one maximal run
  // of those characters, and the rule needs more than 8 of them. Such a run
  // either equals the id or is longer than it, so only longer runs need a
  // substring scan; stored ids are usually all the same length, leaving none.
  // Any other id falls back to scanning each URL.
  const urlTokens = urls.flatMap((url) => url.match(LONG_URL_TOKEN) ?? []);
  const tokenSet = new Set(urlTokens);
  const tokensLongerThan = new Map<number, string>();
  const joinedTokensLongerThan = (length: number): string => {
    let joined = tokensLongerThan.get(length);
    if (joined === undefined) {
      joined = urlTokens.filter((token) => token.length > length).join('\n');
      tokensLongerThan.set(length, joined);
    }
    return joined;
  };

  return {
    has(conversationId) {
      if (ids.has(conversationId)) return true;
      const unprefixed = conversationId.replace(/^c_/, '');
      if (!unprefixed) return false;
      if (unprefixedIds.has(unprefixed)) return true;
      if (unprefixed.length <= 8) return false;
      if (!URL_TOKEN.test(unprefixed)) return urls.some((url) => url.includes(unprefixed));
      if (tokenSet.has(unprefixed)) return true;
      return joinedTokensLongerThan(unprefixed.length).includes(unprefixed);
    },
  };
}

/**
 * Reuse one index while folder contents keep the same shape within the
 * current task. Folder data is edited in place, so the cache is also checked
 * against every folder's array identity and length and dropped at the next
 * microtask; a batch of sidebar rows then builds the index once.
 *
 * That check walks every bucket, so a pass over native rows passes one
 * `revision` token for the whole pass, during which no folder edit may run:
 * after the first row, lookups with that token and the same `folderContents`
 * reuse the index without checking the shape again.
 */
export function createConversationMembershipLookup(): (
  folderContents: FolderContents,
  revision?: object,
) => ConversationMembership {
  let cached: {
    folderContents: FolderContents;
    shape: Array<readonly [string, readonly ConversationReference[], number]>;
    membership: ConversationMembership;
    revision?: object;
  } | null = null;

  const sameShape = (folderContents: FolderContents): boolean => {
    if (!cached || cached.folderContents !== folderContents) return false;
    let index = 0;
    for (const folderId in folderContents) {
      const entry = cached.shape[index++];
      const conversations = folderContents[folderId];
      if (!entry || entry[0] !== folderId || entry[1] !== conversations) return false;
      if (entry[2] !== conversations.length) return false;
    }
    return index === cached.shape.length;
  };

  return (folderContents, revision) => {
    if (
      revision !== undefined &&
      cached?.revision === revision &&
      cached.folderContents === folderContents
    ) {
      return cached.membership;
    }
    if (cached && sameShape(folderContents)) {
      if (revision !== undefined) cached.revision = revision;
      return cached.membership;
    }
    const membership = buildConversationMembership(folderContents);
    const shape: Array<readonly [string, readonly ConversationReference[], number]> = [];
    for (const folderId in folderContents) {
      const conversations = folderContents[folderId];
      shape.push([folderId, conversations, conversations.length]);
    }
    cached = { folderContents, shape, membership, revision };
    queueMicrotask(() => {
      if (cached?.membership === membership) cached = null;
    });
    return membership;
  };
}
