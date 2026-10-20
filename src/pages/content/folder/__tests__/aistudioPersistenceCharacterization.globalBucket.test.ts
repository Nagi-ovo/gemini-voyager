/** Saving and loading AI Studio's global folder bucket. Setup lives in `aistudioPersistenceHarness.ts`. */
import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { toastDriver } from '@/tests/toastDriver';

import {
  GLOBAL_KEY,
  backupSlot,
  bytes,
  expectedWrite,
  fixture,
  folderData,
  folderWrites,
  installAIStudioPersistencePage,
  local,
  mockBrowser,
  mount,
  notificationText,
  rootFolderOrder,
  sync,
} from './aistudioPersistenceHarness';
import { ROOT, nameInput, tree } from './aistudioTreeDriver';

vi.mock('webextension-polyfill', async () => ({
  default: (await import('./aistudioPersistenceMockBrowser')).mockBrowser,
}));

installAIStudioPersistencePage();

describe('AI Studio persistence characterization', () => {
  describe('global bucket', () => {
    it('loads stored data raw, without normalizing, pruning or writing back', async () => {
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();

      expect(manager.activeStorageKey).toBe(GLOBAL_KEY);
      expect(bytes(manager.data)).toBe(bytes(fixture()));
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
      // Root folders render by createdAt, not by name or sortIndex.
      expect(rootFolderOrder()).toEqual(['f-early', 'f-late', 'f-nokey']);
      // The duplicate reference stays visible; root conversations live in __uncategorized__.
      expect(tree.conversationIds('f-late')).toHaveLength(3);
      expect(tree.conversationIds(ROOT)).toEqual(['p4', 'p5']);
      expect(bytes(backupSlot('aistudio-folders', 'primary'))).toBe(bytes(fixture()));
      // Folder data never lands in page localStorage.
      expect(localStorage.getItem(GLOBAL_KEY)).toBeNull();
    });

    it('saves exactly the loaded content, keeping orphan, root and duplicate buckets', async () => {
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();

      await expect(manager.save()).resolves.toBe(true);

      expect(folderWrites(GLOBAL_KEY).map(bytes)).toEqual([bytes(expectedWrite())]);
      expect(bytes(local[GLOBAL_KEY])).toBe(bytes(expectedWrite()));
      expect(bytes(backupSlot('aistudio-folders', 'primary'))).toBe(bytes(expectedWrite()));
      expect(bytes(backupSlot('aistudio-folders', 'emergency'))).toBe(bytes(expectedWrite()));
      expect(localStorage.getItem(GLOBAL_KEY)).toBeNull();
    });

    it.each([
      { language: 'zh', message: '无法保存文件夹更改，请重试。' },
      { language: 'ja', message: 'フォルダの変更を保存できませんでした。もう一度お試しください。' },
    ])(
      'a failed folder save shows a visible notice in $language',
      async ({ language, message }) => {
        sync[StorageKeys.LANGUAGE] = language;
        local[GLOBAL_KEY] = folderData('Kept');
        await mount();
        mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));

        document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
        const input = nameInput()!;
        input.value = 'Unsaved folder';
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        await vi.advanceTimersByTimeAsync(0);

        expect(toastDriver.all()).toMatchObject([{ message, tone: 'error' }]);
      },
    );

    it('reports a failed write once without retrying it', async () => {
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();
      const writesBefore = mockBrowser.storage.local.set.mock.calls.length;
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));

      await expect(manager.save()).resolves.toBe(false);

      expect(mockBrowser.storage.local.set.mock.calls.length - writesBefore).toBe(1);
      expect(notificationText()).toContain('Could not save folder changes');
      expect(bytes(local[GLOBAL_KEY])).toBe(bytes(fixture()));
    });
  });
});
