import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { toastDriver } from '@/tests/toastDriver';

import { fakeTransfer } from '../floatingTree/__tests__/treeDriver';
import type { ConversationReference, DragData, Folder, FolderData } from '../types';
import { createFolderViewHarness, resetFolderViewBrowserMocks } from './folderViewHarness';
import { sidebarTree } from './sidebarTreeDriver';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

function createFolder(
  id: string,
  name: string,
  parentId: string | null,
  sortIndex: number,
  pinned?: boolean,
): Folder {
  const now = Date.now();
  return {
    id,
    name,
    parentId,
    isExpanded: true,
    pinned,
    sortIndex,
    createdAt: now,
    updatedAt: now,
  };
}

function getOrderedFolderIds(data: FolderData, parentId: string | null): string[] {
  return data.folders
    .filter((folder) => folder.parentId === parentId)
    .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
    .map((folder) => folder.id);
}

function createFolderDragData(folderId: string, title: string): DragData {
  return {
    type: 'folder',
    folderId,
    title,
  };
}

function createConversation(id: string, sortIndex: number): ConversationReference {
  return {
    conversationId: id,
    title: `Conversation ${id}`,
    url: `/app/${id}`,
    addedAt: Date.now(),
    sortIndex,
  };
}

/** A drag carrying `payload`, over or onto `target` at `clientY` (the row spans 0–40px). */
function dragAt(
  target: HTMLElement,
  type: 'dragover' | 'drop',
  clientY: number,
  payload: DragData,
) {
  Object.defineProperty(target, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, bottom: 40, height: 40, left: 0, right: 200, width: 200 }),
  });
  const transfer = fakeTransfer({ 'application/json': JSON.stringify(payload) });
  const event = new Event(type, { bubbles: true, cancelable: true, composed: true }) as DragEvent;
  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'dataTransfer', { value: transfer });
  target.dispatchEvent(event);
  return event;
}

describe('folder movement', () => {
  let harness: Awaited<ReturnType<typeof createFolderViewHarness>>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    resetFolderViewBrowserMocks();
  });

  afterEach(() => {
    harness?.destroy();
    document.body.innerHTML = '';
    localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('allows dragging a non-pinned folder even when it has subfolders', async () => {
    harness = await createFolderViewHarness({
      folders: [
        createFolder('parent', 'Parent', null, 0),
        createFolder('child', 'Child', 'parent', 0),
        createFolder('pinned', 'Pinned', null, 1, true),
      ],
      folderContents: {},
    });

    const tree = sidebarTree(harness.runtime.panel);
    expect(tree.folderRow('Parent').draggable).toBe(true);
    expect(tree.folderRow('Pinned').draggable).toBe(false);
  });

  it('preserves sibling order when reordering a folder within the same parent', async () => {
    harness = await createFolderViewHarness({
      folders: [
        createFolder('a', 'A', null, 0),
        createFolder('b', 'B', null, 1),
        createFolder('c', 'C', null, 2),
      ],
      folderContents: {},
    });

    harness.store.reorderFolder('a', '__root__', 2);
    await vi.advanceTimersByTimeAsync(0);

    expect(getOrderedFolderIds(harness.store.data, null)).toEqual(['b', 'a', 'c']);
    expect(getOrderedFolderIds(harness.saved, null)).toEqual(['b', 'a', 'c']);
    expect(harness.adapter.saveData).toHaveBeenCalledTimes(1);
    expect(harness.onRefresh).toHaveBeenCalledTimes(1);
    expect(sidebarTree(harness.runtime.panel).folderNames()).toEqual(['B', 'A', 'C']);
  });

  it.each(['pinned', 'descendant'])(
    'does not save or refresh after a rejected %s move',
    async (reason) => {
      harness = await createFolderViewHarness({
        folders: [
          createFolder('moving', 'Moving', null, 0, reason === 'pinned'),
          createFolder('target', 'Target', reason === 'descendant' ? 'moving' : null, 1),
        ],
        folderContents: {},
      });
      const original = structuredClone(harness.store.data);
      const originalList = harness.runtime.panel!.querySelector('.gv-folder-list');
      harness.store.addFolderToFolder('target', createFolderDragData('moving', 'Moving'));
      await vi.advanceTimersByTimeAsync(0);

      expect(harness.store.data).toEqual(original);
      expect(harness.adapter.saveData).not.toHaveBeenCalled();
      expect(harness.onRefresh).not.toHaveBeenCalled();
      expect(originalList!.isConnected).toBe(true);
    },
  );

  it('reorders a conversation within its folder by dropping it above a sibling', async () => {
    harness = await createFolderViewHarness({
      folders: [createFolder('folder', 'Folder', null, 0)],
      folderContents: {
        folder: [
          createConversation('a', 0),
          createConversation('b', 1),
          createConversation('c', 2),
        ],
      },
    });
    await vi.advanceTimersByTimeAsync(0);
    const dragData: DragData = {
      type: 'conversation',
      title: 'Conversation a',
      conversations: [createConversation('a', 0)],
      sourceFolderId: 'folder',
    };
    const target = sidebarTree(harness.runtime.panel).conversationRow('folder', 'Conversation c');
    expect(dragAt(target, 'dragover', 5, dragData).defaultPrevented).toBe(true);
    dragAt(target, 'drop', 5, dragData);
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.adapter.saveData).toHaveBeenCalledTimes(1);
    expect(
      harness.store.data.folderContents.folder
        .slice()
        .sort((a, b) => (a.sortIndex ?? 0) - (b.sortIndex ?? 0))
        .map((conversation) => conversation.conversationId),
    ).toEqual(['b', 'a', 'c']);
    expect(sidebarTree(harness.runtime.panel).outline()).toEqual([
      'Folder',
      '  · Conversation b',
      '  · Conversation a',
      '  · Conversation c',
    ]);
  });

  it('keeps in-folder reorder disabled in recently-opened mode and explains why', async () => {
    harness = await createFolderViewHarness({
      folders: [createFolder('folder', 'Folder', null, 0)],
      folderContents: { folder: [createConversation('a', 0), createConversation('b', 1)] },
    });
    harness.treeView.applySettings(
      { [StorageKeys.FOLDER_CONVERSATION_SORT_MODE]: { newValue: 'recent' } },
      'sync',
    );
    await vi.advanceTimersByTimeAsync(0);
    const original = structuredClone(harness.store.data);
    const dragData: DragData = {
      type: 'conversation',
      title: 'Conversation a',
      conversations: [createConversation('a', 0)],
      sourceFolderId: 'folder',
    };
    const target = sidebarTree(harness.runtime.panel).conversationRow('folder', 'Conversation b');

    // The drag is still taken (it files into the folder), but never as a reorder.
    expect(dragAt(target, 'dragover', 35, dragData).defaultPrevented).toBe(true);
    dragAt(target, 'drop', 35, dragData);

    expect(toastDriver.messages()).toEqual(['folder_sort_recent_drag_hint']);
    expect(harness.store.data).toEqual(original);
    expect(harness.adapter.saveData).not.toHaveBeenCalled();
  });
});
