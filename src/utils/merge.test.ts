import { describe, expect, it } from 'vitest';

import type { ConversationId, FolderId } from '@/core/types/common';
import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';

import { mergeFolderData } from './merge';

// Helper to create test folder
function createFolder(id: string, name: string, updatedAt: number): Folder {
  return {
    id: id as FolderId,
    name,
    parentId: null,
    isExpanded: true,
    createdAt: 1000,
    updatedAt,
  };
}

// Helper to create test conversation reference
function createConvo(
  conversationId: string,
  title: string,
  addedAt: number,
  extras?: Partial<ConversationReference>,
): ConversationReference {
  return {
    conversationId: conversationId as ConversationId,
    title,
    url: `/app/${conversationId}`,
    addedAt,
    ...extras,
  };
}

// Helper to create test folder data
function createFolderData(
  folders: Folder[],
  folderContents: Record<string, ConversationReference[]>,
): FolderData {
  return { folders, folderContents };
}

describe('mergeFolderData', () => {
  it('should merge folders from local and cloud', () => {
    const local = createFolderData([createFolder('f1', 'Local Folder', 1000)], {});
    const cloud = createFolderData([createFolder('f2', 'Cloud Folder', 2000)], {});

    const result = mergeFolderData(local, cloud);

    expect(result.folders).toHaveLength(2);
    expect(result.folders.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
  });

  it('should prefer newer folder when same id exists', () => {
    const local = createFolderData([createFolder('f1', 'Old Name', 1000)], {});
    const cloud = createFolderData([createFolder('f1', 'New Name', 2000)], {});

    const result = mergeFolderData(local, cloud);

    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].name).toBe('New Name');
    expect(result.folders[0].updatedAt).toBe(2000);
  });

  describe('folder structural deduplication', () => {
    it('should deduplicate folders based on path hierarchy', () => {
      // Local: Parent -> Target (IDs: l-parent -> l-target)
      const local = createFolderData([
        createFolder('l-parent', 'Parent', 1000),
        { ...createFolder('l-target', 'Target', 1000), parentId: 'l-parent' as FolderId }
      ], { 'l-target': [createConvo('c1', 'Local Conv', 1000)] });

      // Cloud: Parent -> Target (IDs: c-parent -> c-target)
      const cloud = createFolderData([
        createFolder('c-parent', 'Parent', 2000),
        { ...createFolder('c-target', 'Target', 2000), parentId: 'c-parent' as FolderId }
      ], { 'c-target': [createConvo('c2', 'Cloud Conv', 2000)] });

      const result = mergeFolderData(local, cloud);

      // Should only have 2 folders: Parent and Target
      expect(result.folders).toHaveLength(2);

      const mergedTargetFolder = result.folders.find(f => f.name === 'Target');
      expect(mergedTargetFolder).toBeDefined();
      expect(mergedTargetFolder!.id).toBe('c-target'); // Prefers cloud ID
      expect(mergedTargetFolder!.parentId).toBe('c-parent'); // Uses cloud parent ID

      const contents = result.folderContents['c-target'];
      expect(contents).toBeDefined();
      expect(contents).toHaveLength(2);
      expect(contents.map(c => c.conversationId).sort()).toEqual(['c1', 'c2']);

      // The local ID should not be in the results anymore
      expect(result.folders.find(f => f.id === 'l-target')).toBeUndefined();
      expect(result.folderContents['l-target']).toBeUndefined();
    });

    it('should not deduplicate folders with the same name but different parents', () => {
      const local = createFolderData([
        createFolder('l-parent1', 'Parent 1', 1000),
        { ...createFolder('l-target', 'Target', 1000), parentId: 'l-parent1' as FolderId }
      ], {});

      const cloud = createFolderData([
        createFolder('c-parent2', 'Parent 2', 2000),
        { ...createFolder('c-target', 'Target', 2000), parentId: 'c-parent2' as FolderId }
      ], {});

      const result = mergeFolderData(local, cloud);

      // Should have 4 folders (Parent 1, Parent 2, Target x 2)
      expect(result.folders).toHaveLength(4);
      expect(result.folders.filter(f => f.name === 'Target')).toHaveLength(2);
    });
  });

  describe('conversation reference merging - cloud-first strategy', () => {
    it('should use cloud title to override local (renamed sync scenario)', () => {
      const localConvo = createConvo('c1', 'Old Title', 1000);
      const cloudConvo = createConvo('c1', 'Renamed Title', 1000, { customTitle: true });

      const local = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [localConvo] });
      const cloud = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [cloudConvo] });

      const result = mergeFolderData(local, cloud);

      expect(result.folderContents.f1).toHaveLength(1);
      expect(result.folderContents.f1[0].title).toBe('Renamed Title');
      expect(result.folderContents.f1[0].customTitle).toBe(true);
    });

    it('should preserve local starred when cloud has no starred property', () => {
      const localConvo = createConvo('c1', 'Title', 1000, { starred: true });
      const cloudConvo = createConvo('c1', 'Title', 1000);

      const local = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [localConvo] });
      const cloud = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [cloudConvo] });

      const result = mergeFolderData(local, cloud);

      expect(result.folderContents.f1).toHaveLength(1);
      expect(result.folderContents.f1[0].starred).toBe(true);
    });

    it('should use cloud starred when cloud has starred property', () => {
      const localConvo = createConvo('c1', 'Title', 1000, { starred: true });
      const cloudConvo = createConvo('c1', 'Title', 1000, { starred: false });

      const local = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [localConvo] });
      const cloud = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [cloudConvo] });

      const result = mergeFolderData(local, cloud);

      expect(result.folderContents.f1).toHaveLength(1);
      expect(result.folderContents.f1[0].starred).toBe(false);
    });

    it('should keep local-only conversations', () => {
      const localConvo = createConvo('c1', 'Local Only', 1000);

      const local = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [localConvo] });
      const cloud = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [] });

      const result = mergeFolderData(local, cloud);

      expect(result.folderContents.f1).toHaveLength(1);
      expect(result.folderContents.f1[0].title).toBe('Local Only');
    });

    it('should add cloud-only conversations', () => {
      const cloudConvo = createConvo('c1', 'Cloud Only', 2000);

      const local = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [] });
      const cloud = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [cloudConvo] });

      const result = mergeFolderData(local, cloud);

      expect(result.folderContents.f1).toHaveLength(1);
      expect(result.folderContents.f1[0].title).toBe('Cloud Only');
    });

    it('should include conversations from both local and cloud folders', () => {
      const localConvo = createConvo('c1', 'Local Conv', 1000);
      const cloudConvo = createConvo('c2', 'Cloud Conv', 2000);

      const local = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [localConvo] });
      const cloud = createFolderData([createFolder('f1', 'Folder', 1000)], { f1: [cloudConvo] });

      const result = mergeFolderData(local, cloud);

      expect(result.folderContents.f1).toHaveLength(2);
      expect(result.folderContents.f1.map((c) => c.conversationId).sort()).toEqual(['c1', 'c2']);
    });
  });
});
