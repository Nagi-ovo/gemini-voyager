/**
 * BackupService tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock webextension-polyfill before importing BackupService
vi.mock('webextension-polyfill', () => ({
  default: {
    runtime: {
      getManifest: () => ({ version: '1.0.0' }),
      getURL: (path: string) => `chrome-extension://test/${path}`,
    },
    storage: {
      sync: {
        get: vi.fn(),
        set: vi.fn(),
      },
    },
  },
}));

import { BackupService } from '../BackupService';
import type { BackupConfig } from '../../types/backup';
import { BackupInterval } from '../../types/backup';

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(() => {
    service = new BackupService();
    // Clear storage
    localStorage.clear();
    vi.clearAllMocks();
  });

  describe('getConfig', () => {
    it('should return default config when none exists', async () => {
      const config = await service.getConfig();
      expect(config.enabled).toBe(false);
      expect(config.interval).toBe(BackupInterval.DISABLED);
    });

    it('should return saved config', async () => {
      const testConfig: BackupConfig = {
        enabled: true,
        interval: BackupInterval.DAILY,
        lastBackupTime: Date.now(),
      };

      // Mock chrome.storage.sync.get
      const mockGet = vi.fn().mockImplementation((keys: any, callback?: any) => {
        if (callback) {
          callback({ gvBackupConfig: testConfig });
        }
        return Promise.resolve({ gvBackupConfig: testConfig });
      });
      globalThis.chrome.storage.sync.get = mockGet as any;

      const config = await service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.interval).toBe(BackupInterval.DAILY);
    });
  });

  describe('updateConfig', () => {
    it('should update backup configuration', async () => {
      const mockSet = vi.fn((data, callback?) => {
        if (callback) callback();
        return Promise.resolve();
      });
      globalThis.chrome.storage.sync.set = mockSet;

      await service.updateConfig({
        enabled: true,
        interval: BackupInterval.DAILY,
      });

      expect(mockSet).toHaveBeenCalled();
    });
  });

  describe('createBackup', () => {
    it('should create a backup with correct format', async () => {
      // Setup test data
      const testPrompts = [
        {
          id: '1',
          text: 'Test prompt',
          tags: ['test'],
          createdAt: Date.now(),
        },
      ];
      localStorage.setItem('gvPromptItems', JSON.stringify(testPrompts));

      const mockDownload = vi.fn();
      globalThis.chrome.downloads = {
        download: mockDownload,
      } as any;

      const result = await service.createBackup();

      expect(result.success).toBe(true);
      expect(result.filename).toMatch(/gemini-voyager-backup-\d{4}-\d{2}-\d{2}\.json/);
    });
  });

  describe('restoreFromBackup', () => {
    it('should restore valid backup data', async () => {
      const backupData = {
        format: 'gemini-voyager.backup.v1',
        createdAt: new Date().toISOString(),
        version: '1.0.0',
        data: {
          prompts: [
            {
              id: '1',
              text: 'Test prompt',
              tags: ['test'],
              createdAt: Date.now(),
            },
          ],
          folders: {
            gemini: { test: 'data' },
            aiStudio: null,
          },
        },
      };

      const blob = new Blob([JSON.stringify(backupData)], {
        type: 'application/json',
      });
      const file = new File([blob], 'backup.json', {
        type: 'application/json',
      });

      const mockSet = vi.fn();
      globalThis.chrome.storage.sync.set = mockSet;

      const result = await service.restoreFromBackup(file);

      expect(result.success).toBe(true);
      expect(result.promptsRestored).toBe(1);
      expect(result.foldersRestored).toBe(true);
    });

    it('should reject invalid backup format', async () => {
      const invalidData = {
        format: 'invalid-format',
        data: {},
      };

      const blob = new Blob([JSON.stringify(invalidData)], {
        type: 'application/json',
      });
      const file = new File([blob], 'invalid.json', {
        type: 'application/json',
      });

      const result = await service.restoreFromBackup(file);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid backup format');
    });
  });
});
