// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chat.deepseek.com/a/chat/s/abc" }
/**
 * A newer remote catalog for one site's host can carry a `site.json` whose id
 * names another folder site. Its folders must stay closed on that page: no
 * bucket read into it, no edit, and no recovery copy written into the page's
 * own localStorage, which the host page can read.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FolderData } from '@/core/types/folder';
import { FOLDER_PLATFORMS, type FrozenFolderPlatform } from '@/features/folder/platforms';
import { folderSiteForPage } from '@/features/folder/sites/folderSiteTable';
import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { SiteAdapter } from '@/features/plugins/types';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

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

const STORED: FolderData = {
  folders: [
    { id: 'f1', name: 'Private', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: { f1: [] },
};

/** DeepSeek's own sidebar data under another folder site's id, as a poisoned file would carry it. */
function claiming(id: FrozenFolderPlatform): SiteAdapter {
  return { ...requireBundledSiteAdapter('deepseek'), id };
}

let memory: MemoryStorage;
let original: typeof chrome.storage;
let scope: PluginScope;

beforeAll(async () => {
  original = globalThis.chrome.storage;
  globalThis.chrome.storage = createMemoryStorage().api;
  await initI18n();
  globalThis.chrome.storage = original;
});

beforeEach(() => {
  memory = createMemoryStorage();
  globalThis.chrome.storage = memory.api;
  localStorage.clear();
  scope = new PluginScope();
  document.body.innerHTML = `<div class="sidebar"><div class="ds-scroll-area"><div>
    <a href="/a/chat/s/abc"><div>Chat</div></a></div></div></div>`;
});

afterEach(async () => {
  await scope.dispose();
  document.body.replaceChildren();
  globalThis.chrome.storage = original;
});

describe("another folder site's id claimed from DeepSeek's host", () => {
  it.each(['gemini', 'aistudio', 'chatgpt', 'claude'] as const)(
    'opens no %s bucket and writes no backup',
    async (id) => {
      const key = FOLDER_PLATFORMS[id].folderStorageKey;
      memory.values.local.set(key, structuredClone(STORED));
      const counted: number[] = [];

      const handle = foldersPrimitive.activate(
        scope,
        {},
        {
          doc: document,
          adapter: claiming(id),
          pluginId: 'voyager.deepseek-folders',
          settings: {},
          setTargetCounter: (count) => counted.push(count()),
        },
      );
      await settle(30);

      expect(handle).toBeUndefined();
      expect(counted).toEqual([0]);
      expect(memory.writes).toEqual([]);
      expect(memory.values.local.get(key)).toEqual(STORED);
      expect(Object.keys(localStorage).filter((name) => name.startsWith('gvBackup_'))).toEqual([]);
      expect(document.querySelector('[class*="gv-"]')).toBeNull();
    },
  );

  it("opens DeepSeek's bucket only on DeepSeek's own host", () => {
    expect(folderSiteForPage('deepseek', location.href)?.site).toBe('deepseek');
    expect(folderSiteForPage('deepseek', 'https://claude.ai/chat/abc')).toBeNull();
    expect(folderSiteForPage('deepseek', 'http://chat.deepseek.com/a/chat/s/abc')).toBeNull();
  });

  it('keeps every bundled host each frozen site has always run on', () => {
    const hosts: Record<FrozenFolderPlatform, string[]> = {
      gemini: ['gemini.google.com', 'business.gemini.google'],
      aistudio: ['aistudio.google.com', 'aistudio.google.cn'],
      chatgpt: ['chatgpt.com', 'chat.openai.com'],
      claude: ['claude.ai'],
      deepseek: ['chat.deepseek.com'],
    };
    for (const [id, own] of Object.entries(hosts)) {
      for (const host of own) expect(folderSiteForPage(id, `https://${host}/`)?.site).toBe(id);
    }
    // Claude's artifact frames are matched by a wildcard and name no conversation.
    expect(folderSiteForPage('claude', 'https://x.frame.claudeusercontent.com/')).toBeNull();
  });
});
