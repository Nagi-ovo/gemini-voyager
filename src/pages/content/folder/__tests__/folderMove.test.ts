import { afterEach, describe, expect, it, vi } from 'vitest';

import { FolderManager } from '../manager';
import type { DragData, Folder, FolderData } from '../types';

vi.mock('@/utils/i18n', () => ({
  getTranslationSync: (key: string) => key,
  getTranslationSyncUnsafe: (key: string) => key,
  initI18n: () => Promise.resolve(),
}));

type TestableManager = {
  data: FolderData;
  saveData: () => void;
  refresh: () => void;
  createFolderElement: (folder: Folder, level?: number) => HTMLElement;
  canFolderBeDragged: (folder: Folder) => boolean;
  sortFolders: (folders: Folder[]) => Folder[];
  reorderFolder: (folderId: string, targetParentId: string, insertIndex: number) => void;
  addFolderToFolder: (targetFolderId: string, dragData: DragData) => void;
  moveFolderToRoot: (dragData: DragData) => void;
};

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

function getOrderedFolderIds(manager: TestableManager, parentId: string | null): string[] {
  return manager
    .sortFolders(manager.data.folders.filter((folder) => folder.parentId === parentId))
    .map((folder) => folder.id);
}

function createFolderDragData(folderId: string, title: string): DragData {
  return {
    type: 'folder',
    folderId,
    title,
  };
}

describe('folder movement', () => {
  let manager: FolderManager | null = null;

  afterEach(() => {
    manager?.destroy();
    manager = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('allows dragging a non-pinned folder even when it has subfolders', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    const parentFolder = createFolder('parent', 'Parent', null, 0);
    const childFolder = createFolder('child', 'Child', 'parent', 0);
    const pinnedFolder = createFolder('pinned', 'Pinned', null, 1, true);

    typedManager.data = {
      folders: [parentFolder, childFolder, pinnedFolder],
      folderContents: {},
    };

    const parentElement = typedManager.createFolderElement(parentFolder);
    const pinnedElement = typedManager.createFolderElement(pinnedFolder);
    const parentHeader = parentElement.querySelector('.gv-folder-item-header');
    const pinnedHeader = pinnedElement.querySelector('.gv-folder-item-header');

    expect(typedManager.canFolderBeDragged(parentFolder)).toBe(true);
    expect(parentHeader instanceof HTMLElement ? parentHeader.draggable : false).toBe(true);

    expect(typedManager.canFolderBeDragged(pinnedFolder)).toBe(false);
    expect(pinnedHeader instanceof HTMLElement ? pinnedHeader.draggable : true).toBe(false);
  });

  it('preserves sibling order when reordering a folder within the same parent', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    const saveSpy = vi.spyOn(typedManager, 'saveData').mockImplementation(() => {});
    const refreshSpy = vi.spyOn(typedManager, 'refresh').mockImplementation(() => {});

    typedManager.data = {
      folders: [
        createFolder('a', 'A', null, 0),
        createFolder('b', 'B', null, 1),
        createFolder('c', 'C', null, 2),
      ],
      folderContents: {},
    };

    typedManager.reorderFolder('a', '__root__', 2);

    expect(getOrderedFolderIds(typedManager, null)).toEqual(['b', 'a', 'c']);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('moves a multi-level folder into another folder while keeping subtree order intact', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    const saveSpy = vi.spyOn(typedManager, 'saveData').mockImplementation(() => {});
    const refreshSpy = vi.spyOn(typedManager, 'refresh').mockImplementation(() => {});

    typedManager.data = {
      folders: [
        createFolder('target', 'Target', null, 0),
        createFolder('existing-child', 'Existing Child', 'target', 0),
        createFolder('moving', 'Moving', null, 1),
        createFolder('moving-child-a', 'Moving Child A', 'moving', 0),
        createFolder('moving-child-b', 'Moving Child B', 'moving', 1),
      ],
      folderContents: {},
    };

    typedManager.addFolderToFolder('target', createFolderDragData('moving', 'Moving'));

    const movingFolder = typedManager.data.folders.find((folder) => folder.id === 'moving');

    expect(movingFolder?.parentId).toBe('target');
    expect(getOrderedFolderIds(typedManager, 'target')).toEqual(['existing-child', 'moving']);
    expect(getOrderedFolderIds(typedManager, 'moving')).toEqual([
      'moving-child-a',
      'moving-child-b',
    ]);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('moves a multi-level folder to root while keeping subtree order intact', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    const saveSpy = vi.spyOn(typedManager, 'saveData').mockImplementation(() => {});
    const refreshSpy = vi.spyOn(typedManager, 'refresh').mockImplementation(() => {});

    typedManager.data = {
      folders: [
        createFolder('root-a', 'Root A', null, 0),
        createFolder('root-b', 'Root B', null, 1),
        createFolder('container', 'Container', null, 2),
        createFolder('existing-child', 'Existing Child', 'container', 0),
        createFolder('moving', 'Moving', 'container', 1),
        createFolder('moving-child-a', 'Moving Child A', 'moving', 0),
        createFolder('moving-child-b', 'Moving Child B', 'moving', 1),
      ],
      folderContents: {},
    };

    typedManager.moveFolderToRoot(createFolderDragData('moving', 'Moving'));

    const movingFolder = typedManager.data.folders.find((folder) => folder.id === 'moving');

    expect(movingFolder?.parentId).toBeNull();
    expect(getOrderedFolderIds(typedManager, null)).toEqual([
      'root-a',
      'root-b',
      'container',
      'moving',
    ]);
    expect(getOrderedFolderIds(typedManager, 'container')).toEqual(['existing-child']);
    expect(getOrderedFolderIds(typedManager, 'moving')).toEqual([
      'moving-child-a',
      'moving-child-b',
    ]);
    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  it('blocks moving pinned folders', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    const saveSpy = vi.spyOn(typedManager, 'saveData').mockImplementation(() => {});
    const refreshSpy = vi.spyOn(typedManager, 'refresh').mockImplementation(() => {});

    typedManager.data = {
      folders: [
        createFolder('pinned', 'Pinned', null, 0, true),
        createFolder('target', 'Target', null, 1),
      ],
      folderContents: {},
    };

    typedManager.addFolderToFolder('target', createFolderDragData('pinned', 'Pinned'));

    const pinnedFolder = typedManager.data.folders.find((folder) => folder.id === 'pinned');

    expect(typedManager.canFolderBeDragged(pinnedFolder!)).toBe(false);
    expect(pinnedFolder?.parentId).toBeNull();
    expect(getOrderedFolderIds(typedManager, null)).toEqual(['pinned', 'target']);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it('prevents moving a folder into its descendant', () => {
    manager = new FolderManager();
    const typedManager = manager as unknown as TestableManager;
    const saveSpy = vi.spyOn(typedManager, 'saveData').mockImplementation(() => {});
    const refreshSpy = vi.spyOn(typedManager, 'refresh').mockImplementation(() => {});

    typedManager.data = {
      folders: [
        createFolder('ancestor', 'Ancestor', null, 0),
        createFolder('child', 'Child', 'ancestor', 0),
      ],
      folderContents: {},
    };

    typedManager.addFolderToFolder('child', createFolderDragData('ancestor', 'Ancestor'));

    const ancestorFolder = typedManager.data.folders.find((folder) => folder.id === 'ancestor');

    expect(ancestorFolder?.parentId).toBeNull();
    expect(getOrderedFolderIds(typedManager, null)).toEqual(['ancestor']);
    expect(getOrderedFolderIds(typedManager, 'ancestor')).toEqual(['child']);
    expect(saveSpy).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
  });
});
