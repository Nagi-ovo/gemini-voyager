import { conversationKeys } from './folderConversationIdentity';
import type { ConversationReference } from './types';

/**
 * Index stored folder references by every key `isSameConversation` accepts for
 * them (`conversationKeys`). Looking up a native row's normalized id returns
 * exactly the references that a linear `isSameConversation` scan would match,
 * in folder order.
 *
 * A full native title sync used to run that linear scan once per sidebar row,
 * parsing every stored URL N times per pass (#1040). Build this once per pass.
 */
export function indexConversationsByRouteId(
  folderContents: Record<string, ConversationReference[]>,
): Map<string, ConversationReference[]> {
  const index = new Map<string, ConversationReference[]>();
  for (const folderId in folderContents) {
    for (const conversation of folderContents[folderId]) {
      for (const key of conversationKeys(conversation)) {
        const matches = index.get(key);
        if (matches) matches.push(conversation);
        else index.set(key, [conversation]);
      }
    }
  }
  return index;
}

/** Apply a native title to matching references, skipping user renames. Returns whether any changed. */
export function applyNativeTitle(
  conversations: Iterable<ConversationReference>,
  newTitle: string,
  updatedAt: number,
): boolean {
  const title = newTitle.trim();
  if (!title) return false;

  let updated = false;
  for (const conversation of conversations) {
    if (conversation.customTitle || conversation.title === title) continue;
    conversation.title = title;
    conversation.updatedAt = updatedAt;
    updated = true;
  }
  return updated;
}
