import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { exportChatGptFolders } from '@/features/folder/sites/chatgptTransfer';
import type { FolderData } from '@/pages/content/folder/types';

import { ChatGptFolderStore } from '../ChatGptFolderStore';
import { createLegacyChatGptCommands } from '../legacyChatGptCommands';
import { type MemoryStorage, createMemoryStorage, settle } from './memoryStorage';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id' },
  },
}));

const ID = '68a1f2c3-0b4d-8001-9e2f-1a2b3c4d5e6f';
const folder = (id: string, name: string) => ({
  id,
  name,
  parentId: null,
  isExpanded: true,
  createdAt: 1,
  updatedAt: 1,
});
const FILE: FolderData = {
  folders: [folder('f1', 'Work')],
  folderContents: {
    f1: [
      {
        conversationId: `chatgpt:conv:${ID}`,
        title: 'Plan',
        url: `https://chatgpt.com/c/${ID}`,
        addedAt: 1,
      },
    ],
    [ROOT_CONVERSATIONS_ID]: [],
  },
};

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let store: ChatGptFolderStore;

beforeEach(async () => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  store = new ChatGptFolderStore();
  await store.init();
  await settle();
});

afterEach(() => {
  store.destroy();
  globalThis.chrome.storage = originalStorage;
  vi.restoreAllMocks();
});

const stored = () => memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT) as FolderData;

describe('ChatGPT legacy FolderCommands import', () => {
  it('saves a ChatGPT file with its stats', async () => {
    const outcome = await createLegacyChatGptCommands(store).runBulk({
      kind: 'importFile',
      payload: JSON.parse(JSON.stringify(exportChatGptFolders(FILE))),
      strategy: 'merge',
      source: 'file',
    });

    expect(outcome).toMatchObject({
      kind: 'saved',
      stats: { foldersImported: 1, conversationsImported: 1 },
    });
    expect(stored().folders.map((f) => f.name)).toEqual(['Work']);
  });

  it('refuses another site’s file with the wrong-site notice and writes nothing', async () => {
    const before = memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT);
    const outcome = await createLegacyChatGptCommands(store).runBulk({
      kind: 'importFile',
      payload: { ...exportChatGptFolders(FILE), platform: 'gemini' },
      strategy: 'merge',
      source: 'file',
    });

    expect(outcome).toMatchObject({
      kind: 'rejected',
      messageKey: 'folder_import_wrong_site',
    });
    expect(memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT)).toEqual(before);
  });

  it('refuses a replace import instead of merging it', async () => {
    const before = memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT);
    const outcome = await createLegacyChatGptCommands(store).runBulk({
      kind: 'importFile',
      payload: JSON.parse(JSON.stringify(exportChatGptFolders(FILE))),
      strategy: 'replace',
      source: 'file',
    });

    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'unsupported' });
    expect(memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT)).toEqual(before);
  });
});

describe('ChatGPT legacy FolderCommands folder moves', () => {
  /** Work › Notes › Archive, and Personal. */
  const NESTED: FolderData = {
    folders: [
      folder('work', 'Work'),
      { ...folder('notes', 'Notes'), parentId: 'work' },
      { ...folder('archive', 'Archive'), parentId: 'notes' },
      folder('personal', 'Personal'),
    ],
    folderContents: {
      work: [],
      notes: [],
      archive: [],
      personal: [],
      [ROOT_CONVERSATIONS_ID]: [],
    },
  };

  beforeEach(async () => {
    await store.replaceData(structuredClone(NESTED));
    await settle();
  });

  it('nests a folder with subfolders past the depth a new folder may have, as Gemini does', async () => {
    const outcome = await createLegacyChatGptCommands(store).run({
      kind: 'moveFolder',
      folderId: 'work',
      parentId: 'personal',
    });
    await settle();

    expect(outcome).toEqual({ kind: 'unconfirmed' });
    const parents = Object.fromEntries(stored().folders.map((f) => [f.id, f.parentId]));
    // Archive lands on a fourth level, one below what a new folder may reach.
    expect(parents).toMatchObject({
      work: 'personal',
      notes: 'work',
      archive: 'notes',
      personal: null,
    });
  });

  it('creates a third level, then reports the depth limit below it and creates nothing', async () => {
    const commands = createLegacyChatGptCommands(store);
    await commands.run({
      kind: 'createFolder',
      folderId: 'ignored',
      name: 'Drafts',
      parentId: 'notes',
    });
    await settle();
    const drafts = stored().folders.find((f) => f.name === 'Drafts');
    expect(drafts?.parentId).toBe('notes');

    const outcome = await commands.run({
      kind: 'createFolder',
      folderId: 'ignored-too',
      name: 'Too deep',
      parentId: drafts!.id,
    });
    await settle();

    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'depth_limit' });
    expect(stored().folders.map((f) => f.name)).toEqual([
      'Work',
      'Notes',
      'Archive',
      'Personal',
      'Drafts',
    ]);
  });

  it('refuses to nest a folder under one that is gone', async () => {
    const outcome = await createLegacyChatGptCommands(store).run({
      kind: 'moveFolder',
      folderId: 'personal',
      parentId: 'deleted-elsewhere',
    });

    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'target_missing' });
    expect(store.data.folders.find((f) => f.id === 'personal')?.parentId).toBeNull();
  });
});
