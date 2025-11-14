/**
 * BackupService tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import browser from 'webextension-polyfill';

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

    // Setup default browser mock
    vi.mocked(browser.storage.sync.get).mockResolvedValue({});
    vi.mocked(browser.storage.sync.set).mockResolvedValue(undefined);

    // Setup chrome.downloads mock
    if (!globalThis.chrome) {
      globalThis.chrome = {} as any;
    }
    if (!globalThis.chrome.downloads) {
      globalThis.chrome.downloads = {} as any;
    }
    globalThis.chrome.downloads.download = vi.fn().mockResolvedValue(1);
  });

  describe('getConfig', () => {
    it('should return default config when none exists', async () => {
      vi.mocked(browser.storage.sync.get).mockResolvedValue({});

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

      vi.mocked(browser.storage.sync.get).mockResolvedValue({
        gvBackupConfig: testConfig,
      });

      const config = await service.getConfig();
      expect(config.enabled).toBe(true);
      expect(config.interval).toBe(BackupInterval.DAILY);
    });
  });

  describe('updateConfig', () => {
    it('should update backup configuration', async () => {
      vi.mocked(browser.storage.sync.get).mockResolvedValue({
        gvBackupConfig: { enabled: false, interval: BackupInterval.DISABLED },
      });

      await service.updateConfig({
        enabled: true,
        interval: BackupInterval.DAILY,
      });

      expect(browser.storage.sync.set).toHaveBeenCalled();
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

      // Mock storage.sync.get for folder data
      vi.mocked(browser.storage.sync.get).mockResolvedValue({
        gvFolderData: { test: 'data' },
        gvFolderDataAIStudio: null,
      });

      // Mock URL.createObjectURL and URL.revokeObjectURL for Node.js environment
      const mockUrl = 'blob:mock-url';
      global.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);
      global.URL.revokeObjectURL = vi.fn();

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

      // Create a mock File with text() method
      const mockFile = {
        text: vi.fn().mockResolvedValue(JSON.stringify(backupData)),
        name: 'backup.json',
        type: 'application/json',
      } as unknown as File;

      const result = await service.restoreFromBackup(mockFile);

      expect(result.success).toBe(true);
      expect(result.promptsRestored).toBe(1);
      expect(result.foldersRestored).toBe(true);
    });

    it('should reject invalid backup format', async () => {
      const invalidData = {
        format: 'invalid-format',
        data: {},
      };

      // Create a mock File with text() method
      const mockFile = {
        text: vi.fn().mockResolvedValue(JSON.stringify(invalidData)),
        name: 'invalid.json',
        type: 'application/json',
      } as unknown as File;

      const result = await service.restoreFromBackup(mockFile);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid backup format');
    });
  });
});
