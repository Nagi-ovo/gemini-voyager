import type { FolderCommands } from '@/features/folder/commands/folderCommands';

import { createCommandTreeActions } from './commandTreeActions';
import type { TreeActions } from './floatingTree/shared';
import type { FolderDialogs } from './folderDialogs';

/**
 * The floating tree's data callbacks, as the same `FolderCommands` ops the
 * sidebar tree will send. Each store call persists through saveData, whose
 * change hook pushes the fresh snapshot back into the panel, so none of these
 * update the panel themselves.
 *
 * Intra-panel conversation moves only: a cross-document drag (native Gemini row
 * → panel) is intentionally not wired, as that path proved unreliable; the user
 * files new conversations via the native ⋮ → "Move to folder" menu instead.
 */
export function createFloatingTreeStoreActions(
  commands: FolderCommands,
  dialogs: Pick<FolderDialogs, 'confirmFolderRemoval' | 'confirmConversationRemoval'>,
): Omit<TreeActions, 'onNavigate'> {
  return {
    ...createCommandTreeActions(commands),
    confirmFolderRemoval: dialogs.confirmFolderRemoval,
    confirmConversationRemoval: dialogs.confirmConversationRemoval,
  };
}
