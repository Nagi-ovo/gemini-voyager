import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';
import { newFolderId } from '@/features/folder/sites/aistudioEdits';
import { FOLDER_SITE_TABLE } from '@/features/folder/sites/folderSiteTable';
import aistudioTokensCss from '@/pages/content/folder/aistudioTreeTokens.css?raw';
import inlineTreeCss from '@/pages/content/folder/floatingTree/inlineTree.css?raw';
import type { TreeActions, TreeSiteOptions } from '@/pages/content/folder/floatingTree/shared';
import sidebarTokensCss from '@/pages/content/folder/sidebarTreeTokens.css?raw';
import type { ConversationReference, FolderData } from '@/pages/content/folder/types';

import { permittedTreeActions, treeSiteOf } from '../treeSite';

const AISTUDIO_TREE = FOLDER_SITE_TABLE.aistudio.tree;

/**
 * The AI Studio nav's folder tree: the shared floating-panel tree in the folder
 * section's panel mode (`panelSection.ts`). Its shadow root also keeps AI
 * Studio's `.gv-folder-*` rules off it, and the document_start key guard
 * already runs on aistudio.google.com for fields in a shadow surface.
 */
export const AISTUDIO_TREE_HOST_CLASS = 'gv-aistudio-folder-tree';

/** Drag types an AI Studio prompt can carry: Voyager JSON, or the prompt's link. */
export const AISTUDIO_PROMPT_DRAG_TYPES: readonly string[] = [
  'application/json',
  'text/plain',
  'text/uri-list',
  'text/x-moz-url',
  'URL',
];

/**
 * How AI Studio draws the tree: the folder icon and chevron of the other sidebar
 * trees, no per-folder count, a menu button on each folder, and drops on a
 * folder's whole block. The orders, the Uncategorized heading and which
 * controls exist come from the core folder table (`treeSiteOf`).
 */
export const AISTUDIO_TREE_SITE: TreeSiteOptions = {
  lineIcons: true,
  hideFolderCount: true,
  folderMenuButton: { labelKey: 'folder_settings' },
  folderBodyDrop: true,
  conversationIdentity: FOLDER_SITE_POLICIES.aistudio,
  ...treeSiteOf(AISTUDIO_TREE),
};

/**
 * The shared inline tree sheet in Gemini's sidebar tokens, with AI Studio's
 * denser metrics on top. It follows the panel sheet; the host carries
 * `INLINE_TREE_ATTR`.
 */
export const AISTUDIO_TREE_CSS = `${inlineTreeCss}\n${sidebarTokensCss}\n${aistudioTokensCss}`;

export type AIStudioTreeHost = {
  canEdit: () => boolean;
  data: () => FolderData;
  commands: FolderCommands;
  /** Saves a staged drop, then re-renders. */
  commit: () => void;
  onNavigate: (conversation: ConversationReference) => void;
  /** Moves a dropped prompt into `folderId`; false when the drop carries none. */
  placeDrop: (event: DragEvent, folderId: string | null) => boolean;
  confirmFolderRemoval: NonNullable<TreeActions['confirmFolderRemoval']>;
  confirmConversationRemoval: NonNullable<TreeActions['confirmConversationRemoval']>;
};

/**
 * What the tree's controls do to AI Studio's folder data; every edit checks
 * `canEdit`, and a control whose edit AI Studio refuses is left out.
 */
export function aistudioTreeActions(host: AIStudioTreeHost): TreeActions {
  return permittedTreeActions(allTreeActions(host), AISTUDIO_TREE);
}

function allTreeActions(host: AIStudioTreeHost): TreeActions {
  const run = (body: Parameters<FolderCommands['run']>[0]) => void host.commands.run(body);
  const folder = (id: string) => host.data().folders.find((item) => item.id === id);
  return {
    onNavigate: host.onNavigate,
    onCreateFolder: (name, parentId) => {
      if (host.canEdit()) run({ kind: 'createFolder', folderId: newFolderId(), name, parentId });
    },
    onRenameFolder: (folderId, name) => run({ kind: 'renameFolder', folderId, name }),
    onDeleteFolder: (folderId) => run({ kind: 'removeFolder', folderId }),
    onRemoveConversation: (folderId, conversationId) =>
      run({ kind: 'removeConversations', folderId, ids: [conversationId] }),
    confirmFolderRemoval: host.confirmFolderRemoval,
    confirmConversationRemoval: host.confirmConversationRemoval,
    onToggleStar: (conversationId, starred) =>
      run({ kind: 'setConversationStarred', conversationId, starred, scope: 'everywhere' }),
    onToggleFolderPinned: (folderId) =>
      run({ kind: 'setFolderPinned', folderId, pinned: !folder(folderId)?.pinned }),
    onToggleFolderExpanded: (folderId) =>
      run({ kind: 'setFolderExpanded', folderId, expanded: !folder(folderId)?.isExpanded }),
    onDrop: (event, folderId) => {
      if (!host.canEdit() || !host.placeDrop(event, folderId)) return false;
      host.commit();
      return true;
    },
    acceptsDrag: (types) => AISTUDIO_PROMPT_DRAG_TYPES.some((type) => types.includes(type)),
  };
}
