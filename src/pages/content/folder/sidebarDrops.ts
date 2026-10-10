import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import {
  type ConversationIdentity,
  readConversationStars,
} from '@/features/folder/model/conversationStars';
import {
  type ConversationSortMode,
  sortConversationsByPriority,
  sortFolders,
} from '@/features/folder/model/folderData';
import { getTranslationSyncUnsafe as t } from '@/utils/i18n';

import type { FolderFeedback } from './FolderFeedback';
import { VOYAGER_DRAG_MIME, readDragPayload } from './dragPayload';
import type { DropPlacement } from './floatingTree/shared';
import type { DragData, FolderData } from './types';

/** What a drop on a sidebar's folders needs: Gemini's, and ChatGPT's section. */
export type SidebarDropContext = {
  store: { readonly data: FolderData };
  commands: FolderCommands;
  /** The bucket of conversations filed at the root; a folder dropped there moves to the root. */
  rootBucketId: string;
  feedback: Pick<FolderFeedback, 'showNotification'>;
  sortMode: () => ConversationSortMode;
  /** How the site names one conversation across folders, which the tree's stars follow. */
  conversationIdentity: ConversationIdentity;
  /** After any drop that read a payload: ends the multi-select a drag carried. */
  finish?: () => void;
};

/** Sidebar drags all carry Voyager JSON: folder rows, folder chats and Gemini's native chats. */
export function acceptsSidebarDrag(types: readonly string[]): boolean {
  return types.includes(VOYAGER_DRAG_MIME);
}

/** The insert index of a drop beside `placement`'s folder among its unpinned siblings. */
function folderInsertIndex(
  store: SidebarDropContext['store'],
  placement: Extract<DropPlacement, { kind: 'folder' }>,
): { parentId: string; index: number } | null {
  const target = store.data.folders.find((folder) => folder.id === placement.folderId);
  if (!target) return null;
  // Pinned folders never move, so a dragged folder ranks among the unpinned.
  const siblings = sortFolders(
    store.data.folders.filter((folder) => folder.parentId === target.parentId && !folder.pinned),
  );
  const at = siblings.findIndex((folder) => folder.id === target.id);
  const index = at < 0 ? 0 : placement.position === 'before' ? at : at + 1;
  return { parentId: target.parentId ?? '__root__', index };
}

/** The insert index of a drop beside a chat, within its starred or unstarred group as shown. */
function conversationInsertIndex(
  context: SidebarDropContext,
  sortMode: ConversationSortMode,
  placement: Extract<DropPlacement, { kind: 'conversation' }>,
): number {
  const { data } = context.store;
  const starred = readConversationStars(data, context.conversationIdentity);
  const sorted = sortConversationsByPriority(
    data.folderContents[placement.bucketId] ?? [],
    sortMode,
    starred,
  );
  const target = sorted.find((conv) => conv.conversationId === placement.conversationId);
  const targetStarred = !!target && starred(target);
  const group = sorted.filter((conv) => starred(conv) === targetStarred);
  const at = group.findIndex((conv) => conv.conversationId === placement.conversationId);
  if (at < 0) return group.length;
  return placement.position === 'before' ? at : at + 1;
}

/**
 * Files a dropped payload: a folder nests or reorders, chats move, reorder or
 * join from Gemini's own list. In recent order a chat dropped back into its
 * own folder explains why it cannot be reordered instead.
 */
export function applySidebarDrop(
  context: SidebarDropContext,
  dragData: DragData,
  folderId: string,
  placement?: DropPlacement,
): void {
  const { store, commands } = context;
  try {
    if (dragData.type === 'folder') {
      if (placement?.kind === 'folder' && dragData.folderId) {
        const at = folderInsertIndex(store, placement);
        if (at)
          void commands.run({
            kind: 'moveFolder',
            folderId: dragData.folderId,
            parentId: at.parentId === '__root__' ? null : at.parentId,
            index: at.index,
          });
      } else if (dragData.folderId) {
        void commands.run({
          kind: 'moveFolder',
          folderId: dragData.folderId,
          parentId: folderId === context.rootBucketId ? null : folderId,
        });
      }
      return;
    }
    const sortMode = context.sortMode();
    if (sortMode === 'recent' && dragData.sourceFolderId === folderId) {
      context.feedback.showNotification(t('folder_sort_recent_drag_hint'), 'info');
      return;
    }
    void commands.run({
      kind: 'dropConversations',
      target: folderId,
      payload: dragData,
      ...(placement?.kind === 'conversation' && sortMode === 'manual'
        ? { index: conversationInsertIndex(context, sortMode, placement) }
        : {}),
    });
  } catch (error) {
    console.error('[FolderManager] Drop error:', error);
  } finally {
    context.finish?.();
  }
}

/** A drop on the tree: reads and files the payload. Returns whether there was one. */
export function dropOnSidebar(
  context: SidebarDropContext,
  e: DragEvent,
  folderId: string,
  placement?: DropPlacement,
): boolean {
  const dragData = readDragPayload(e.dataTransfer);
  if (!dragData) return false;
  applySidebarDrop(context, dragData, folderId, placement);
  return true;
}

/**
 * Makes `element` file drops at the root: the section header, and the tree
 * host for drops between rows that no row takes. `active` marks it while a
 * drag is over it. Returns its cleanup.
 */
export function bindRootDropZone(
  element: HTMLElement,
  context: SidebarDropContext,
  active = 'gv-folder-list-dragover',
): () => void {
  const onDragOver = (e: DragEvent) => {
    if (!acceptsSidebarDrag(Array.from(e.dataTransfer?.types ?? []))) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    element.classList.add(active);
  };
  const onDragLeave = (e: DragEvent) => {
    const into = e.relatedTarget;
    if (into instanceof Node && element.contains(into)) return;
    element.classList.remove(active);
  };
  const onDrop = (e: DragEvent) => {
    element.classList.remove(active);
    if (!acceptsSidebarDrag(Array.from(e.dataTransfer?.types ?? []))) return;
    e.preventDefault();
    e.stopPropagation();
    dropOnSidebar(context, e, context.rootBucketId);
  };
  element.addEventListener('dragover', onDragOver);
  element.addEventListener('dragleave', onDragLeave);
  element.addEventListener('drop', onDrop);
  return () => {
    element.removeEventListener('dragover', onDragOver);
    element.removeEventListener('dragleave', onDragLeave);
    element.removeEventListener('drop', onDrop);
  };
}
