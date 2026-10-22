// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://claude.ai/chat/abc" }
/** DeepSeek's id claimed by a poisoned `site.json` on Claude's host (see `foreignHostClaim.test.ts`). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';

import { foldersPrimitive } from '../index';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id', getURL: (path: string) => path },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const STORED = { folders: [], folderContents: { root: [] } };

let memory: MemoryStorage;
let original: typeof chrome.storage;
let scope: PluginScope;

beforeEach(() => {
  original = globalThis.chrome.storage;
  memory = createMemoryStorage();
  globalThis.chrome.storage = memory.api;
  localStorage.clear();
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  globalThis.chrome.storage = original;
});

describe("DeepSeek's id claimed from Claude's host", () => {
  it('opens no deepseek bucket and writes no backup', async () => {
    memory.values.local.set(StorageKeys.FOLDER_DATA_DEEPSEEK, structuredClone(STORED));
    const counted: number[] = [];

    const handle = foldersPrimitive.activate(
      scope,
      {},
      {
        doc: document,
        adapter: { ...requireBundledSiteAdapter('claude'), id: 'deepseek' },
        pluginId: 'voyager.claude-folders',
        settings: {},
        setTargetCounter: (count) => counted.push(count()),
      },
    );
    await settle(30);

    expect(handle).toBeUndefined();
    expect(counted).toEqual([0]);
    expect(memory.writes).toEqual([]);
    expect(memory.values.local.get(StorageKeys.FOLDER_DATA_DEEPSEEK)).toEqual(STORED);
    expect(Object.keys(localStorage).filter((name) => name.startsWith('gvBackup_'))).toEqual([]);
  });
});
