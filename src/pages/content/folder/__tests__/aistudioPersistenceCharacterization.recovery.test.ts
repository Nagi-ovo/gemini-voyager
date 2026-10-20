/** Recovering AI Studio folder data from backups, with the notices shown. Setup lives in `aistudioPersistenceHarness.ts`. */
import { describe, expect, it, vi } from 'vitest';

import { DataBackupService } from '@/core/services/DataBackupService';
import { StorageKeys } from '@/core/types/common';
import { validateFolderData } from '@/features/folder/model/folderData';
import { toastDriver } from '@/tests/toastDriver';

import type { FolderData } from '../types';
import {
  GLOBAL_KEY,
  bytes,
  expectedWrite,
  fixture,
  folderWrites,
  installAIStudioPersistencePage,
  local,
  mockBrowser,
  mount,
  notificationText,
  sync,
} from './aistudioPersistenceHarness';

vi.mock('webextension-polyfill', async () => ({
  default: (await import('./aistudioPersistenceMockBrowser')).mockBrowser,
}));

installAIStudioPersistencePage();

describe('AI Studio persistence characterization', () => {
  describe('recovery', () => {
    function seedPrimaryBackup(namespace: string, data: FolderData): void {
      new DataBackupService<FolderData>(namespace, validateFolderData).createPrimaryBackup(data);
    }

    it.each([
      { language: 'en', message: 'Folder data recovered from backup.' },
      { language: 'zh', message: '已从备份恢复文件夹数据。' },
    ])(
      'restores a missing bucket with a translated notice in $language',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        seedPrimaryBackup('aistudio-folders', expectedWrite());
        const manager = await mount();

        expect(bytes(manager.data)).toBe(bytes(expectedWrite()));
        expect(toastDriver.find(message)?.tone).toBe('warning');
        await vi.advanceTimersByTimeAsync(6999);
        expect(notificationText()).toContain(message);
        await vi.advanceTimersByTimeAsync(1);
        expect(toastDriver.find(message)).toBeUndefined();
        expect(folderWrites(GLOBAL_KEY).map(bytes)).toEqual([bytes(expectedWrite())]);
      },
    );

    it.each([
      {
        language: 'en',
        message:
          '⚠️ Warning: Failed to load folder data. Your folders may have been corrupted. Please check the browser console for details and try restoring from backup if available.',
      },
      {
        language: 'zh',
        message:
          '⚠️ 警告：无法加载文件夹数据。您的文件夹可能已损坏。请检查浏览器控制台以获取详细信息，并在可用时尝试从备份恢复。',
      },
    ])(
      'starts empty with a translated warning in $language when corrupt storage has no backup',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        local[GLOBAL_KEY] = { folders: 'corrupt', folderContents: {} };
        const manager = await mount();

        expect(manager.data).toEqual({ folders: [], folderContents: {} });
        expect(toastDriver.find(message)?.tone).toBe('error');
        await vi.advanceTimersByTimeAsync(4999);
        expect(notificationText()).toContain(message);
        await vi.advanceTimersByTimeAsync(1);
        expect(toastDriver.find(message)).toBeUndefined();
        expect(folderWrites(GLOBAL_KEY)).toEqual([]);
        expect(document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')?.disabled).toBe(
          false,
        );
      },
    );

    it.each([
      { language: 'en', message: 'Could not load folder data. Folders are read-only for now.' },
      { language: 'zh', message: '无法加载文件夹数据，暂时只能查看，无法编辑。' },
    ])(
      'shows a translated read-only notice in $language when a reload fails',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        local[GLOBAL_KEY] = fixture();
        const manager = await mount();
        localStorage.clear();
        mockBrowser.storage.local.get.mockRejectedValueOnce(new Error('storage unavailable'));

        await manager.load();

        expect(bytes(manager.data)).toBe(bytes(fixture()));
        expect(toastDriver.find(message)?.tone).toBe('error');
        expect(document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')?.disabled).toBe(
          true,
        );
        expect(folderWrites(GLOBAL_KEY)).toEqual([]);
      },
    );
  });

  it('keeps a failed edit with a Chinese recovery notice when storage is corrupt', async () => {
    sync[StorageKeys.LANGUAGE] = 'zh';
    local[GLOBAL_KEY] = fixture();
    const manager = await mount();
    manager.data.folders[0].name = 'Unsaved edit';
    mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));
    expect(await manager.save()).toBe(false);
    local[GLOBAL_KEY] = { folders: 'corrupt', folderContents: {} };

    await manager.load();

    expect(manager.data.folders[0].name).toBe('Unsaved edit');
    expect(toastDriver.find('无法加载文件夹数据，已保留当前文件夹。')?.tone).toBe('error');
    expect((local[GLOBAL_KEY] as FolderData).folders[0].name).toBe('Unsaved edit');
  });
});
