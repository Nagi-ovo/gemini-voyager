/**
 * Repository resumption over what storage holds, for each folder site: corrupt
 * external events and buckets, empty sibling buckets, legacy records and
 * untitled conversations keep the failed edit and every saved conversation.
 * Accepted writes racing resumption live in `folderRepositoryResume.test.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import { buildScopedStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { settle } from '@/tests/memoryStorage';

import {
  RESUME_SITES,
  data,
  feature,
  installFolderRepositoryResume,
  memory,
  ready,
  repository,
  resume,
} from './folderRepositoryResumeHarness';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
  },
}));

installFolderRepositoryResume();

describe.each(RESUME_SITES)('$site repository resumption', ({ config, conversationId, url }) => {
  it.each([
    { symptom: 'missing folder structure', value: { corrupted: true } },
    { symptom: 'removed bucket', value: undefined },
    { symptom: 'null bucket', value: null },
    { symptom: 'false bucket', value: false },
    { symptom: 'empty string bucket', value: '' },
  ])('keeps an unsaved rename after a corrupt external event: $symptom', async ({ value }) => {
    await ready(config);
    const set = memory.api.local.set.bind(memory.api.local);
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) throw new Error('Rename failed');
      await set(items);
    });
    repository.data = data('Mine');
    await expect(repository.saveData()).resolves.toBe(false);
    writes.mockRestore();
    localStorage.removeItem(config.storageKey);
    memory.external('local', config.storageKey, value);
    await settle(60);
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(data('Mine'));
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(data('Mine'));
  });

  it.each([
    { corruption: 'array contents', contents: [] },
    { corruption: 'null contents', contents: null },
    { corruption: 'non-plain contents', contents: new Date(0) },
    { corruption: 'non-array bucket', contents: { folder: { conversationId: 'c1' } } },
    { corruption: 'unlisted empty bucket', contents: { orphan: null } },
    { corruption: 'null reference', contents: { folder: [null] } },
    { corruption: 'array reference', contents: { folder: [[]] } },
  ])(
    'keeps the failed rename and saved conversations when resumed storage has $corruption',
    async ({ contents }) => {
      const initial = data('Initial');
      initial.folderContents.folder = [
        { conversationId, title: 'Saved conversation', url, addedAt: 1, sortIndex: 0 },
      ];
      const recovery = vi.fn();
      await ready(config, recovery, initial);
      const edited = structuredClone(initial);
      edited.folders[0].name = 'Mine';
      const set = memory.api.local.set.bind(memory.api.local);
      const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
        if (config.storageKey in items) throw new Error('Rename failed');
        await set(items);
      });
      repository.data = edited;
      await expect(repository.saveData()).resolves.toBe(false);
      feature.enabled = false;
      repository.suspend();
      memory.external('local', config.storageKey, { ...initial, folderContents: contents });
      await settle(30);
      writes.mockRestore();
      await resume();
      expect(repository.canEdit).toBe(true);
      expect(recovery).toHaveBeenCalledWith('kept');
      expect(repository.data).toEqual(edited);
      await expect(repository.saveData()).resolves.toBe(true);
      expect(memory.values.local.get(config.storageKey)).toEqual(edited);
    },
  );

  it.each([null, false, 0, ''])(
    "keeps a sibling folder's conversations when another folder's bucket is %j",
    async (emptyBucket) => {
      let storageKey = config.storageKey;
      if (config.platform === 'gemini') {
        memory.values.sync.set(StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI, true);
        storageKey = buildScopedStorageKey(config.storageKey, 'default');
      }
      const recovery = vi.fn();
      await ready(config, recovery, data('Old backup'), storageKey);
      expect(repository.storageKey).toBe(storageKey);
      feature.enabled = false;
      repository.suspend();
      const folders = [
        { ...data('Empty').folders[0], id: 'empty' },
        { ...data('New').folders[0], id: 'new', sortIndex: 1 },
      ];
      const references = [{ conversationId, title: '', url, addedAt: 1, sortIndex: 0 }];
      memory.external('local', storageKey, {
        folders,
        folderContents: { empty: emptyBucket, new: references },
      });
      await settle(30);
      await resume();
      expect(repository.canEdit).toBe(true);
      expect(recovery).not.toHaveBeenCalled();
      expect(repository.data).toMatchObject({ folders, folderContents: { new: references } });
      await expect(repository.saveData()).resolves.toBe(true);
      expect(memory.values.local.get(storageKey)).toMatchObject({
        folders,
        folderContents: { new: references },
      });
    },
  );

  it('loads and saves legacy records with empty titles and missing optional metadata', async () => {
    const legacy: FolderData = {
      folders: [
        {
          id: 'folder',
          name: 'Legacy',
          parentId: null,
          isExpanded: true,
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: 'empty',
          name: 'Empty',
          parentId: null,
          isExpanded: false,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      folderContents: {
        folder: [{ conversationId, title: '', url, addedAt: 1 }],
        [config.rootBucketId]: [{ conversationId: 'root', title: '', url, addedAt: 2 }],
      },
    };
    const recovery = vi.fn();
    await ready(config, recovery, legacy);
    feature.enabled = false;
    repository.suspend();
    await resume();
    expect(repository.canEdit).toBe(true);
    expect(recovery).not.toHaveBeenCalled();
    expect(repository.data).toMatchObject(legacy);
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(repository.data);
    expect(memory.values.local.get(config.storageKey)).toMatchObject(legacy);
  });

  it('a valid restored conversation with an empty title survives a failed rename on resume', async () => {
    await ready(config);
    const set = memory.api.local.set.bind(memory.api.local);
    const writes = vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
      if (config.storageKey in items) throw new Error('Rename failed');
      await set(items);
    });
    repository.data = data('Mine');
    await expect(repository.saveData()).resolves.toBe(false);
    feature.enabled = false;
    repository.suspend();
    const restored = data('Imported');
    restored.folderContents.folder = [
      {
        conversationId: 'untitled',
        title: '',
        url: 'https://aistudio.google.com/prompts/untitled',
        addedAt: 1,
        sortIndex: 0,
      },
    ];
    memory.external('local', config.storageKey, restored);
    await settle(30);
    writes.mockRestore();
    await resume();
    expect(repository.canEdit).toBe(true);
    expect(repository.data).toEqual(restored);
    await expect(repository.saveData()).resolves.toBe(true);
    expect(memory.values.local.get(config.storageKey)).toEqual(restored);
  });

  it.each([
    { edit: 'rename', externalChange: false },
    { edit: 'last-folder deletion', externalChange: false },
    { edit: 'rename', externalChange: true },
    { edit: 'last-folder deletion', externalChange: true },
  ])(
    'recovers corrupt storage after a failed $edit, with observed external change: $externalChange',
    async ({ edit, externalChange }) => {
      await ready(config);
      const edited =
        edit === 'rename' ? data('Unsaved rename') : { folders: [], folderContents: {} };
      const set = memory.api.local.set.bind(memory.api.local);
      let failFolderWrites = true;
      vi.spyOn(memory.api.local, 'set').mockImplementation(async (items) => {
        if (config.storageKey in items && failFolderWrites) throw new Error('Folder write failed');
        await set(items);
      });
      repository.data = edited;
      await expect(repository.saveData()).resolves.toBe(false);
      expect(repository.data).toEqual(edited);
      expect(memory.values.local.get(config.storageKey)).toEqual(data('Initial'));
      feature.enabled = false;
      repository.suspend();
      failFolderWrites = false;
      if (externalChange) memory.external('local', config.storageKey, { corrupted: true });
      else memory.values.local.set(config.storageKey, { corrupted: true });
      await settle(30);
      expect(repository.canEdit).toBe(false);

      await resume();
      expect(repository.canEdit).toBe(true);
      const recovered = edited;
      expect(repository.data).toEqual(recovered);
      expect(memory.values.local.get(config.storageKey)).toEqual(recovered);
    },
  );
});
