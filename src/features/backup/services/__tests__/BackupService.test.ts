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

    // Setup browser.downloads mock
    if (!browser.downloads) {
      (browser as any).downloads = {};
    }
    (browser.downloads as any).download = vi.fn().mockResolvedValue(1);
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
      // New format includes full timestamp: YYYY-MM-DDTHH-MM-SS-mmmZ
      expect(result.filename).toMatch(/gemini-voyager-backup-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.json/);
    });
  });

  // Note: Restore functionality has been moved to Popup.tsx
  // because it requires access to localStorage which is not available in service workers.
  // The popup can directly access both localStorage (for prompts) and chrome.storage.sync (for folders).
});
