import { normalizeText } from '@/core/utils/text';
import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import { AISTUDIO_ROOT_BUCKET_ID } from '@/features/folder/constants';
import { ownBucket, removeFolder, setBucket } from '@/features/folder/model/folderData';
import { placeConversations } from '@/features/folder/model/placeConversations';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';

import panelCss from './floatingPanel.css?raw';
import {
  FLOATING_PANEL_CLASS,
  type TreeActions,
  type TreeSiteOptions,
} from './floatingTree/shared';
import { mountFolderTree } from './floatingTree/treeController';
import { attachShadowSurface } from './shadowHost';
import type { ConversationReference, DragData, Folder, FolderData } from './types';

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
  folderOrder: 'created',
  conversationOrder: 'stored',
  rootSection: { labelKey: 'folder_uncategorized' },
  folderMenuButton: { labelKey: 'folder_settings' },
  folderBodyDrop: true,
  conversationIdentity: FOLDER_SITE_POLICIES.aistudio,
};

/**
 * Turns the floating panel into a block in the nav. Host rules must be
 * `!important` to beat page rules that match the host; this sheet comes after
 * the panel's, and `:host([data-gv-scheme])` matches the specificity of the
 * panel's scheme blocks, so these win over both.
 */
export const AISTUDIO_TREE_CSS = `
:host,
:host([data-gv-scheme]) {
  position: relative !important;
  z-index: auto !important;
  display: block !important;
  min-width: 0 !important;
  min-height: 0 !important;
  max-width: none !important;
  max-height: none !important;
  resize: none !important;
  background: transparent !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
  font-size: 13px !important;
}

.${FLOATING_PANEL_CLASS}__body {
  overflow: visible;
  padding: 0 0 4px;
}

/* AI Studio's nav is denser than Gemini's: names keep its 12px. */
.${FLOATING_PANEL_CLASS}__folder-name,
.${FLOATING_PANEL_CLASS}__conv-title {
  font-size: 12px;
}

.${FLOATING_PANEL_CLASS}__empty {
  padding: 8px 12px;
}

.${FLOATING_PANEL_CLASS}__empty-icon {
  display: none;
}
`;

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

// Edits the tree asks for, applied to the live folder data in place as the
// manager saves it. Each returns whether anything changed.

/** An id for a new AI Studio folder, in the format AI Studio has always stored. */
export function newFolderId(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

export function addFolder(
  data: FolderData,
  folder: { id: string; name: string; parentId: string | null; at: number },
): boolean {
  if (folder.parentId && !data.folders.some((candidate) => candidate.id === folder.parentId)) {
    return false;
  }
  data.folders.push({
    id: folder.id,
    name: folder.name,
    parentId: folder.parentId,
    isExpanded: true,
    createdAt: folder.at,
    updatedAt: folder.at,
  });
  setBucket(data.folderContents, folder.id, []);
  return true;
}

function findFolder(data: FolderData, folderId: string): Folder | undefined {
  return data.folders.find((folder) => folder.id === folderId);
}

export function renameFolder(data: FolderData, folderId: string, name: string, at: number) {
  const folder = findFolder(data, folderId);
  if (!folder || folder.name === name) return false;
  folder.name = name;
  folder.updatedAt = at;
  return true;
}

/** Removes a folder, the folders the tree shows inside it, and what they hold. */
export function deleteFolder(data: FolderData, folderId: string): boolean {
  const next = removeFolder(data, folderId);
  if (next === data) return false;
  data.folders = next.folders;
  data.folderContents = next.folderContents;
  return true;
}

export function toggleFolderPinned(data: FolderData, folderId: string): boolean {
  const folder = findFolder(data, folderId);
  if (!folder) return false;
  folder.pinned = !folder.pinned;
  return true;
}

export function toggleFolderExpanded(data: FolderData, folderId: string): boolean {
  const folder = findFolder(data, folderId);
  if (!folder) return false;
  folder.isExpanded = !folder.isExpanded;
  return true;
}

export function removeConversation(
  data: FolderData,
  folderId: string,
  conversationId: string,
): boolean {
  const bucket = ownBucket(data.folderContents, folderId);
  if (!bucket?.some((conversation) => conversation.conversationId === conversationId)) {
    return false;
  }
  setBucket(
    data.folderContents,
    folderId,
    bucket.filter((conversation) => conversation.conversationId !== conversationId),
  );
  return true;
}

/**
 * Places a dropped prompt in one bucket (`null`: Uncategorized) and takes it out
 * of every other: an AI Studio prompt lives in one place. A stored prompt moves
 * with its whole record (rename, open time and all), preferring the dragged
 * copy because legacy data can hold differing copies; the drag payload builds a
 * record only for a prompt no bucket holds yet. No `sortIndex` is added: AI
 * Studio shows buckets in stored order.
 */
export function placePrompt(
  data: FolderData,
  prompt: DragData & { conversationId: string },
  targetFolderId: string | null,
  created: { untitledTitle: string; at: number },
): FolderData {
  const { conversationId } = prompt;
  const held = (list: ConversationReference[] | undefined) =>
    list?.find((conversation) => conversation.conversationId === conversationId);
  const stored =
    held(ownBucket(data.folderContents, prompt.sourceFolderId)) ??
    held(Object.values(data.folderContents).flat());
  const record: ConversationReference = stored ?? {
    conversationId,
    title: normalizeText(prompt.title) || created.untitledTitle,
    url: prompt.url || '',
    addedAt: created.at,
  };
  return placeConversations(data, [record], {
    target: targetFolderId || AISTUDIO_ROOT_BUCKET_ID,
    placement: 'keep',
    removeFrom: 'everywhere',
    removeWhenPresent: true,
  }).data;
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
