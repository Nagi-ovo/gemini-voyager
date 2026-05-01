import { describe, expect, it } from 'vitest';

import type { ConversationId, FolderId } from '@/core/types/common';
import type { ConversationReference, Folder, FolderData } from '@/core/types/folder';

import { mergeFolderData } from './merge';

// Helper to create test folder
function createFolder(
  id: string,
  name: string,
  updatedAt: number,
  extras?: Partial<Folder>,
): Folder {
  return {
    id: id as FolderId,
    name,
    parentId: null,
    isExpanded: true,
    createdAt: 1000,
    updatedAt,
    ...extras,
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

  it('should merge same-path folders with different ids and remap cloud contents', () => {
    const local = createFolderData([createFolder('local-work', 'Work', 1000)], {
      'local-work': [createConvo('c1', 'Local Conversation', 1000)],
    });
    const cloud = createFolderData([createFolder('cloud-work', 'Work', 2000)], {
      'cloud-work': [createConvo('c2', 'Cloud Conversation', 2000)],
    });

    const result = mergeFolderData(local, cloud);

    expect(result.folders).toHaveLength(1);
    expect(result.folders[0].id).toBe('local-work');
    expect(result.folders[0].name).toBe('Work');
    expect(result.folders[0].updatedAt).toBe(2000);
    expect(result.folderContents['local-work'].map((c) => c.conversationId).sort()).toEqual([
      'c1',
      'c2',
    ]);
    expect(result.folderContents['cloud-work']).toBeUndefined();
  });

  it('should remap child folder parent ids and contents when parent paths are merged', () => {
    const local = createFolderData(
      [
        createFolder('local-work', 'Work', 1000),
        createFolder('local-client', 'Client', 1000, {
          parentId: 'local-work' as FolderId,
        }),
      ],
      {
        'local-client': [createConvo('c1', 'Local Client Conversation', 1000)],
      },
    );
    const cloud = createFolderData(
      [
        createFolder('cloud-work', 'Work', 1000),
        createFolder('cloud-client', 'Client', 2000, {
          parentId: 'cloud-work' as FolderId,
        }),
      ],
      {
        'cloud-client': [createConvo('c2', 'Cloud Client Conversation', 2000)],
      },
    );

    const result = mergeFolderData(local, cloud);

    expect(result.folders.map((f) => f.id).sort()).toEqual(['local-client', 'local-work']);
    const clientFolder = result.folders.find((f) => f.id === 'local-client');
    expect(clientFolder?.parentId).toBe('local-work');
    expect(clientFolder?.updatedAt).toBe(2000);
    expect(result.folderContents['local-client'].map((c) => c.conversationId).sort()).toEqual([
      'c1',
      'c2',
    ]);
    expect(result.folderContents['cloud-client']).toBeUndefined();
  });

  it('should not merge same-name folders under different parents', () => {
    const local = createFolderData(
      [
        createFolder('local-root', 'Local', 1000),
        createFolder('local-shared', 'Shared', 1000, {
          parentId: 'local-root' as FolderId,
        }),
      ],
      {
        'local-shared': [createConvo('c1', 'Local Shared', 1000)],
      },
    );
    const cloud = createFolderData(
      [
        createFolder('cloud-root', 'Cloud', 1000),
        createFolder('cloud-shared', 'Shared', 1000, {
          parentId: 'cloud-root' as FolderId,
        }),
      ],
      {
        'cloud-shared': [createConvo('c2', 'Cloud Shared', 1000)],
      },
    );

    const result = mergeFolderData(local, cloud);

    expect(result.folders.map((f) => f.id).sort()).toEqual([
      'cloud-root',
      'cloud-shared',
      'local-root',
      'local-shared',
    ]);
    expect(result.folderContents['local-shared']).toHaveLength(1);
    expect(result.folderContents['cloud-shared']).toHaveLength(1);
  });

  it('should preserve ambiguous duplicate local paths instead of auto-merging by name', () => {
    const local = createFolderData(
      [createFolder('local-work-1', 'Work', 1000), createFolder('local-work-2', 'Work', 1000)],
      {
        'local-work-1': [createConvo('c1', 'Local One', 1000)],
        'local-work-2': [createConvo('c2', 'Local Two', 1000)],
      },
    );
    const cloud = createFolderData([createFolder('cloud-work', 'Work', 1000)], {
      'cloud-work': [createConvo('c3', 'Cloud Work', 1000)],
    });

    const result = mergeFolderData(local, cloud);

    expect(result.folders.map((f) => f.id).sort()).toEqual([
      'cloud-work',
      'local-work-1',
      'local-work-2',
    ]);
    expect(result.folderContents['local-work-1']).toHaveLength(1);
    expect(result.folderContents['local-work-2']).toHaveLength(1);
    expect(result.folderContents['cloud-work']).toHaveLength(1);
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
