import { MAX_FOLDER_DEPTH } from '@/features/folder/constants';
import type { ConversationIdentity } from '@/features/folder/model/conversationStars';
import {
  type ConversationSortMode,
  sortFoldersByCreation,
} from '@/features/folder/model/folderData';
import { type FolderLayout, buildFolderIndex } from '@/features/folder/model/folderIndex';
import { getTranslationSyncUnsafe } from '@/utils/i18n';

import { readDragPayload } from '../dragPayload';
import type { ConversationReference, Folder, FolderData } from '../types';
import type { TreeProjection } from './projection';

export const FLOATING_PANEL_CLASS = 'gv-floating-folder-panel';
export const MAX_FOLDER_NAME_LENGTH = 50;
/** A double-click on a folder renames it; its first click waits this long before toggling. */
export const FOLDER_TOGGLE_DELAY_MS = 220;

/** `gv-floating-folder-panel__<part>` */
export function cls(part: string): string {
  return `${FLOATING_PANEL_CLASS}__${part}`;
}

export const MENU_SELECTOR = `.${cls('context-menu')}`;

/**
 * Marks a control outside the tree that reopens the name editor (a site's "+"):
 * pressing it leaves an open editor and its draft in place for the control to refocus.
 */
export const KEEPS_INLINE_FORM_ATTR = 'data-gv-keeps-inline-form';

export function t(key: string): string {
  return getTranslationSyncUnsafe(key);
}

export type InlineEditorState =
  | { mode: 'create'; parentId: string | null }
  | { mode: 'rename'; folderId: string };

type MenuPlacement = {
  x: number;
  y: number;
  /**
   * The size of the control the menu opened from, whose bottom-start corner is
   * `x`, `y`. The menu aligns to it and flips above it. A pointer opens at a point.
   */
  anchor?: { width: number; height: number };
  /** Opened from the keyboard: the menu takes focus and returns it on close. */
  fromKeyboard?: boolean;
};

export type FolderMenuState = MenuPlacement & { folderId: string };

/** A filed conversation's menu, which offers `onRenameConversation`. */
export type ConversationMenuState = MenuPlacement & { conversation: ConversationReference };

export type ContextMenuState = FolderMenuState | ConversationMenuState;

export function isFolderMenu(menu: ContextMenuState): menu is FolderMenuState {
  return 'folderId' in menu;
}

/** The drag type a folder row adds to its payload, so targets can tell a folder drag at dragover. */
export const FOLDER_DRAG_TYPE = 'application/x-gv-folder';

/**
 * Where a drop lands beside a row, for a site that reorders by position. A
 * drop in the middle of a folder header has none: it files into the folder.
 */
export type DropPlacement =
  | { kind: 'folder'; folderId: string; position: 'before' | 'after' }
  | {
      kind: 'conversation';
      bucketId: string;
      conversationId: string;
      position: 'before' | 'after';
    };

/** An entry a site adds to the folder menu, above Delete. */
export type FolderMenuItem = { labelKey: string; run: () => void };

/** What a site's filter shows; everything else is left out of the projection. */
export type TreeFilter = {
  folder: (folder: Folder) => boolean;
  conversation: (conv: ConversationReference, bucketId: string) => boolean;
};

/** Data callbacks the tree raises; the host decides how each one is stored. */
export type TreeActions = {
  onNavigate?: (conv: ConversationReference) => void;
  onCreateFolder?: (name: string, parentId: string | null) => void;
  onRenameFolder?: (folderId: string, newName: string) => void;
  onDeleteFolder?: (folderId: string) => void;
  /**
   * Asks beside `anchor`, the folder's row, before `onDeleteFolder`; the folder
   * menu offers Delete only when set.
   */
  confirmFolderRemoval?: (anchor: HTMLElement, onConfirm: () => void) => void;
  onRemoveConversation?: (folderId: string, conversationId: string) => void;
  /** Asks before `onRemoveConversation`; without it, removal is immediate. */
  confirmConversationRemoval?: (title: string, anchor: HTMLElement, onConfirm: () => void) => void;
  /**
   * Sets a conversation's star in every folder that holds it; `starred` is the
   * opposite of what its row shows.
   */
  onToggleStar?: (conversationId: string, starred: boolean) => void;
  onToggleFolderPinned?: (folderId: string) => void;
  /** Persists a folder's expansion; without it, expansion stays local to the panel. */
  onToggleFolderExpanded?: (folderId: string) => void;
  onMoveConversation?: (conversationId: string, fromFolderId: string, toFolderId: string) => void;
  onSetFolderColor?: (folderId: string, color: string) => void;
  /** Files the open conversation into a folder; the folder menu offers it only when set. */
  onAddCurrentConversation?: (folderId: string) => void;
  /**
   * Takes every drop on a folder or root drop target in place of the tree's own
   * move, including drags the tree's payload check refuses, such as a native
   * row with no source folder. Returns whether it used the drop.
   */
  onDrop?: (e: DragEvent, folderId: string, placement?: DropPlacement) => boolean;
  /** With `onDrop`: the drags to accept at dragover, from `dataTransfer.types`. */
  acceptsDrag?: (types: readonly string[]) => boolean;
  /** Double-click on a conversation title. */
  onRenameConversation?: (conv: ConversationReference) => void;
  /** Right-click on a conversation row; the host opens its own menu. */
  onConversationMenu?: (e: MouseEvent, conv: ConversationReference) => void;
  /** Extra folder menu entries, such as a site's project actions. */
  folderMenuItems?: (folder: Folder) => readonly FolderMenuItem[];
  /** Mouse down on a conversation row, and its release or leave (`e` is null then). */
  onConversationPress?: (
    e: MouseEvent | null,
    conv: ConversationReference,
    bucketId: string,
  ) => void;
  /**
   * Sees every click on a conversation title before it navigates; returning
   * true takes it (the default action is prevented), as a selection mode does.
   */
  interceptConversationClick?: (
    e: MouseEvent,
    conv: ConversationReference,
    bucketId: string,
    row: HTMLElement,
  ) => boolean;
  /** After the row has set its own payload; the host may replace it. */
  onConversationDragStart?: (e: DragEvent, conv: ConversationReference, bucketId: string) => void;
  onConversationDragEnd?: () => void;
};

/** Ways a site's tree differs from the floating panel's; each is off by default. */
export type TreeSiteOptions = {
  /** `created`: pinned first, then oldest first. Default: pinned, then sortIndex, then name. */
  folderOrder?: 'created';
  /** `stored`: a folder's conversations in stored order. Default: starred first, then the sort mode. */
  conversationOrder?: 'stored';
  /**
   * Which rows are one conversation, sharing one star: the site's folder
   * policy. Default: rows with the same stored id.
   */
  conversationIdentity?: ConversationIdentity;
  /**
   * Root conversations go under this heading after the folders, and a root drop
   * target stays even with no folders. Default: root conversations first, unlabelled.
   */
  rootSection?: { labelKey: string };
  /** Marks the rows of the conversation the page has open. */
  activeConversationId?: string | null;
  /** A button on each folder row that opens its menu. Default: the menu opens on right-click only. */
  folderMenuButton?: { labelKey: string };
  /**
   * A folder's body (its subfolders and conversations) takes drops too, so the
   * whole folder block is a target; the innermost folder wins. Default: the header only.
   */
  folderBodyDrop?: boolean;
  /** Shows only what it passes; a folder's count counts what is shown. */
  filter?: (layout: FolderLayout) => TreeFilter;
  /** Every folder shows open, as while searching; stored expansion is kept. */
  expandAll?: boolean;
  /** Marks the open conversation's rows, in place of `activeConversationId`. */
  isActiveConversation?: (conv: ConversationReference, bucketId: string) => boolean;
  /** Marks rows a site's selection mode holds. */
  isConversationSelected?: (conv: ConversationReference, bucketId: string) => boolean;
  /** Titles become links to this address, so modified clicks open it natively. */
  conversationHref?: (conv: ConversationReference) => string;
  /** A Google Symbols ligature drawn before each title. */
  conversationIcon?: (conv: ConversationReference) => string;
  /**
   * Row controls are line icons (chevron, plus, ellipsis, star, close) and each
   * folder shows a folder icon, tinted only when it has a colour. For a page
   * whose fonts lack the text glyphs' look. Default: text glyphs and a colour dot.
   */
  lineIcons?: boolean;
  /** The empty state's message. Default: `floatingPanelEmpty`. */
  emptyLabelKey?: string;
  /**
   * A click on a folder's name toggles after this many milliseconds, so a
   * double-click on the name renames without toggling twice. A click elsewhere
   * on the row toggles at once. Default: every click at once.
   */
  folderToggleDelayMs?: number;
  /** Folder rows leave out their count badge. */
  hideFolderCount?: boolean;
  /** Folder rows leave out their "+ add subfolder" button; the folder menu still offers it. */
  hideAddSubfolderButton?: boolean;
  /** A pin toggle on each folder row in place of the pinned dot. */
  folderPinButton?: boolean;
  /** While a folder is renamed, its trailing controls leave the row to the name field. */
  renameFillsRow?: boolean;
  /** Unpinned folder rows drag as `{ type: 'folder' }` payloads tagged `FOLDER_DRAG_TYPE`. */
  folderDrag?: boolean;
  /**
   * Drops beside a row carry a `DropPlacement`: the top or bottom quarter of a
   * folder header for folder drags, the top or bottom half of a conversation row.
   */
  reorder?: { folders?: boolean; conversations?: boolean };
};

/** A transient view change; `null` clears the editor or menu, omitted keeps it. */
export type TreeChange = {
  inlineEditor?: InlineEditorState | null;
  contextMenu?: ContextMenuState | null;
  expand?: { folderId: string; expanded: boolean };
};

export type TreeProps = {
  data: FolderData;
  /** The `folderContents` bucket holding conversations filed at the root. */
  rootBucketId: string;
  conversationSortMode: ConversationSortMode;
  actions: TreeActions;
  inlineEditor: InlineEditorState | null;
  contextMenu: ContextMenuState | null;
  isExpanded: (folder: Folder) => boolean;
  /** Applies `change`, runs `effect`, then re-renders the tree. */
  apply: (change: TreeChange, effect?: () => void) => void;
  site?: TreeSiteOptions;
  /** The controller renders the folder menu in a body-level layer instead. */
  menuInLayer?: boolean;
  /** A folder's header row as rendered now, which outlives the menu opened from it. */
  folderHeader: (folderId: string) => HTMLElement | null;
  /**
   * The layout of `data` from the owner of its revision. Without it, each render
   * lays the data out again.
   */
  projection?: TreeProjection;
  /** Changes when the owner swaps in another account's data: the view starts over. */
  generation?: number;
};

export type ConversationDragData = {
  type: 'conversation';
  conversationId: string;
  sourceFolderId: string;
};

export { sortFoldersByCreation };
export type { FolderLayout };

/**
 * Lays out folders for display without rewriting them. A repeated id keeps its
 * first record. The folders `findCycleRoots` picks to cut each parent cycle
 * stand in as roots, in stored order after the real ones, and the rest of the
 * cycle hangs under them as stored. Removal cuts cycles at the same folders.
 * The layout is the folder index's (`buildFolderIndex`), so every tree reads
 * one projection.
 */
export function layoutFolders(
  data: FolderData,
  order?: TreeSiteOptions['folderOrder'],
): FolderLayout {
  return buildFolderIndex(data).layout(order);
}

/** Which drags a drop target accepts at dragover, when the payload cannot be read yet. */
export function acceptsDrag(actions: TreeActions, types: readonly string[]): boolean {
  if (actions.onDrop && actions.acceptsDrag) return actions.acceptsDrag(types);
  return types.includes('application/json');
}

export function canCreateChildAtDepth(depth: number): boolean {
  return depth < MAX_FOLDER_DEPTH;
}

export function readConversationDragData(e: DragEvent): ConversationDragData | null {
  const payload = readDragPayload(e.dataTransfer);
  if (payload?.type !== 'conversation' || !payload.conversationId || !payload.sourceFolderId) {
    return null;
  }
  return {
    type: 'conversation',
    conversationId: payload.conversationId,
    sourceFolderId: payload.sourceFolderId,
  };
}
