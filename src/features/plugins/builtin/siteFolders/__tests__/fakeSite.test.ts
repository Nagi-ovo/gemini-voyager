// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
/**
 * The shared sidebar folders driven by a site that is not ChatGPT: its own
 * sidebar markup, anchor, links and navigation, and none of ChatGPT's native
 * hooks. Storage stays ChatGPT's bucket, which is not what is under test.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { ConversationReference, FolderData } from '@/core/types/folder';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { initI18n } from '@/utils/i18n';

import {
  type MemoryStorage,
  createMemoryStorage,
  settle,
} from '../../chatgptFolders/__tests__/memoryStorage';
import { CHATGPT_SITE_FOLDERS } from '../../chatgptFolders/chatgptSiteFolders';
import { activateSiteFolders } from '../activate';
import type { SidebarConversation, SiteFoldersAdapter } from '../types';

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: { id: 'test-extension-id' },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const SECTION = '.gv-fake-folder-section';
const STORED_PREFIX = 'chatgpt:conv:';
const DATA: FolderData = {
  folders: [
    { id: 'f1', name: 'Work', parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 },
  ],
  folderContents: {
    f1: [
      {
        conversationId: `${STORED_PREFIX}abc`,
        title: 'Old title',
        url: 'https://chatgpt.com/c/abc',
        addedAt: 1,
      },
    ],
    [ROOT_CONVERSATIONS_ID]: [],
  },
};

let memory: MemoryStorage;
let originalStorage: typeof chrome.storage;
let scope: PluginScope;
let opened: ConversationReference[];

function mountSidebar(): HTMLElement {
  const sidebar = document.createElement('aside');
  sidebar.className = 'fake-sidebar';
  sidebar.innerHTML =
    '<h3>Starred</h3><ul class="fake-history"><li><a href="/chat/abc">New title</a></li></ul>';
  document.body.append(sidebar);
  return sidebar;
}

function rows(root: ParentNode): SidebarConversation[] {
  return [...root.querySelectorAll<HTMLAnchorElement>('a[href^="/chat/"]')].map((link) => {
    const path = link.getAttribute('href')!;
    return { id: path.slice('/chat/'.length), path, link };
  });
}

function fakeHref(conversation: ConversationReference): string {
  return `https://fake.test/chat/${conversation.conversationId.slice(STORED_PREFIX.length)}`;
}

/** A site with its own sidebar, links and navigation, and no native hooks. */
function fakeSite(): SiteFoldersAdapter {
  return {
    ...CHATGPT_SITE_FOLDERS,
    key: 'fake-folders',
    identity: {
      storedId: (id) => `${STORED_PREFIX}${id}`,
      bareId: (id) => id.slice(STORED_PREFIX.length),
      conversationIdOf: () => null,
      href: fakeHref,
    },
    page: {
      current: () => null,
      open: (conversation) => void opened.push(conversation),
      isPlaceholderTitle: (title) => title === 'Untitled',
    },
    sidebar: {
      find: (doc = document) => doc.querySelector<HTMLElement>('.fake-sidebar'),
      list: rows,
      title: (row) => row.link.textContent?.trim() ?? '',
      observedAttributes: ['href'],
    },
    section: {
      className: 'gv-fake-folder-section',
      css: '',
      anchor: (sidebar) => sidebar.querySelector<HTMLElement>('.fake-history'),
      conversationHref: fakeHref,
      policy: CHATGPT_SITE_FOLDERS.policy,
    },
    native: {},
  };
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
  const data = memory.values.local.get(StorageKeys.FOLDER_DATA_CHATGPT) as FolderData;
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
  memory.values.local.set(StorageKeys.FOLDER_DATA_CHATGPT, structuredClone(DATA));
  scope = new PluginScope();
  opened = [];
});

afterEach(async () => {
  await scope.dispose();
  document.body.replaceChildren();
  globalThis.chrome.storage = originalStorage;
  vi.restoreAllMocks();
});

describe('site folders on a site that is not ChatGPT', () => {
  it("sits just before the site's anchor, and again after the site remounts its sidebar", async () => {
    const first = mountSidebar();
    await activateSiteFolders(scope, fakeSite());
    await nextPass();

    expect(section().nextElementSibling).toBe(first.querySelector('.fake-history'));
    expect(section().shadowRoot?.querySelector('.gv-fake-folder-section__header')).not.toBeNull();

    first.remove();
    const second = mountSidebar();
    await nextPass();

    expect(section().nextElementSibling).toBe(second.querySelector('.fake-history'));
  });

  it("links filed conversations to the site's address and opens them through the site", async () => {
    mountSidebar();
    await activateSiteFolders(scope, fakeSite());
    await nextPass();

    const title = section().shadowRoot!.querySelector<HTMLAnchorElement>(
      'a.gv-floating-folder-panel__conv-title',
    )!;
    expect(title.getAttribute('href')).toBe('https://fake.test/chat/abc');

    title.click();
    expect(opened.map((conversation) => conversation.conversationId)).toEqual([
      `${STORED_PREFIX}abc`,
    ]);
  });

  it("gives filed conversations the titles the site's rows show", async () => {
    mountSidebar();
    await activateSiteFolders(scope, fakeSite());
    await nextPass();
    await settle(20);

    expect(storedTitle()).toBe('New title');
  });

  it('places nothing and falls back to the floating button without the site sidebar', async () => {
    await activateSiteFolders(scope, fakeSite());
    await nextPass();

    expect(document.querySelector(SECTION)).toBeNull();
    expect(document.querySelector('.gv-floating-fab')).not.toBeNull();
    expect(storedTitle()).toBe('Old title');
  });
});
