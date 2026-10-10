import { conversationKeys } from './folderConversationIdentity';
import type { ConversationReference, FolderData } from './types';

type ConversationTimestamp = 'lastTurnAt' | 'lastOpenedAt' | 'updatedAt';
type TimestampEdits = Partial<Record<ConversationTimestamp, number>>;
const CONVERSATION_TIMESTAMPS: readonly ConversationTimestamp[] = [
  'lastTurnAt',
  'lastOpenedAt',
  'updatedAt',
];

/**
 * Carry edits still waiting on the save debounce onto freshly loaded data, so a
 * reload neither reverts them nor discards what another context wrote.
 *
 * Debounced edits (`FolderRepository.scheduleSaveData` callers) may only touch
 * the fields merged here: a folder's expanded state and a conversation's
 * monotonic timestamps. `base` is what this context last read or wrote, which
 * tells an edit made here apart from a value another context wrote.
 */
export function mergeDebouncedEdits(fresh: FolderData, local: FolderData, base: FolderData): void {
  const baseExpanded = new Map(base.folders.map((folder) => [folder.id, folder.isExpanded]));
  const localFolders = new Map(local.folders.map((folder) => [folder.id, folder]));
  for (const folder of fresh.folders) {
    const edited = localFolders.get(folder.id);
    const before = baseExpanded.get(folder.id);
    if (!edited || before === undefined || edited.isExpanded === before) continue;
    folder.isExpanded = edited.isExpanded;
    folder.updatedAt = Math.max(folder.updatedAt, edited.updatedAt);
  }

  // Activity belongs to the conversation, not the folder it sits in: another
  // context may have moved or copied it. Fresh membership wins, so a reference
  // removed elsewhere stays removed.
  const edits = timestampEditsByConversation(local, base);
  for (const conversations of Object.values(fresh.folderContents)) {
    for (const conversation of conversations) {
      for (const key of conversationKeys(conversation)) {
        const edited = edits.get(key);
        if (edited) keepLaterTimestamps(conversation, edited);
      }
    }
  }
}

/** Timestamps this context raised since `base`, per conversation key, across every folder. */
function timestampEditsByConversation(
  local: FolderData,
  base: FolderData,
): Map<string, TimestampEdits> {
  const edits = new Map<string, TimestampEdits>();
  for (const [folderId, conversations] of Object.entries(local.folderContents)) {
    const before = new Map(
      (base.folderContents[folderId] ?? []).map((conversation) => [
        conversation.conversationId,
        conversation,
      ]),
    );
    for (const conversation of conversations) {
      const original = before.get(conversation.conversationId);
      if (!original) continue;
      for (const field of CONVERSATION_TIMESTAMPS) {
        const value = conversation[field];
        if (value === undefined || value <= (original[field] ?? 0)) continue;
        for (const key of conversationKeys(conversation)) {
          const edited = edits.get(key) ?? {};
          edited[field] = Math.max(edited[field] ?? 0, value);
          edits.set(key, edited);
        }
      }
    }
  }
  return edits;
}

function keepLaterTimestamps(target: ConversationReference, edited: TimestampEdits): void {
  for (const field of CONVERSATION_TIMESTAMPS) {
    const value = edited[field];
    if (value !== undefined && value > (target[field] ?? 0)) target[field] = value;
  }
}
