import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';

import { SiteFolderStore } from '../SiteFolderStore';
import { CHATGPT_FOLDER_CONFIG } from '../pluginSiteFolderConfigs';
import type { SyncMessageListener } from '../syncMessageListener';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
  },
}));

function data(name: string): FolderData {
  return {
    folders: [
      { id: 'f', name, parentId: null, isExpanded: true, sortIndex: 0, createdAt: 1, updatedAt: 1 },
    ],
    folderContents: { f: [] },
  };
}

let memory: MemoryStorage;
let original: typeof chrome.storage;

beforeEach(() => {
  memory = createMemoryStorage();
  original = chrome.storage;
  chrome.storage = memory.api;
  localStorage.clear();
  vi.mocked(chrome.runtime.onMessage.addListener).mockClear();
});

afterEach(() => {
  chrome.storage = original;
});

describe('a catalog site tab after a popup cloud restore', () => {
  it('shows the restored folders when the popup asks, without waiting for the storage echo', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, data('Before'));
    const store = new SiteFolderStore(CHATGPT_FOLDER_CONFIG);
    await store.init();
    const listener = vi.mocked(chrome.runtime.onMessage.addListener).mock.calls.at(-1)?.[0] as
      | SyncMessageListener
      | undefined;
    // The restore's write, before its change event reached this tab.
    memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, data('Restored'));

    const reply = vi.fn();
    expect(listener?.({ type: 'gv.folders.reload' }, {}, reply)).toBe(true);
    await settle(20);

    expect(reply).toHaveBeenCalledWith({ ok: true });
    expect(store.data.folders[0]?.name).toBe('Restored');
    store.destroy();
  });
});
