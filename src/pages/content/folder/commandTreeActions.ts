import type { FolderCommands, OrdinaryOpBody } from '@/features/folder/commands/folderCommands';

import type { TreeActions } from './floatingTree/shared';

export type CommandTreeActions = Pick<
  TreeActions,
  | 'onCreateFolder'
  | 'onRenameFolder'
  | 'onDeleteFolder'
  | 'onRemoveConversation'
  | 'onToggleStar'
  | 'onToggleFolderPinned'
  | 'onToggleFolderExpanded'
  | 'onMoveConversation'
  | 'onSetFolderColor'
>;

/**
 * A tree's data callbacks as `FolderCommands` ops. A toggle becomes a `set` with
 * the value opposite to the one the tree showed, read from the same view the
 * tree rendered. A star is the conversation's, so it is set in every folder.
 * Nothing awaits: each store reports changes through its own hook.
 */
export function createCommandTreeActions(commands: FolderCommands): CommandTreeActions {
  const run = (body: OrdinaryOpBody) => void commands.run(body);
  const folder = (folderId: string) => commands.view().folders.find((f) => f.id === folderId);

  return {
    onCreateFolder: (name, parentId) =>
      run({ kind: 'createFolder', folderId: crypto.randomUUID(), name, parentId }),
    onRenameFolder: (folderId, name) => run({ kind: 'renameFolder', folderId, name }),
    onDeleteFolder: (folderId) => run({ kind: 'removeFolder', folderId }),
    onRemoveConversation: (folderId, conversationId) =>
      run({ kind: 'removeConversations', folderId, ids: [conversationId] }),
    onToggleStar: (conversationId, starred) =>
      run({ kind: 'setConversationStarred', conversationId, starred, scope: 'everywhere' }),
    onToggleFolderPinned: (folderId) =>
      run({ kind: 'setFolderPinned', folderId, pinned: !folder(folderId)?.pinned }),
    onToggleFolderExpanded: (folderId) =>
      run({ kind: 'setFolderExpanded', folderId, expanded: !folder(folderId)?.isExpanded }),
    onMoveConversation: (conversationId, from, target) =>
      run({ kind: 'moveConversations', ids: [conversationId], from, target, via: 'panel-menu' }),
    onSetFolderColor: (folderId, color) => run({ kind: 'setFolderColor', folderId, color }),
  };
}
