/**
 * "New chat in this folder" hands its folder to this tab's Folder-as-Project
 * picker in the page. It used to go through extension storage, which every
 * Gemini tab sees: another tab already on the new-chat page, possibly another
 * account's, took the folder and cleared it before this tab got there. Only the
 * tab that opens the new chat holds the folder now, with the account whose
 * folders it came from, and the picker takes it only for that account, once
 * it found that folder among the ones it can file into.
 */
type Listener = () => void;

let pendingFolderId: string | null = null;
let pendingAccount: string | null = null;
const listeners = new Set<Listener>();

/**
 * Hands `folderId` to this tab's picker, now or when it next shows. `account`:
 * whose folders it came from (`GeminiFolderSession.folderAccount`); null when
 * that was not known, which any account may take.
 */
export function handOffNewChatFolder(folderId: string, account: string | null = null): void {
  pendingFolderId = folderId;
  pendingAccount = account;
  for (const listener of listeners) listener();
}

/** The folder handed off and not taken yet. */
export function pendingNewChatFolder(): string | null {
  return pendingFolderId;
}

/** Whether the handoff may go to `account`'s folders: it came from them, or from no known one. */
export function newChatFolderIsFor(account: string | null): boolean {
  return pendingAccount === null || pendingAccount === account;
}

/** Takes the handoff of `folderId`; false when another handoff replaced it. */
export function takeNewChatFolder(folderId: string): boolean {
  if (pendingFolderId !== folderId) return false;
  pendingFolderId = null;
  pendingAccount = null;
  return true;
}

export function clearNewChatFolder(): void {
  pendingFolderId = null;
  pendingAccount = null;
}

/** Calls `listener` on each handoff; returns its removal. */
export function onNewChatFolder(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
