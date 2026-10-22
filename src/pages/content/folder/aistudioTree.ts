import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import { AISTUDIO_ROOT_BUCKET_ID } from '@/features/folder/constants';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';
import { newFolderId } from '@/features/folder/sites/aistudioEdits';

import aistudioTokensCss from './aistudioTreeTokens.css?raw';
import { FLOATING_PANEL_CSS as panelCss } from './floatingPanelCss';
import inlineTreeCss from './floatingTree/inlineTree.css?raw';
import {
  FLOATING_PANEL_CLASS,
  type TreeActions,
  type TreeSiteOptions,
} from './floatingTree/shared';
import { mountFolderTree } from './floatingTree/treeController';
import { INLINE_TREE_ATTR } from './floatingTree/treeStyle';
import { attachShadowSurface } from './shadowHost';
import sidebarTokensCss from './sidebarTreeTokens.css?raw';
import type { ConversationReference, FolderData } from './types';

/**
 * The AI Studio sidebar's folder tree: the shared floating-panel tree, placed in
 * the left nav instead of floating.
 *
 * It lives in a shadow root like the floating panel. That reuses the panel's
 * stylesheet without restyling AI Studio's `.gv-folder-*` rules, keeps the
 * page's Material styles out, and the document_start key guard already runs on
 * aistudio.google.com for fields in a shadow surface. Drops from native prompt
 * rows still arrive: drag events cross the shadow boundary, and the tree hands
 * them to `onDrop`.
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

const SITE: TreeSiteOptions = {
  // The folder icon and chevron of the other sidebar trees, and no per-folder count.
  lineIcons: true,
  hideFolderCount: true,
  folderOrder: 'created',
  conversationOrder: 'stored',
  rootSection: { labelKey: 'folder_uncategorized' },
  folderMenuButton: { labelKey: 'folder_settings' },
  folderBodyDrop: true,
  conversationIdentity: FOLDER_SITE_POLICIES.aistudio,
};

/**
 * The shared inline tree sheet in Gemini's sidebar tokens, with AI Studio's
 * denser metrics on top. It follows the panel sheet; the host carries
 * `INLINE_TREE_ATTR`.
 */
export const AISTUDIO_TREE_CSS = `${inlineTreeCss}\n${sidebarTokensCss}\n${aistudioTokensCss}`;

export type AIStudioTree = {
  /** Insert into the sidebar; `destroy` removes it. */
  host: HTMLElement;
  /** New data; waits while a folder name is being typed. */
  update: (data: FolderData) => void;
  /** Another account's data: drops open name forms and the folder menu. */
  reset: (data: FolderData) => void;
  setActiveConversation: (conversationId: string | null) => void;
  /** Opens the name form for a new top-level folder. */
  startCreateFolder: () => void;
  destroy: () => void;
};

export function mountAIStudioTree(options: {
  data: FolderData;
  actions: TreeActions;
  activeConversationId: string | null;
}): AIStudioTree {
  const host = document.createElement('div');
  host.className = AISTUDIO_TREE_HOST_CLASS;
  host.setAttribute(INLINE_TREE_ATTR, '');
  const surface = attachShadowSurface(host, `${panelCss}\n${AISTUDIO_TREE_CSS}`);
  const body = document.createElement('div');
  body.className = `${FLOATING_PANEL_CLASS}__body`;
  surface.root.appendChild(body);

  let activeConversationId = options.activeConversationId;
  const tree = mountFolderTree({
    body,
    boundary: host,
    focusRoot: surface.root,
    data: options.data,
    rootBucketId: AISTUDIO_ROOT_BUCKET_ID,
    conversationSortMode: 'manual',
    actions: options.actions,
    site: { ...SITE, activeConversationId },
    // The nav may transform or clip the tree; the menu must not be.
    popoverLayer: { css: panelCss },
  });

  return {
    host,
    update: (data) => tree.update(data),
    reset: (data) => tree.reset(data),
    setActiveConversation: (conversationId) => {
      if (conversationId === activeConversationId) return;
      activeConversationId = conversationId;
      tree.setSite({ ...SITE, activeConversationId });
    },
    startCreateFolder: () =>
      tree.apply({ inlineEditor: { mode: 'create', parentId: null }, contextMenu: null }),
    destroy: () => {
      tree.destroy();
      surface.disconnect();
      host.remove();
    },
  };
}

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

/** What the tree's controls do to AI Studio's folder data; every edit checks `canEdit`. */
export function aistudioTreeActions(host: AIStudioTreeHost): TreeActions {
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
