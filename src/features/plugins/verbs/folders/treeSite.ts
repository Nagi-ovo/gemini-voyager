/**
 * What the core folder table's `tree` says about a site's folder tree: the
 * orders it shows, the heading over root conversations, and the edits it
 * refuses, whose controls the tree then never offers (a refused edit shows no
 * disabled control and no notice: it is simply not there).
 */
import type { FolderEditKind, FolderSiteTree } from '@/features/folder/sites/folderSiteTable';
import type { TreeActions, TreeSiteOptions } from '@/pages/content/folder/floatingTree/shared';

/** The tree options the table decides, laid over a section's own. */
export function treeSiteOf(
  tree: FolderSiteTree,
): Pick<TreeSiteOptions, 'folderOrder' | 'conversationOrder' | 'rootSection' | 'folderDrag'> {
  return {
    ...(tree.folderOrder === 'created' ? { folderOrder: 'created' } : {}),
    ...(tree.conversationOrder === 'stored' ? { conversationOrder: 'stored' } : {}),
    ...(tree.rootSectionLabel ? { rootSection: { labelKey: tree.rootSectionLabel } } : {}),
    folderDrag: !tree.refusedOps.includes('moveFolder'),
  };
}

/** The edit each tree control makes; a control whose edit the site refuses is left out. */
const ACTION_EDITS: Readonly<Partial<Record<keyof TreeActions, FolderEditKind>>> = {
  onCreateFolder: 'createFolder',
  onRenameFolder: 'renameFolder',
  onDeleteFolder: 'removeFolder',
  onRemoveConversation: 'removeConversations',
  onToggleStar: 'setConversationStarred',
  onToggleFolderPinned: 'setFolderPinned',
  onToggleFolderExpanded: 'setFolderExpanded',
  onMoveConversation: 'moveConversations',
  onSetFolderColor: 'setFolderColor',
  onAddCurrentConversation: 'addConversations',
};

/** `actions` without the controls whose edits `tree` refuses. */
export function permittedTreeActions(actions: TreeActions, tree: FolderSiteTree): TreeActions {
  const permitted: TreeActions = { ...actions };
  for (const [action, edit] of Object.entries(ACTION_EDITS) as [
    keyof TreeActions,
    FolderEditKind,
  ][]) {
    if (tree.refusedOps.includes(edit)) delete permitted[action];
  }
  return permitted;
}
