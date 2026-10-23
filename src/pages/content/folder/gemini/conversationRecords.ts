/**
 * Edits to the records of Gemini's filed chats that touch every folder at
 * once, and how a chat dropped into a folder is first recorded. Each edit
 * returns whether anything changed; the caller saves.
 */
import { readConversationStars } from '@/features/folder/model/conversationStars';
import { setBucket } from '@/features/folder/model/folderData';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';

import { folderDebug } from '../FolderRepository';
import { isSameConversation } from '../folderConversationIdentity';
import { syncConversationTitleFromNative } from '../nativeConversationTitles';
import type { ConversationReference, FolderData } from '../types';

type FolderContents = Record<string, ConversationReference[]>;

export type DroppedConversation = Pick<
  ConversationReference,
  'conversationId' | 'title' | 'isGem' | 'gemId'
> & { url?: string };

/** A dropped chat's title as stored: its own, else the sidebar's, else "Untitled". */
export function droppedTitle(conversationId: string, title: string): string {
  const normalizedTitle = title.trim();
  if (normalizedTitle && normalizedTitle !== 'Untitled') return normalizedTitle;

  return syncConversationTitleFromNative(conversationId) || normalizedTitle || 'Untitled';
}

/** A conversation dropped from outside a folder, before placement assigns its sortIndex. */
export function droppedConversation(
  item: DroppedConversation,
  lastTurnAt: number | undefined,
): ConversationReference {
  return {
    conversationId: item.conversationId,
    title: droppedTitle(item.conversationId, item.title),
    url: item.url ?? '',
    addedAt: Date.now(),
    lastTurnAt,
    isGem: item.isGem,
    gemId: item.gemId,
  };
}

/** A chat filed from Gemini's ⋮ menu or by Folder-as-Project: open now, so just opened. */
export function openedConversation(
  item: Required<Pick<ConversationReference, 'conversationId' | 'title' | 'url'>> &
    Pick<ConversationReference, 'isGem' | 'gemId'>,
  lastTurnAt: number | undefined,
): ConversationReference {
  const now = Date.now();
  const { conversationId, title, url, isGem, gemId } = item;
  // Stored key order, as the folder manager always wrote it.
  return { conversationId, title, url, addedAt: now, lastOpenedAt: now, lastTurnAt, isGem, gemId };
}

/** A star is the conversation's: a new record of a chat starred in another folder keeps it. */
export function withConversationStars(
  data: FolderData,
  records: ConversationReference[],
): ConversationReference[] {
  const starred = readConversationStars(data, FOLDER_SITE_POLICIES.gemini);
  return records.map((record) =>
    !record.starred && starred(record) ? { ...record, starred: true } : record,
  );
}

export function setStarEverywhere(
  folderContents: FolderContents,
  conversationId: string,
  starred: boolean,
): boolean {
  let changed = false;
  Object.values(folderContents).forEach((conversations) => {
    conversations.forEach((conversation) => {
      if (!isSameConversation(conversationId, conversation)) return;
      if (conversation.starred === starred) return;
      conversation.starred = starred;
      changed = true;
    });
  });
  return changed;
}

/** Removes a chat Gemini deleted from every folder. */
export function removeEverywhere(folderContents: FolderContents, conversationId: string): boolean {
  let removed = false;

  for (const folderId in folderContents) {
    const conversations = folderContents[folderId];
    const initialLength = conversations.length;

    // Filter out the deleted conversation
    setBucket(
      folderContents,
      folderId,
      conversations.filter((conv) => !isSameConversation(conversationId, conv)),
    );

    if (folderContents[folderId].length < initialLength) {
      removed = true;
      folderDebug(`Removed deleted conversation ${conversationId} from folder ${folderId}`);
    }
  }
  return removed;
}

export function markOpened(
  folderContents: FolderContents,
  conversationId: string,
  now: number,
): boolean {
  let changed = false;

  for (const folderId in folderContents) {
    folderContents[folderId].forEach((conversation) => {
      if (!isSameConversation(conversationId, conversation)) return;

      // De-duplicate near-simultaneous route/listener updates.
      if (conversation.lastOpenedAt && now - conversation.lastOpenedAt < 1000) return;

      conversation.lastOpenedAt = now;
      conversation.updatedAt = now;
      changed = true;
    });
  }
  return changed;
}
