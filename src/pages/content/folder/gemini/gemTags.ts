/**
 * Gem chats: once the page shows that a filed chat runs in a Gem, every record
 * of it is marked as one and its link moves from `/app/<id>` to the Gem's path,
 * so the folders show the Gem's icon and open the chat inside the Gem.
 */
import { folderDebug } from '../FolderRepository';
import type { ConversationReference } from '../types';

/** Tags every record whose link holds `hexId` with `gemId`; returns whether any was found. */
export function tagGemConversations(
  folderContents: Record<string, ConversationReference[]>,
  hexId: string,
  gemId: string,
): boolean {
  let updated = false;
  for (const folderId in folderContents) {
    for (const conv of folderContents[folderId]) {
      // Match by hex ID in URL
      if (!conv.url.includes(hexId)) continue;
      const oldUrl = conv.url;
      conv.isGem = true;
      conv.gemId = gemId;
      // Update URL to use /gem/ instead of /app/
      conv.url = conv.url.replace(/\/app\/([^/?]+)/, `/gem/${gemId}/$1`);
      updated = true;
      folderDebug('Updated conversation:', conv.title);
      folderDebug('Old URL:', oldUrl);
      folderDebug('New URL:', conv.url);
      folderDebug('Gem ID:', gemId);
    }
  }
  return updated;
}
