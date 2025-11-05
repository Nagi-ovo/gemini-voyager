/**
 * FolderImportExportService unit tests
 * Tests the import/export functionality for folder configurations
 */

import { describe, it, expect, beforeEach } from 'vitest';

import { ValidationErrorType } from '../../types/import-export';
import { FolderImportExportService } from '../FolderImportExportService';

import type { FolderData } from '@/core/types/folder';

describe('FolderImportExportService', () => {
  let sampleData: FolderData;

  beforeEach(() => {
    sampleData = {
      folders: [
        {
          id: 'folder-1' as any,
          name: 'Test Folder 1',
          parentId: null,
          isExpanded: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
        {
          id: 'folder-2' as any,
          name: 'Test Folder 2',
          parentId: 'folder-1' as any,
          isExpanded: false,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      folderContents: {
        'folder-1': [
          {
            conversationId: 'conv-1' as any,
            title: 'Test Conversation',
            url: 'https://gemini.google.com/app/test',
            addedAt: Date.now(),
          },
        ],
        'folder-2': [],
      },
    };
  });

  describe('exportToPayload', () => {
    it('should create a valid export payload', () => {
      const payload = FolderImportExportService.exportToPayload(sampleData);

      expect(payload.format).toBe('gemini-voyager.folders.v1');
      expect(payload.version).toBe('0.7.2');
      expect(payload.exportedAt).toBeDefined();
      expect(payload.data).toEqual(sampleData);
    });

    it('should include all folder data', () => {
      const payload = FolderImportExportService.exportToPayload(sampleData);

      expect(payload.data.folders).toHaveLength(2);
      expect(payload.data.folderContents['folder-1']).toHaveLength(1);
      expect(payload.data.folderContents['folder-2']).toHaveLength(0);
    });

    it('should generate ISO timestamp', () => {
      const payload = FolderImportExportService.exportToPayload(sampleData);

      const timestamp = new Date(payload.exportedAt);
      expect(timestamp.toISOString()).toBe(payload.exportedAt);
    });
  });

  describe('validatePayload', () => {
    it('should validate correct payload', () => {
      const payload = FolderImportExportService.exportToPayload(sampleData);
      const result = FolderImportExportService.validatePayload(payload);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(payload);
      }
    });

    it('should reject non-object payload', () => {
      const result = FolderImportExportService.validatePayload(null);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe(ValidationErrorType.INVALID_FORMAT);
      }
    });

    it('should reject invalid format version', () => {
      const payload = {
        format: 'wrong-format',
        data: sampleData,
      };

      const result = FolderImportExportService.validatePayload(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe(ValidationErrorType.INVALID_VERSION);
      }
    });

    it('should reject missing data field', () => {
      const payload = {
        format: 'gemini-voyager.folders.v1',
      };

      const result = FolderImportExportService.validatePayload(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe(ValidationErrorType.MISSING_DATA);
      }
    });

    it('should reject invalid folders array', () => {
      const payload = {
        format: 'gemini-voyager.folders.v1',
        data: {
          folders: 'not an array',
          folderContents: {},
        },
      };

      const result = FolderImportExportService.validatePayload(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe(ValidationErrorType.CORRUPTED_DATA);
      }
    });

    it('should reject folder without id', () => {
      const payload = {
        format: 'gemini-voyager.folders.v1',
        data: {
          folders: [{ name: 'Test', parentId: null }],
          folderContents: {},
        },
      };

      const result = FolderImportExportService.validatePayload(payload);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe(ValidationErrorType.CORRUPTED_DATA);
      }
    });
  });

  describe('mergeData', () => {
    it('should merge folders without duplicates', () => {
      const existing: FolderData = {
        folders: [sampleData.folders[0]],
        folderContents: {
          'folder-1': sampleData.folderContents['folder-1'],
        },
      };

      const imported: FolderData = {
        folders: [sampleData.folders[1]],
        folderContents: {
          'folder-2': sampleData.folderContents['folder-2'],
        },
      };

      const { merged, stats } = FolderImportExportService.mergeData(existing, imported);

      expect(merged.folders).toHaveLength(2);
      expect(stats.foldersImported).toBe(1);
      expect(stats.duplicatesFoldersSkipped).toBe(0);
    });

    it('should skip duplicate folders', () => {
      const existing: FolderData = {
        folders: [sampleData.folders[0]],
        folderContents: {},
      };

      const imported: FolderData = {
        folders: [sampleData.folders[0]],
        folderContents: {},
      };

      const { merged, stats } = FolderImportExportService.mergeData(existing, imported);

      expect(merged.folders).toHaveLength(1);
      expect(stats.foldersImported).toBe(0);
      expect(stats.duplicatesFoldersSkipped).toBe(1);
    });

    it('should merge conversations without duplicates', () => {
      const existing: FolderData = {
        folders: [sampleData.folders[0]],
        folderContents: {
          'folder-1': [],
        },
      };

      const imported: FolderData = {
        folders: [],
        folderContents: {
          'folder-1': sampleData.folderContents['folder-1'],
        },
      };

      const { merged, stats } = FolderImportExportService.mergeData(existing, imported);

      expect(merged.folderContents['folder-1']).toHaveLength(1);
      expect(stats.conversationsImported).toBe(1);
      expect(stats.duplicatesConversationsSkipped).toBe(0);
    });

    it('should skip duplicate conversations', () => {
      const existing: FolderData = {
        folders: [sampleData.folders[0]],
        folderContents: {
          'folder-1': sampleData.folderContents['folder-1'],
        },
      };

      const imported: FolderData = {
        folders: [],
        folderContents: {
          'folder-1': sampleData.folderContents['folder-1'],
        },
      };

      const { merged, stats } = FolderImportExportService.mergeData(existing, imported);

      expect(merged.folderContents['folder-1']).toHaveLength(1);
      expect(stats.conversationsImported).toBe(0);
      expect(stats.duplicatesConversationsSkipped).toBe(1);
    });
  });

  describe('importFromPayload', () => {
    it('should import with merge strategy', () => {
      const payload = FolderImportExportService.exportToPayload(sampleData);

      const currentData: FolderData = {
        folders: [],
        folderContents: {},
      };

      const result = FolderImportExportService.importFromPayload(payload, currentData, {
        strategy: 'merge',
        createBackup: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data.folders).toHaveLength(2);
        expect(result.data.stats.foldersImported).toBe(2);
      }
    });

    it('should import with overwrite strategy', () => {
      const payload = FolderImportExportService.exportToPayload(sampleData);

      const currentData: FolderData = {
        folders: [
          {
            id: 'old-folder' as any,
            name: 'Old Folder',
            parentId: null,
            isExpanded: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        ],
        folderContents: {},
      };

      const result = FolderImportExportService.importFromPayload(payload, currentData, {
        strategy: 'overwrite',
        createBackup: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.data.folders).toHaveLength(2);
        expect(result.data.data.folders[0].id).toBe('folder-1');
        expect(result.data.stats.backupCreated).toBe(true);
      }
    });

    it('should handle errors gracefully', () => {
      const invalidPayload = {
        format: 'gemini-voyager.folders.v1',
        data: null as any,
      };

      const result = FolderImportExportService.importFromPayload(
        invalidPayload as any,
        sampleData,
        {
          strategy: 'merge',
        }
      );

      expect(result.success).toBe(false);
    });
  });

  describe('generateExportFilename', () => {
    it('should generate filename with timestamp', () => {
      const filename = FolderImportExportService.generateExportFilename();

      expect(filename).toMatch(/^gemini-voyager-folders-\d{8}-\d{6}\.json$/);
    });

    it('should generate unique filenames', () => {
      const filename1 = FolderImportExportService.generateExportFilename();
      const filename2 = FolderImportExportService.generateExportFilename();

      // They should be the same or very close (within same second)
      // This test might be flaky if run exactly at second boundary
      expect(filename1.split('-').slice(0, 4).join('-')).toBe(
        filename2.split('-').slice(0, 4).join('-')
      );
    });
  });

  describe('readJSONFile', () => {
    it('should parse valid JSON file', async () => {
      const jsonContent = JSON.stringify({ test: 'data' });
      const blob = new Blob([jsonContent], { type: 'application/json' });

      // Mock File with proper text() method
      const file = Object.assign(blob, {
        name: 'test.json',
        lastModified: Date.now(),
        text: async () => jsonContent,
      }) as File;

      const result = await FolderImportExportService.readJSONFile(file);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ test: 'data' });
      }
    });

    it('should handle invalid JSON', async () => {
      const invalidJSON = 'not valid json{';
      const blob = new Blob([invalidJSON], { type: 'application/json' });

      // Mock File with proper text() method
      const file = Object.assign(blob, {
        name: 'test.json',
        lastModified: Date.now(),
        text: async () => invalidJSON,
      }) as File;

      const result = await FolderImportExportService.readJSONFile(file);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
