// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chat.nimbus.test/" }
/**
 * Folders on Nimbus, a site the bundle describes only by data: its `site.json`
 * and its folders `plugin.json` (`dataSiteCatalog.ts`), no TypeScript. It runs
 * through the page's own path (`PluginHost` and the bundled source), and its
 * bucket, backups and folder file take every name from its id.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { DataBackupService } from '@/core/services/DataBackupService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { validateFolderData } from '@/features/folder/model/folderData';
import {
  type DerivedFolderPlatform,
  FOLDER_PLATFORMS,
  FOLDER_PLATFORM_IDS,
} from '@/features/folder/platforms';
import pinned from '@/features/folder/sites/__tests__/fixtures/folderSiteTable.json';
import { folderSiteForPage } from '@/features/folder/sites/folderSiteTable';
import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

import { siteFoldersFromData } from '../siteData';
import type { SiteFoldersAdapter } from '../types';
import { DATA_SITE } from './dataSiteCatalog';

vi.mock('@/features/plugins/catalog/sites', async (importOriginal) =>
  (await import('./dataSiteCatalog')).catalogWithDataSite(await importOriginal()),
);

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id', getURL: (path: string) => path },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const SECTION = '.gv-nimbus-folder-section';
const FROZEN = ['gemini', 'aistudio', 'chatgpt', 'claude', 'deepseek'] as const;

const entry = (id: string, title: string, origin: string = DATA_SITE.origin) => ({
  conversationId: `${DATA_SITE.id}:conv:${id}`,
  title,
  url: `${origin}/c/${id}`,
  addedAt: 1,
});

function folders(name: string, entries = [entry('abc-1', 'Alpha')]): FolderData {
  return {
    folders: [{ id: 'f1', name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
    folderContents: { f1: entries, [ROOT_CONVERSATIONS_ID]: [] },
  };
}

let memory: MemoryStorage;
let original: typeof chrome.storage;
let host: PluginHost | null = null;

function installStorage(data?: FolderData): void {
  memory = createMemoryStorage();
  globalThis.chrome.storage = memory.api;
  if (data) memory.values.local.set(DATA_SITE.storageKey, structuredClone(data));
  memory.values.local.set(StorageKeys.PLUGINS_STATE, {
    [DATA_SITE.pluginId]: { enabled: true, installedAt: 1 },
  });
}

function mountSidebar(): void {
  const nav = document.createElement('nav');
  nav.className = 'history';
  nav.innerHTML = `<ul class="chats">
    <li class="chat"><a href="/c/abc-1"><span class="label">Alpha</span></a></li>
    <li class="chat"><a href="/c/abc-2"><span class="label">Beta</span></a></li>
  </ul>`;
  document.body.append(nav);
}

async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await settle(20);
}

function site(): SiteFoldersAdapter {
  const built = siteFoldersFromData(requireBundledSiteAdapter(DATA_SITE.id));
  if (!built) throw new Error('the data site must give folders on its own host');
  return built;
}

beforeAll(async () => {
  original = globalThis.chrome.storage;
  installStorage();
  await initI18n();
  globalThis.chrome.storage = original;
});

beforeEach(() => {
  history.replaceState(null, '', '/');
  localStorage.clear();
});

afterEach(async () => {
  host?.stop();
  host = null;
  await nextPass();
  document.body.replaceChildren();
  globalThis.chrome.storage = original;
  vi.restoreAllMocks();
});

describe('folders on a site described only by data', () => {
  it("shows the folders stored under the site's own key in its sidebar", async () => {
    installStorage(folders('Work'));
    mountSidebar();
    host = new PluginHost({
      url: location.href,
      sources: [new BundledCatalogPluginSource()],
      doc: document,
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
    await host.start();
    await nextPass();

    const sections = document.querySelectorAll<HTMLElement>(SECTION);
    expect(sections).toHaveLength(1);
    expect(sections[0].nextElementSibling).toBe(document.querySelector('ul.chats'));
    expect(sections[0].shadowRoot?.textContent).toContain('Work');
    // No frozen site's bucket is read into or written by another site's folders.
    const frozenKeys: string[] = FROZEN.map((id) => FOLDER_PLATFORMS[id].folderStorageKey);
    expect(memory.writes.filter((write) => frozenKeys.includes(write.key))).toEqual([]);
  });

  it("keeps a recovery copy under the site's own namespace and restores a corrupted bucket from it", async () => {
    installStorage();
    const backup = new DataBackupService<FolderData>(DATA_SITE.backupNamespace, validateFolderData);
    await backup.createPrimaryBackup(folders('Recovered'));
    memory.values.local.set(DATA_SITE.storageKey, {
      folders: folders('Corrupted').folders,
      folderContents: { f1: 'invalid' },
    });

    const { store } = site().createFolders(() => {});
    await store.init();
    await settle(30);

    // Loads normalize as on every catalog site (`sortIndex` seeded); the records are the backup's.
    expect(store.data).toMatchObject(folders('Recovered'));
    expect(memory.values.local.get(DATA_SITE.storageKey)).toEqual(store.data);
    expect(localStorage.getItem(`gvBackup_${DATA_SITE.backupNamespace}_primary`)).not.toBeNull();
    store.destroy();
  });

  it('exports a file tagged with the site and imports it back into an empty bucket', async () => {
    installStorage({ folders: [], folderContents: {} });
    const nimbus = site();
    const exported = nimbus.transfer.export(folders('Work'));
    expect((exported as { platform?: unknown }).platform).toBe(DATA_SITE.id);
    expect(nimbus.transfer.filename()).toMatch(/^voyager-nimbus-folders-\d{8}-\d{6}\.json$/);

    const { store, commands } = nimbus.createFolders(() => {});
    await store.init();
    const outcome = await commands.runBulk({
      kind: 'importFile',
      payload: JSON.parse(JSON.stringify(exported)),
      strategy: 'merge',
      source: 'file',
    });

    expect(outcome.kind).toBe('saved');
    expect(store.data.folderContents.f1).toMatchObject(folders('Work').folderContents.f1);
    expect(memory.values.local.get(DATA_SITE.storageKey)).toEqual(store.data);
    store.destroy();
  });

  it("refuses an import tagged for another site or holding another site's chats", async () => {
    installStorage({ folders: [], folderContents: {} });
    const nimbus = site();
    const { store, commands } = nimbus.createFolders(() => {});
    await store.init();
    const own = nimbus.transfer.export(folders('Work'));
    const imports = [
      { ...own, platform: 'chatgpt' },
      {
        ...own,
        platform: undefined,
        data: folders('Elsewhere', [entry('x', 'X', 'https://evil.test')]),
      },
    ];

    for (const payload of imports) {
      const outcome = await commands.runBulk({
        kind: 'importFile',
        payload,
        strategy: 'merge',
        source: 'file',
      });
      expect(outcome).toMatchObject({ kind: 'rejected', messageKey: 'folder_import_wrong_site' });
    }
    expect(store.data.folders).toEqual([]);
    // Nor does another site take this site's file.
    expect(FOLDER_PLATFORMS.chatgpt.folderExport.read(own)).toMatchObject({
      ok: false,
      reason: 'wrong-site',
    });
    store.destroy();
  });

  it('gives the bucket only to its bundled host, whatever site id a page resolves to', () => {
    expect(folderSiteForPage(DATA_SITE.id, `${DATA_SITE.origin}/c/abc-1`)?.site).toBe('nimbus');
    // Covered by the site's wildcard pattern, but not its bucket's host.
    expect(folderSiteForPage(DATA_SITE.id, 'https://other.nimbus.test/c/abc-1')).toBeNull();
    expect(folderSiteForPage(DATA_SITE.id, 'http://chat.nimbus.test/c/abc-1')).toBeNull();
    // A remote site.json for DeepSeek's host that names itself Nimbus.
    expect(folderSiteForPage(DATA_SITE.id, 'https://chat.deepseek.com/a/chat/s/1')).toBeNull();
  });

  it('leaves every name the five frozen sites store under unchanged', () => {
    expect(FOLDER_PLATFORM_IDS).toEqual([...FROZEN, DATA_SITE.id]);
    for (const id of FROZEN) {
      const { folderExport, ...names } = FOLDER_PLATFORMS[id];
      expect({ ...names, folderExport: folderExport?.platform ?? null }).toEqual(
        pinned[id].platform,
      );
    }
    expect(FOLDER_PLATFORMS[DATA_SITE.id as DerivedFolderPlatform]).toMatchObject({
      hosts: [DATA_SITE.host],
      folderStorageKey: DATA_SITE.storageKey,
      accountIsolationStorageKey: null,
      syncsSharedData: false,
      driveFoldersFileName: DATA_SITE.driveFile,
      backupNamespace: DATA_SITE.backupNamespace,
    });
  });
});
