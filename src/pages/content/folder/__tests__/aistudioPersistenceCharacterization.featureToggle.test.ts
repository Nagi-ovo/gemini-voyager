/** AI Studio folder persistence across turning the folder feature off and on. Setup lives in `aistudioPersistenceHarness.ts`. */
import { describe, expect, it, vi } from 'vitest';

import { toastDriver } from '@/tests/toastDriver';

import type { FolderData } from '../types';
import {
  GLOBAL_KEY,
  emitStorageChange,
  folderData,
  installAIStudioPersistencePage,
  local,
  mockBrowser,
  mount,
} from './aistudioPersistenceHarness';
import { nameInput, treeText } from './aistudioTreeDriver';

vi.mock('webextension-polyfill', async () => ({
  default: (await import('./aistudioPersistenceMockBrowser')).mockBrowser,
}));

installAIStudioPersistencePage();

describe('AI Studio persistence characterization', () => {
  describe('feature toggle', () => {
    it('can edit and save again after the folder feature is disabled and re-enabled', async () => {
      local[GLOBAL_KEY] = folderData('Kept');
      await mount();

      emitStorageChange({ geminiFolderEnabled: { newValue: false } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('.gv-aistudio-folder-tree')).toBeNull();

      emitStorageChange({ geminiFolderEnabled: { newValue: true } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      expect(treeText()).toContain('Kept');

      document.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
      const input = nameInput()!;
      input.value = 'After re-enable';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await vi.advanceTimersByTimeAsync(0);

      expect((local[GLOBAL_KEY] as FolderData).folders.map((folder) => folder.name)).toContain(
        'After re-enable',
      );
      expect(localStorage.getItem(GLOBAL_KEY)).toBeNull();
    });

    it('still reports a failed save after the folder feature is turned off and on', async () => {
      local[GLOBAL_KEY] = folderData('Kept');
      const manager = await mount();
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));
      await manager.save();
      expect(toastDriver.find('Could not save folder changes')?.tone).toBe('error');

      emitStorageChange({ geminiFolderEnabled: { newValue: false } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      // Turning the feature off takes its notices with it.
      expect(toastDriver.all()).toEqual([]);

      emitStorageChange({ geminiFolderEnabled: { newValue: true } }, 'sync');
      await vi.advanceTimersByTimeAsync(0);
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));
      await manager.save();
      expect(toastDriver.messages()).toEqual(['Could not save folder changes. Please try again.']);
    });
  });
});
