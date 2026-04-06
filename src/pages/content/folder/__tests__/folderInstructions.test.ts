import { describe, expect, it } from 'vitest';

import type { FolderId } from '@/core/types/common';
import type { Folder, FolderData } from '@/core/types/folder';
import { FolderImportExportService } from '@/features/folder/services/FolderImportExportService';

describe('Folder instructions — type shape', () => {
  it('allows instructions to be set on a Folder object', () => {
    const folder: Folder = {
      id: 'f1' as FolderId,
      name: 'Test Folder',
      parentId: null,
      isExpanded: false,
      createdAt: 1000,
      updatedAt: 1000,
      instructions: 'Always reply in JSON.',
    };
    expect(folder.instructions).toBe('Always reply in JSON.');
  });

  it('allows instructions to be undefined (optional)', () => {
    const folder: Folder = {
      id: 'f2' as FolderId,
      name: 'No Instructions',
      parentId: null,
      isExpanded: false,
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(folder.instructions).toBeUndefined();
  });
});

describe('FolderImportExportService — instructions round-trip', () => {
  it('preserves instructions through export', () => {
    const data: FolderData = {
      folders: [
        {
          id: 'f1' as FolderId,
          name: 'Coding',
          parentId: null,
          isExpanded: true,
          createdAt: 1000,
          updatedAt: 1000,
          instructions: 'Use TypeScript always.',
        },
      ],
      folderContents: {},
    };

    const payload = FolderImportExportService.exportToPayload(data);
    expect(payload.data.folders[0].instructions).toBe('Use TypeScript always.');
  });

  it('gracefully handles folders without instructions (older payloads)', () => {
    const data: FolderData = {
      folders: [
        {
          id: 'f2' as FolderId,
          name: 'Misc',
          parentId: null,
          isExpanded: true,
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
      folderContents: {},
    };

    const payload = FolderImportExportService.exportToPayload(data);
    expect(payload.data.folders[0].instructions).toBeUndefined();
  });
});
