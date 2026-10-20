/** Moving AI Studio's legacy sync folder data into local storage. Setup lives in `aistudioPersistenceHarness.ts`. */
import { describe, expect, it, vi } from 'vitest';

import { migrateAIStudioLegacySync } from '../aistudioImport';
import type { FolderData } from '../types';
import {
  GLOBAL_KEY,
  MIGRATION_MARKER,
  bytes,
  fixture,
  folderData,
  folderWrites,
  installAIStudioPersistencePage,
  local,
  mockBrowser,
  mount,
  prompt,
  scopedKey,
  selectAccount,
  sync,
  useIsolation,
} from './aistudioPersistenceHarness';
import { tree } from './aistudioTreeDriver';

vi.mock('webextension-polyfill', async () => ({
  default: (await import('./aistudioPersistenceMockBrowser')).mockBrowser,
}));

installAIStudioPersistencePage();

describe('AI Studio persistence characterization', () => {
  describe('sync to local migration', () => {
    it('keeps deleted legacy folders and prompts deleted after re-init', async () => {
      sync[GLOBAL_KEY] = fixture();
      const manager = await mount();
      expect(tree.isRendered('f-child')).toBe(true);
      expect(tree.conversationIds('f-late')).toContain('p2');

      tree.requestFolderDeletion('f-child');
      tree.answer(true);
      await vi.advanceTimersByTimeAsync(0);
      tree.requestRemoval('f-late', 'p2');
      tree.answer(true);
      await vi.advanceTimersByTimeAsync(0);
      const deleted = structuredClone(local[GLOBAL_KEY]) as FolderData;
      expect(deleted.folders.some(({ id }) => id === 'f-child')).toBe(false);
      expect(
        deleted.folderContents['f-late'].map(({ conversationId }) => conversationId),
      ).not.toContain('p2');
      manager.destroy();

      const reloaded = await mount();
      expect(reloaded.data).toEqual(deleted);
      expect(tree.isRendered('f-child')).toBe(false);
      expect(tree.conversationIds('f-late')).not.toContain('p2');
      expect(sync[GLOBAL_KEY]).toEqual(fixture());

      reloaded.destroy();
      useIsolation(true);
      selectAccount('b');
      const scoped = await mount();
      expect(scoped.activeStorageKey).toBe(await scopedKey('b'));
      expect(scoped.data).toEqual(deleted);
      expect(local[GLOBAL_KEY]).toEqual(deleted);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('copies sync data into an empty local bucket as is', async () => {
      sync[GLOBAL_KEY] = fixture();
      const manager = await mount();

      expect(bytes(folderWrites(GLOBAL_KEY)[0])).toBe(bytes(fixture()));
      expect(bytes(manager.data)).toBe(bytes(fixture()));
    });

    it('keeps valid local data authoritative and preserves legacy-only items in sync', async () => {
      local[GLOBAL_KEY] = {
        folders: [folderData('Local').folders[0]],
        folderContents: { Local: [prompt('l1')], shared: [prompt('s1')] },
      };
      sync[GLOBAL_KEY] = {
        folders: [folderData('Local').folders[0], folderData('Synced').folders[0]],
        folderContents: { Synced: [prompt('y1')], shared: [prompt('s1'), prompt('s2')] },
      };
      const localBefore = bytes(local[GLOBAL_KEY]);
      const syncBefore = bytes(sync[GLOBAL_KEY]);
      const manager = await mount();

      expect(bytes(manager.data)).toBe(localBefore);
      expect(bytes(local[GLOBAL_KEY])).toBe(localBefore);
      expect(bytes(sync[GLOBAL_KEY])).toBe(syncBefore);
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(mockBrowser.storage.sync.set).not.toHaveBeenCalled();
    });

    it('replaces a local bucket with null contents by the legacy copy before marking it', async () => {
      local[GLOBAL_KEY] = { folders: [], folderContents: null };
      sync[GLOBAL_KEY] = fixture();

      await migrateAIStudioLegacySync(GLOBAL_KEY);

      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
      const writtenKeys = mockBrowser.storage.local.set.mock.calls.map(([values]) =>
        Object.keys(values as Record<string, unknown>),
      );
      expect(writtenKeys).toEqual([[GLOBAL_KEY], [MIGRATION_MARKER]]);
    });

    it('treats a valid empty local bucket as an intentional deletion', async () => {
      const empty = { folders: [], folderContents: {} };
      local[GLOBAL_KEY] = empty;
      sync[GLOBAL_KEY] = fixture();
      const manager = await mount();

      expect(manager.data).toEqual(empty);
      expect(local[GLOBAL_KEY]).toEqual(empty);
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('records completion only after the legacy copy has been accepted', async () => {
      sync[GLOBAL_KEY] = fixture();
      let accept!: () => void;
      const accepted = new Promise<void>((resolve) => {
        accept = resolve;
      });
      let started!: () => void;
      const saving = new Promise<void>((resolve) => {
        started = resolve;
      });
      mockBrowser.storage.local.set.mockImplementation(async (values: Record<string, unknown>) => {
        if (values[GLOBAL_KEY]) {
          started();
          await accepted;
        }
        Object.assign(local, structuredClone(values));
      });
      const migration = migrateAIStudioLegacySync(GLOBAL_KEY);
      await saving;
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();

      accept();
      await migration;
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('retries a failed legacy data save without marking or touching sync', async () => {
      sync[GLOBAL_KEY] = fixture();
      mockBrowser.storage.local.set.mockRejectedValueOnce(new Error('quota'));

      await expect(migrateAIStudioLegacySync(GLOBAL_KEY)).rejects.toThrow('quota');
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      expect(sync[GLOBAL_KEY]).toEqual(fixture());

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
    });

    it('keeps edits after the copy succeeds but the marker save fails', async () => {
      sync[GLOBAL_KEY] = fixture();
      mockBrowser.storage.local.set
        .mockImplementationOnce(async (values: Record<string, unknown>) => {
          Object.assign(local, structuredClone(values));
        })
        .mockRejectedValueOnce(new Error('marker quota'));
      await expect(migrateAIStudioLegacySync(GLOBAL_KEY)).rejects.toThrow('marker quota');
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      const edited = folderData('After interrupted migration');
      local[GLOBAL_KEY] = edited;

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(edited);
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('keeps the completion marker durable when local data is later missing', async () => {
      sync[GLOBAL_KEY] = fixture();
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      delete local[GLOBAL_KEY];
      localStorage.clear();

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(sync[GLOBAL_KEY]).toEqual(fixture());
    });

    it('records completion independently for each target key without rewriting /u/ routes', async () => {
      const key = await scopedKey('a');
      local[GLOBAL_KEY] = folderData('Global');
      const legacy = fixture();
      legacy.folderContents['f-late'][0].url = 'https://aistudio.google.com/u/2/prompts/p1';
      sync[key] = legacy;
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      await migrateAIStudioLegacySync(key);
      expect(local[GLOBAL_KEY]).toEqual(folderData('Global'));
      expect(local[key]).toEqual(legacy);

      delete local[key];
      await migrateAIStudioLegacySync(key);
      expect(local[key]).toBeUndefined();
      expect(sync[key]).toEqual(legacy);
    });

    it('does not write data or a marker after a failed local read', async () => {
      sync[GLOBAL_KEY] = fixture();
      mockBrowser.storage.local.get.mockRejectedValueOnce(new Error('read unavailable'));
      await expect(migrateAIStudioLegacySync(GLOBAL_KEY)).rejects.toThrow('read unavailable');
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      expect(mockBrowser.storage.local.set).not.toHaveBeenCalled();

      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
    });

    it('leaves an invalid legacy source unmarked so a later valid source can be imported', async () => {
      sync[GLOBAL_KEY] = { folders: 'corrupt', folderContents: {} };
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toBeUndefined();
      expect(local[MIGRATION_MARKER]).toBeUndefined();
      expect(sync[GLOBAL_KEY]).toEqual({ folders: 'corrupt', folderContents: {} });

      sync[GLOBAL_KEY] = fixture();
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
    });

    it('preserves an own __proto__ legacy bucket through the raw copy', async () => {
      const legacy = JSON.parse(
        JSON.stringify(folderData('PROTO')).replaceAll('PROTO', '__proto__'),
      ) as FolderData;
      legacy.folderContents['__proto__'] = [prompt('p1')];
      sync[GLOBAL_KEY] = legacy;
      await migrateAIStudioLegacySync(GLOBAL_KEY);
      const copied = local[GLOBAL_KEY] as FolderData;

      expect(copied).toEqual(legacy);
      expect(Object.getPrototypeOf(copied.folderContents)).toBe(Object.prototype);
      expect(Object.hasOwn(copied.folderContents, '__proto__')).toBe(true);
      expect(copied.folderContents['__proto__']).toEqual([prompt('p1')]);
    });

    it('keeps a save from another tab while the legacy source read is pending', async () => {
      let finish!: (value: Record<string, unknown>) => void;
      const pending = new Promise<Record<string, unknown>>((resolve) => {
        finish = resolve;
      });
      mockBrowser.storage.sync.get.mockReturnValueOnce(pending);
      const migration = migrateAIStudioLegacySync(GLOBAL_KEY);
      await Promise.resolve();
      local[GLOBAL_KEY] = folderData('Saved by another tab');
      finish({ [GLOBAL_KEY]: fixture() });
      await migration;

      expect(local[GLOBAL_KEY]).toEqual(folderData('Saved by another tab'));
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(folderWrites(GLOBAL_KEY)).toEqual([]);
    });

    it('serializes overlapping first imports with the native per-key lock', async () => {
      // Implement Web Locks mutual exclusion, while keeping the real storage migration.
      let queue = Promise.resolve();
      vi.stubGlobal('navigator', {
        locks: {
          request: (_key: string, operation: () => Promise<void>) => {
            const result = queue.then(operation);
            queue = result.catch(() => {});
            return result;
          },
        },
      });
      sync[GLOBAL_KEY] = fixture();

      await Promise.all([
        migrateAIStudioLegacySync(GLOBAL_KEY),
        migrateAIStudioLegacySync(GLOBAL_KEY),
      ]);
      expect(local[GLOBAL_KEY]).toEqual(fixture());
      expect(local[MIGRATION_MARKER]).toBe(true);
      expect(folderWrites(GLOBAL_KEY)).toHaveLength(1);
    });
  });
});
