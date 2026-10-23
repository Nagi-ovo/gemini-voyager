// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chat.deepseek.com/" }
/**
 * The `folders` primitive on a sidebar no site has: everything it knows about
 * the page comes from the `folders` section of the site data below, none of
 * it from code. Storage is DeepSeek's bucket (the core table row the site id
 * picks), which is not what is under test.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { validateSiteAdapterData } from '@/features/plugins/sites/siteAdapterData';
import type { SiteAdapter } from '@/features/plugins/types';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';
import { initI18n } from '@/utils/i18n';

import { foldersPrimitive } from '../index';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id' },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const SECTION = '.gv-deepseek-folder-section';
const ID = 'abc123';
const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Work', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: {
    f1: [
      {
        conversationId: `deepseek:conv:${ID}`,
        title: 'Old title',
        url: `https://chat.deepseek.com/a/chat/s/${ID}`,
        addedAt: 1,
      },
    ],
    [ROOT_CONVERSATIONS_ID]: [],
  },
};

/** A made-up sidebar: rows are list items whose label sits beside the link's menu button. */
const FAKE_SITE = {
  id: 'deepseek',
  label: 'Fake',
  matches: ['https://chat.deepseek.com/*'],
  selectors: {},
  theme: { hostSelector: 'body', lightSelector: 'body.light', darkSelector: 'body.dark' },
  conversationIdPattern: '^/a/chat/s/([^/?#]+)',
  folders: {
    format: 1,
    sidebar: 'aside.fake-sidebar',
    rows: { row: 'li.fake-row', link: 'a', title: ['.fake-label'], drag: 'pointer' },
    mount: {
      anchors: [
        {
          id: 'above-recents',
          steps: [{ find: '.fake-missing' }, { find: '.fake-history', closest: '.fake-recents' }],
        },
      ],
    },
    page: { placeholderTitles: { any: ['Untitled'] } },
  },
};

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;

function adapter(): SiteAdapter {
  const result = validateSiteAdapterData(FAKE_SITE);
  if (!result.success || !result.data.folders) throw new Error('the fake site must validate');
  return result.data;
}

function mountSidebar(title = 'New title'): HTMLElement {
  const sidebar = document.createElement('aside');
  sidebar.className = 'fake-sidebar';
  sidebar.innerHTML = `<h3>Starred</h3><section class="fake-recents"><ul class="fake-history">
    <li class="fake-row"><a href="/a/chat/s/${ID}"><span class="fake-label">${title}</span><button type="button">More</button></a></li>
  </ul></section>`;
  document.body.append(sidebar);
  return sidebar;
}

function activate(): void {
  foldersPrimitive.activate(
    scope,
    {},
    {
      doc: document,
      adapter: adapter(),
      pluginId: 'voyager.deepseek-folders',
      settings: {},
      setTargetCounter: () => {},
    },
  );
}

async function nextPass(): Promise<void> {
  await settle(5);
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await settle(20);
}

function section(): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(SECTION)];
  expect(found).toHaveLength(1);
  return found[0];
}

function storedTitle(): string | undefined {
  const data = memory.values.local.get(StorageKeys.FOLDER_DATA_DEEPSEEK) as FolderData;
  return data.folderContents.f1?.[0]?.title;
}

beforeAll(async () => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  await initI18n();
  globalThis.chrome.storage = originalStorage;
});

beforeEach(() => {
  memory = createMemoryStorage();
  originalStorage = globalThis.chrome.storage;
  globalThis.chrome.storage = memory.api;
  memory.values.sync.set(StorageKeys.COACHMARKS_SEEN, ['deepseek-folders-sidebar-intro-v1']);
  memory.values.local.set(StorageKeys.FOLDER_DATA_DEEPSEEK, structuredClone(DATA));
  scope = new PluginScope();
});

afterEach(async () => {
  await scope.dispose();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
  vi.restoreAllMocks();
});

describe('folders on a sidebar described only by site data', () => {
  it("sits before the anchor's container, and again after the site remounts its sidebar", async () => {
    const first = mountSidebar();
    activate();
    await nextPass();

    expect(section().nextElementSibling).toBe(first.querySelector('.fake-recents'));
    expect(
      section().shadowRoot?.querySelector('.gv-deepseek-folder-section__header'),
    ).not.toBeNull();

    first.remove();
    const second = mountSidebar();
    await nextPass();

    expect(section().nextElementSibling).toBe(second.querySelector('.fake-recents'));
  });

  it("links filed conversations to the site's address and opens them through the site's own link", async () => {
    const sidebar = mountSidebar();
    const clicks: string[] = [];
    sidebar.querySelector('a')!.addEventListener('click', (event) => {
      event.preventDefault();
      clicks.push((event.currentTarget as HTMLAnchorElement).getAttribute('href')!);
    });
    activate();
    await nextPass();

    const title = section().shadowRoot!.querySelector<HTMLAnchorElement>(
      'a.gv-floating-folder-panel__conv-title',
    )!;
    expect(title.getAttribute('href')).toBe(`https://chat.deepseek.com/a/chat/s/${ID}`);

    title.click();
    expect(clicks).toEqual([`/a/chat/s/${ID}`]);
    expect(location.pathname).toBe('/');
  });

  it("gives filed conversations the title the row's label shows, not its button", async () => {
    mountSidebar();
    activate();
    await nextPass();
    await settle(20);

    expect(storedTitle()).toBe('New title');
  });

  it('keeps the stored title while the row shows a placeholder', async () => {
    mountSidebar('Untitled');
    activate();
    await nextPass();
    await settle(20);

    expect(storedTitle()).toBe('Old title');
  });

  it('places nothing and falls back to the floating button without the site sidebar', async () => {
    activate();
    await nextPass();

    expect(document.querySelector(SECTION)).toBeNull();
    expect(document.querySelector('.gv-floating-fab')).not.toBeNull();
    expect(storedTitle()).toBe('Old title');
  });
});
