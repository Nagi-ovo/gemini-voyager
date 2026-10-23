/**
 * Renaming a filed chat from its folder row opens Gemini's own rename on the
 * chat's sidebar row: the row's ⋮ menu, then its Rename item. The folders then
 * drop their own title for the native one, so Gemini's rename becomes the title.
 */
import type { FolderCommands } from '@/features/folder/commands/folderCommands';

import type { NativeConversationMenus } from '../NativeConversationMenus';
import { resolveConversationRouteId } from '../folderConversationIdentity';
import { folderDebugWarn } from '../folderManagerDebug';
import type { NativeArchivedRows } from '../nativeArchivedRows';
import { extractNativeConversationTitle } from '../nativeConversationTitles';
import { findNativeConversationElement } from '../nativeSidebarDom';
import type { ConversationReference } from '../types';

export interface NativeRenameDeps {
  sidebar: HTMLElement | null;
  /** Shows a row hidden as filed while its menu is open. */
  archivedRows: Pick<NativeArchivedRows, 'reveal'>;
  menus: Pick<
    NativeConversationMenus,
    'findAndClickMoreButton' | 'waitForRenameButtonAndClick' | 'resetNativeConversationMenuTrigger'
  >;
  commands: FolderCommands;
}

/** Resolves whether Gemini's rename opened. */
export async function openNativeRename(
  conversation: ConversationReference,
  { sidebar, archivedRows, menus, commands }: NativeRenameDeps,
): Promise<boolean> {
  const conversationId = resolveConversationRouteId(conversation.url, conversation.conversationId);
  if (!conversationId) return false;

  const conversationEl = findNativeConversationElement(sidebar, conversationId);
  if (!conversationEl) {
    folderDebugWarn('Could not find native conversation element for rename:', conversationId);
    return false;
  }

  const restoreArchivedVisibility = archivedRows.reveal(conversationEl);
  const nativeTitle = extractNativeConversationTitle(conversationEl);
  let moreButton: HTMLElement | null = null;

  try {
    moreButton = await menus.findAndClickMoreButton(conversationEl);
    if (!moreButton) {
      folderDebugWarn('Could not find native more button for rename:', conversationId);
      return false;
    }

    const renamed = await menus.waitForRenameButtonAndClick();
    if (!renamed) {
      folderDebugWarn('Could not find native rename button:', conversationId);
    } else {
      await commands.run({ kind: 'restoreNativeTitle', conversationId, nativeTitle });
    }
    return renamed;
  } finally {
    if (moreButton) menus.resetNativeConversationMenuTrigger(moreButton);
    restoreArchivedVisibility();
  }
}
