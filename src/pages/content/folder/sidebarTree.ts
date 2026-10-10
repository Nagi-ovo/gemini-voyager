import { isSaved, type FolderCommands } from '@/features/folder/commands/folderCommands';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import type { ConversationSortMode } from '@/features/folder/model/folderData';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { FolderFeedback } from './FolderFeedback';
import type { FolderNavigation } from './FolderNavigation';
import type { FolderSelection } from './FolderSelection';
import type { FolderStore } from './FolderStore';
import panelCss from './floatingPanel.css?raw';
import { createFloatingTreeStoreActions } from './floatingPanelActions';
import {
  FLOATING_PANEL_CLASS,
  type FolderMenuItem,
  type TreeActions,
  type TreeSiteOptions,
  FOLDER_TOGGLE_DELAY_MS,
} from './floatingTree/shared';
import { mountFolderTree } from './floatingTree/treeController';
import { normalizeConversationId, resolveConversationRouteId } from './folderConversationIdentity';
import type { FolderDialogs } from './folderDialogs';
import { FOLDER_INDENT_PROPERTY } from './folderDisplay';
import { DEFAULT_CONVERSATION_ICON, getGemIcon } from './gemConfig';
import { getCurrentHexIdFromLocation } from './nativeConversationIds';
import { attachShadowSurface } from './shadowHost';
import { type SidebarDropContext, acceptsSidebarDrag, dropOnSidebar } from './sidebarDrops';
import { searchAndSortOptions } from './sidebarFilter';
import type { ConversationReference, Folder } from './types';

export const SIDEBAR_TREE_HOST_CLASS = 'gv-folder-tree-host';
/**
 * The open folder chat's title, kept in the page for readers that cannot see
 * into the tree: the timeline title, the export adapter and the PDF exporter
 * all read `.gv-folder-conversation-selected .gv-conversation-title`.
 */
const ACTIVE_TITLE_MARKER_CLASS = 'gv-folder-conversation-selected gv-folder-active-title-marker';

/**
 * Gemini's sidebar keeps the floating panel's tree, laid into the nav. Host
 * rules are `!important` to beat page rules that match the host, and
 * `:host([data-gv-scheme])` matches the panel's scheme blocks. Text size and
 * row padding follow the folder font-size and spacing settings, which set
 * custom properties on the light-DOM container; those inherit into the tree.
 *
 * Rows look as the sidebar's own folder list did before it moved onto the
 * shared tree: its `--folder-*` colours (set per scheme on the page root, and
 * inherited here), 8px-rounded rows, the gold edge of a starred chat, the green
 * one of the open chat, and nesting drawn as the old list's bordered body: each
 * level 21px in (12px to the guide, 8px past it), and the indent setting adding
 * to the row's own padding. Rows are flat siblings, so a row carries its
 * folders' offset (`--gv-tree-guides`) as a margin.
 */
export const SIDEBAR_TREE_CSS = `
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
  color: var(--gv-sidebar-tree-text) !important;
  border: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  overflow: visible !important;
  font-size: 14px !important;
}

:host {
  --gv-sidebar-tree-text: var(--folder-text, #1f2937);
  --gv-sidebar-tree-icon: var(--folder-icon-color, #6b7280);
  --gv-sidebar-tree-hover: var(--folder-hover-bg, #f3f4f6);
  --gv-sidebar-tree-border: var(--folder-border, #e5e7eb);
  --gv-sidebar-tree-field: var(--folder-bg, #ffffff);
  --gv-sidebar-tree-selected-glow: var(--folder-selected-glow, rgba(16, 185, 129, 0.12));
  --gv-sidebar-tree-selected-accent: var(--folder-selected-accent, #34d399);
  --gv-sidebar-tree-nest: 21px;
}

:host([data-gv-scheme='dark']) {
  --gv-sidebar-tree-text: var(--folder-text, #e5e7eb);
  --gv-sidebar-tree-icon: var(--folder-icon-color, #9ca3af);
  --gv-sidebar-tree-hover: var(--folder-hover-bg, #374151);
  --gv-sidebar-tree-border: var(--folder-border, #374151);
  --gv-sidebar-tree-field: var(--folder-bg, #1f2937);
  --gv-sidebar-tree-selected-glow: var(--folder-selected-glow, rgba(16, 185, 129, 0.1));
  --gv-sidebar-tree-selected-accent: var(--folder-selected-accent, #6ee7b7);
}

.${FLOATING_PANEL_CLASS}__body {
  overflow: visible;
  padding: 0 0 4px;
}

/* The spacing setting's gap, inside the row shell so the virtualizer measures it. */
.${FLOATING_PANEL_CLASS}__tree-row {
  padding-block-end: var(--gv-folder-row-gap, 2px);
}

/* The old list's nesting guide: one border-coloured line 12px into each enclosing folder.
   Specific enough to beat the tree sheet's guides, which the tree adds after this one. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__tree .${FLOATING_PANEL_CLASS}__tree-row[data-guides]::before {
  left: 12px;
  width: calc(var(--gv-tree-guides, 0) * var(--gv-sidebar-tree-nest));
  background-image: repeating-linear-gradient(
    to right,
    var(--gv-sidebar-tree-border) 0 1px,
    transparent 1px var(--gv-sidebar-tree-nest)
  );
}

:host([data-gv-scheme][data-gv-rtl]) .${FLOATING_PANEL_CLASS}__tree .${FLOATING_PANEL_CLASS}__tree-row[data-guides]::before {
  left: auto;
  right: 12px;
  background-image: repeating-linear-gradient(
    to left,
    var(--gv-sidebar-tree-border) 0 1px,
    transparent 1px var(--gv-sidebar-tree-nest)
  );
}

/* Rows: the inline indent of the shared tree gives way to the old list's offsets. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv {
  width: auto;
  min-height: 0;
  margin-inline-start: calc(var(--gv-tree-guides, 0) * var(--gv-sidebar-tree-nest));
  padding-block: var(--gv-folder-row-padding, 5px);
  border-radius: 8px;
  color: var(--gv-sidebar-tree-text);
  transition: background-color 0.2s;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header {
  gap: 8px;
  padding-inline-start: max(
    0px,
    calc(var(--gv-folder-depth, 0) * var(--gv-folder-indent, -8px) + 8px)
  ) !important;
  padding-inline-end: 12px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv {
  position: relative;
  gap: 4px;
  padding-inline-start: max(
    0px,
    calc(var(--gv-tree-guides, 0) * var(--gv-folder-indent, -8px) + 24px)
  ) !important;
  padding-inline-end: 6px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv:hover {
  background: var(--gv-sidebar-tree-hover);
}

/* A starred chat: a faint gold wash and a gold edge. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--starred {
  background: linear-gradient(to right, rgba(251, 191, 36, 0.08) 0%, transparent 100%);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--starred::before,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active::before {
  content: '';
  position: absolute;
  inset-inline-start: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 2px 2px 0;
  background: linear-gradient(to bottom, #fbbf24, #f59e0b);
  opacity: 0.9;
  pointer-events: none;
}

/* The open chat: a green wash and edge, over a star's gold. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active:hover {
  background: linear-gradient(
    to right,
    var(--gv-sidebar-tree-selected-glow) 0%,
    transparent 100%
  );
  color: var(--gv-sidebar-tree-text);
  border-radius: 10px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv--active::before {
  height: 60%;
  background: var(--gv-sidebar-tree-selected-accent);
}

:host([data-gv-rtl]) .${FLOATING_PANEL_CLASS}__conv--starred::before,
:host([data-gv-rtl]) .${FLOATING_PANEL_CLASS}__conv--active::before {
  border-radius: 2px 0 0 2px;
}

.${FLOATING_PANEL_CLASS}__folder-name,
.${FLOATING_PANEL_CLASS}__conv-title {
  font-size: var(--gv-folder-item-font-size, 14px);
  line-height: var(--gv-folder-item-line-height, 20px);
  font-weight: 500;
  color: var(--gv-sidebar-tree-text);
}

.${FLOATING_PANEL_CLASS}__conv-title {
  padding: 0;
}

.${FLOATING_PANEL_CLASS}__folder-name {
  user-select: none;
}

.${FLOATING_PANEL_CLASS}__conv-icon {
  width: 16px;
  height: 16px;
  margin: 3px -2px 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--gv-sidebar-tree-icon);
  font-size: 12px;
  opacity: 1;
}

/* Controls: the old list's 20px chevron and folder icon, 24px buttons with 18px icons. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__caret {
  width: 20px;
  height: 20px;
  min-width: 20px;
  padding: 0;
  border-radius: 4px;
  color: var(--gv-sidebar-tree-icon);
  opacity: 1;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__caret:hover {
  background: transparent;
  color: var(--gv-sidebar-tree-icon);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__caret svg {
  width: 18px;
  height: 18px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-icon {
  width: 20px;
  height: 20px;
  color: var(--gv-sidebar-tree-icon);
  transition: color 0.2s ease;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button {
  width: 24px;
  height: 24px;
  min-width: 24px;
  padding: 0;
  border-radius: 4px;
  color: var(--gv-sidebar-tree-icon);
  transition:
    opacity 0.2s,
    background-color 0.2s,
    color 0.2s;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__tree .${FLOATING_PANEL_CLASS}__icon-button svg {
  width: 18px;
  height: 18px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button {
  opacity: 0;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__icon-button--pin {
  margin-inline-start: auto;
  margin-inline-end: 4px;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header:hover .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header:focus-within .${FLOATING_PANEL_CLASS}__icon-button,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header[data-gv-confirm-anchor] .${FLOATING_PANEL_CLASS}__icon-button {
  opacity: 1;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__icon-button:focus-visible {
  background: var(--gv-sidebar-tree-hover);
  color: var(--gv-sidebar-tree-icon);
}

/* A chat's star and remove buttons: grey until hovered; a set star stays gold. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button {
  border-radius: 6px;
  color: #9ca3af;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star.${FLOATING_PANEL_CLASS}__icon-button--active {
  opacity: 1;
  color: #fbbf24;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star:focus-visible {
  background: rgba(251, 191, 36, 0.12);
  color: #fbbf24;
  transform: scale(1.05);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--star.${FLOATING_PANEL_CLASS}__icon-button--active:hover {
  background: rgba(251, 191, 36, 0.15);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--remove:hover,
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button--remove:focus-visible {
  background: rgba(239, 68, 68, 0.12);
  color: #ef4444;
  transform: scale(1.05);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button svg {
  transition: transform 0.2s;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__conv .${FLOATING_PANEL_CLASS}__icon-button:active svg {
  transform: scale(0.9);
}

/* A new subfolder's name field, where the subfolder's row will be. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__tree-row > .${FLOATING_PANEL_CLASS}__inline-form:not(.${FLOATING_PANEL_CLASS}__inline-form--root) {
  width: auto;
  margin-inline-start: calc(var(--gv-tree-guides, 0) * var(--gv-sidebar-tree-nest));
  padding-inline-start: max(
    0px,
    calc(var(--gv-tree-guides, 0) * var(--gv-folder-indent, -8px) + 8px)
  ) !important;
}

/* Name fields: the old inline rename, a bordered field with 24px save and cancel. */
:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__folder-header .${FLOATING_PANEL_CLASS}__inline-form {
  min-height: 0;
  gap: 4px;
  padding: 0;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-input {
  height: auto;
  padding: 6px 8px;
  border: 1px solid var(--gv-sidebar-tree-border);
  border-radius: 4px;
  background: var(--gv-sidebar-tree-field);
  color: var(--gv-sidebar-tree-text);
  font-size: 14px;
  line-height: normal;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-input:focus {
  background: var(--gv-sidebar-tree-field);
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button {
  opacity: 1;
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button--save:hover {
  color: #10b981;
  background: rgba(16, 185, 129, 0.1);
}

:host([data-gv-scheme]) .${FLOATING_PANEL_CLASS}__inline-form .${FLOATING_PANEL_CLASS}__icon-button--cancel:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.1);
}

.${FLOATING_PANEL_CLASS}__empty {
  padding: 8px 12px;
}

.${FLOATING_PANEL_CLASS}__empty-icon {
  display: none;
}
`;

/** What the sidebar shows right now, read on every render. */
export type SidebarTreeView = {
  sortMode: ConversationSortMode;
  searching: boolean;
  filter: TreeSiteOptions['filter'];
  projectEnabled: boolean;
  /**
   * The folder tree indent setting (GV_FOLDER_TREE_INDENT, -8 to 32): added to
   * each nesting level's row padding, as in the old list.
   */
  indent: number;
};

export type SidebarTreeOptions = {
  store: FolderStore;
  commands: FolderCommands;
  navigation: FolderNavigation;
  selection: FolderSelection;
  dialogs: FolderDialogs;
  feedback: FolderFeedback;
  drops: SidebarDropContext;
  view: () => SidebarTreeView;
  onRenameNative: (conversation: ConversationReference) => Promise<boolean>;
};

export type SidebarTree = {
  /** Insert into the panel; `destroy` removes it. */
  host: HTMLElement;
  /** Shows the store's data and the current view; waits while a folder name is typed. */
  render: () => void;
  /** Another account's data: drops open name forms and the folder menu. */
  reset: () => void;
  /** Marks rows again (open chat, selection, indent, language) without new data. */
  refreshSite: () => void;
  /** Opens the name form for a new top-level folder. */
  startCreateFolder: () => void;
  destroy: () => void;
};

/** The folder a stored conversation record lives in, found by identity. */
function bucketOf(store: FolderStore, conversation: ConversationReference): string | null {
  for (const [bucketId, list] of Object.entries(store.data.folderContents)) {
    if (list.includes(conversation)) return bucketId;
  }
  return null;
}

function projectMenuItems(options: SidebarTreeOptions, folder: Folder): FolderMenuItem[] {
  const { store, dialogs, feedback, navigation } = options;
  if (!options.view().projectEnabled) return [];
  return [
    {
      labelKey: 'folder_new_chat_in_folder',
      run: () => navigation.createNewChatInFolder(folder.id),
    },
    {
      labelKey: folder.instructions
        ? 'folderAsProject_editInstructions'
        : 'folderAsProject_setInstructions',
      run: () =>
        dialogs.openInstructions(folder.instructions, async (instructions) => {
          const activation = store.activation;
          const saved = isSaved(
            await options.commands.run({
              kind: 'setFolderInstructions',
              folderId: folder.id,
              instructions: instructions ?? null,
            }),
          );
          if (!saved && activation === store.activation) {
            feedback.showNotification(t('folder_save_error'), 'error');
          }
          return saved;
        }),
    },
  ];
}

function createActions(options: SidebarTreeOptions): TreeActions {
  const { store, dialogs, navigation, selection, drops, onRenameNative } = options;
  // The row clicked last, for a record replaced in storage since the tree drew it.
  let clicked: { conversation: ConversationReference; bucketId: string } | null = null;
  const selecting = selection.treeActions();
  return {
    ...createFloatingTreeStoreActions(options.commands, dialogs),
    // Opens the folder's latest stored record, so the route uses current data.
    onNavigate: (conversation) => {
      const bucketId =
        bucketOf(store, conversation) ??
        (clicked?.conversation === conversation ? clicked.bucketId : null);
      clicked = null;
      const latest = bucketId
        ? store.data.folderContents[bucketId]?.find(
            (item) => item.conversationId === conversation.conversationId,
          )
        : undefined;
      navigation.navigate(latest ?? conversation, bucketId ?? undefined);
    },
    onDrop: (e, folderId, placement) => dropOnSidebar(drops, e, folderId, placement),
    acceptsDrag: acceptsSidebarDrag,
    onRenameConversation: (conversation) => void onRenameNative(conversation),
    onConversationMenu: (e, conversation) =>
      dialogs.openMenu(
        e,
        [{ label: t('folder_rename'), action: () => void onRenameNative(conversation) }],
        'conversation',
      ),
    folderMenuItems: (folder) => projectMenuItems(options, folder),
    ...selecting,
    interceptConversationClick: (e, conversation, bucketId, row) => {
      clicked = { conversation, bucketId };
      return selecting.interceptConversationClick(e, conversation, bucketId, row);
    },
  };
}

/**
 * The folder row of the open conversation: the one it was opened from, or
 * every row of it when it was opened elsewhere. Matches legacy ids by route.
 */
function activeConversation(options: SidebarTreeOptions) {
  const { store, navigation } = options;
  const currentId = normalizeConversationId(getCurrentHexIdFromLocation());
  const matches = (conversation: ConversationReference) =>
    !!currentId &&
    resolveConversationRouteId(
      navigation.getConversationHref(conversation),
      conversation.conversationId,
    ) === currentId;
  let first: ConversationReference | null = null;
  let opened: { bucketId: string; conversation: ConversationReference } | null = null;
  if (currentId) {
    for (const [bucketId, list] of Object.entries(store.data.folderContents)) {
      for (const conversation of list) {
        if (!matches(conversation)) continue;
        first ??= conversation;
        if (navigation.isActiveInstance(bucketId, conversation.conversationId)) {
          opened ??= { bucketId, conversation };
        }
      }
    }
  }
  return {
    title: (opened?.conversation ?? first)?.title ?? null,
    isActive: (conversation: ConversationReference, bucketId: string) =>
      matches(conversation) && (!opened || opened.bucketId === bucketId),
  };
}

function siteOptions(options: SidebarTreeOptions, view: SidebarTreeView): TreeSiteOptions {
  const { navigation, selection } = options;
  return {
    folderMenuButton: { labelKey: 'folder_settings' },
    folderBodyDrop: true,
    folderDrag: true,
    ...searchAndSortOptions(view.searching, view.sortMode),
    filter: view.filter,
    isActiveConversation: activeConversation(options).isActive,
    isConversationSelected: (conversation, bucketId) =>
      selection.isFolderConversationSelected(conversation.conversationId, bucketId),
    conversationHref: (conversation) => navigation.getConversationHref(conversation),
    conversationIcon: (conversation) =>
      conversation.isGem && conversation.gemId
        ? getGemIcon(conversation.gemId)
        : DEFAULT_CONVERSATION_ICON,
    folderToggleDelayMs: FOLDER_TOGGLE_DELAY_MS,
    // The sidebar's own folder row: SVG controls, a pin and menu on hover, and
    // no count or add-subfolder button (the menu has it).
    lineIcons: true,
    folderPinButton: true,
    hideFolderCount: true,
    hideAddSubfolderButton: true,
    renameFillsRow: true,
    conversationIdentity: FOLDER_SITE_POLICIES.gemini,
  };
}

export function mountSidebarTree(options: SidebarTreeOptions): SidebarTree {
  const { store } = options;
  const host = document.createElement('div');
  host.className = SIDEBAR_TREE_HOST_CLASS;
  const surface = attachShadowSurface(host, `${panelCss}\n${SIDEBAR_TREE_CSS}`);
  const body = document.createElement('div');
  body.className = `${FLOATING_PANEL_CLASS}__body`;
  surface.root.appendChild(body);

  const marker = document.createElement('span');
  marker.className = ACTIVE_TITLE_MARKER_CLASS;
  marker.hidden = true;
  marker.style.display = 'none';
  const markerTitle = marker.appendChild(document.createElement('span'));
  markerTitle.className = 'gv-conversation-title';

  let view = options.view();
  const tree = mountFolderTree({
    body,
    boundary: host,
    focusRoot: surface.root,
    data: store.data,
    rootBucketId: ROOT_CONVERSATIONS_ID,
    conversationSortMode: view.sortMode,
    actions: createActions(options),
    site: siteOptions(options, view),
    popoverLayer: { css: panelCss },
  });

  const show = () => {
    view = options.view();
    host.style.setProperty(FOLDER_INDENT_PROPERTY, `${view.indent}px`);
    if (!marker.isConnected && host.isConnected) host.after(marker);
    markerTitle.textContent = activeConversation(options).title ?? '';
    tree.setSite(siteOptions(options, view));
  };

  return {
    host,
    render: () => {
      show();
      tree.update(store.data, view.sortMode);
    },
    reset: () => {
      show();
      tree.reset(store.data, view.sortMode);
    },
    refreshSite: show,
    startCreateFolder: () => {
      // A second "+" returns to the open name field instead of opening another.
      const open = surface.root.querySelector<HTMLInputElement>(
        `.${FLOATING_PANEL_CLASS}__inline-form--root input`,
      );
      if (open) {
        open.focus();
        return;
      }
      tree.apply({ inlineEditor: { mode: 'create', parentId: null }, contextMenu: null });
    },
    destroy: () => {
      tree.destroy();
      surface.disconnect();
      host.remove();
      marker.remove();
    },
  };
}
