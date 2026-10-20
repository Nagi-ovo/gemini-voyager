/** AI Studio folder buckets under account isolation. Setup lives in `aistudioPersistenceHarness.ts`. */
import { describe, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';

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
  mount,
  prompt,
  scopedBackupNamespace,
  scopedKey,
  selectAccount,
  useIsolation,
} from './aistudioPersistenceHarness';
import { tree, treeText } from './aistudioTreeDriver';

vi.mock('webextension-polyfill', async () => ({
  default: (await import('./aistudioPersistenceMockBrowser')).mockBrowser,
}));

installAIStudioPersistencePage();

describe('AI Studio persistence characterization', () => {
  describe('account scope', () => {
    it('copies the whole legacy bucket into a new account bucket and leaves it in place', async () => {
      useIsolation(true);
      local[GLOBAL_KEY] = fixture();
      const manager = await mount();
      const key = await scopedKey('a');

      expect(manager.activeStorageKey).toBe(key);
      expect(folderWrites(key).map(bytes)).toEqual([bytes(expectedWrite())]);
      expect(bytes(local[GLOBAL_KEY])).toBe(bytes(fixture()));
      expect(bytes(manager.data)).toBe(bytes(expectedWrite()));
      expect(bytes(backupSlot(await scopedBackupNamespace('a'), 'primary'))).toBe(
        bytes(expectedWrite()),
      );
      expect(backupSlot('aistudio-folders', 'primary')).toBeNull();
    });

    it('rebinds only when the account fingerprint changes', async () => {
      useIsolation(true);
      const privateA = folderData('Private a');
      privateA.folderContents['Private a'] = [prompt('p1')];
      local[await scopedKey('a')] = privateA;
      local[await scopedKey('b')] = folderData('Private b');
      const manager = await mount();
      tree.requestRemoval('Private a', 'p1');

      await vi.advanceTimersByTimeAsync(2500);
      expect(tree.pendingQuestion()).not.toBeNull();
      expect(treeText()).toContain('Private a');

      selectAccount('b');
      await vi.advanceTimersByTimeAsync(1200);
      expect(tree.pendingQuestion()).toBeNull();
      expect(manager.activeStorageKey).toBe(await scopedKey('b'));
      expect(treeText()).toContain('Private b');
    });

    it('binds through the next poll after a failed scope resolution', async () => {
      useIsolation(true);
      local[await scopedKey('a')] = folderData('Private a');
      const resolve = accountIsolationService.resolveAccountScope.bind(accountIsolationService);
      vi.spyOn(accountIsolationService, 'resolveAccountScope')
        .mockRejectedValueOnce(new Error('background not listening'))
        .mockImplementation(resolve);
      const manager = await mount();

      expect(manager.data).toEqual({ folders: [], folderContents: {} });
      expect(folderWrites(await scopedKey('a'))).toEqual([]);

      await vi.advanceTimersByTimeAsync(1200);
      expect(manager.activeStorageKey).toBe(await scopedKey('a'));
      expect(treeText()).toContain('Private a');
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
    });
  });
});
