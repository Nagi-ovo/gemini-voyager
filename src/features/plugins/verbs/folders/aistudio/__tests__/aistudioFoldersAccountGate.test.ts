// @vitest-environment-options { "url": "https://aistudio.google.com/prompts/new_chat" }
/**
 * AI Studio's account gate, through the content script's start point and
 * `PluginHost`: with account isolation on, folders show, take edits and answer
 * the popup only while the account the session bound is the one the page
 * shows. The account poll is captured, so each test decides when it runs.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  accountIsolationService,
  buildScopedStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import type { FolderData } from '@/core/types/folder';
import { AISTUDIO_ROOT_BUCKET_ID } from '@/features/folder/constants';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import { admitAIStudioFolders } from '@/pages/content/aistudioFolderStartup';
import { treeRoot } from '@/pages/content/folder/__tests__/aistudioTreeDriver';
import { treeDriver } from '@/pages/content/folder/floatingTree/__tests__/treeDriver';
import { type MemoryStorage, createMemoryStorage, settle } from '@/tests/memoryStorage';

type Listener = (message: unknown, sender: unknown, reply: (response: unknown) => void) => unknown;
const { runtimeListeners } = vi.hoisted(() => ({ runtimeListeners: new Set<Listener>() }));

vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return globalThis.chrome.storage;
    },
    runtime: {
      id: 'test-extension-id',
      getURL: (path: string) => path,
      onMessage: {
        addListener: (listener: Listener) => runtimeListeners.add(listener),
        removeListener: (listener: Listener) => runtimeListeners.delete(listener),
      },
      sendMessage: async () => undefined,
    },
    i18n: { getUILanguage: () => 'en' },
  },
}));

const KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
const PANEL = '.gv-aistudio.gv-folder-container';
const NAV = '<div class="nav-content v3-left-nav"><nav><div class="empty-space"></div></nav></div>';
const ACCOUNTS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
type Account = (typeof ACCOUNTS)[number];

let original: typeof chrome.storage;
let memory: MemoryStorage;
let host: PluginHost | null;
let lifetime: AbortController;
let polls: Array<() => void>;
let keys: Record<Account, string>;

const folder = (name: string): FolderData => ({
  folders: [{ id: name, name, parentId: null, isExpanded: true, createdAt: 1, updatedAt: 1 }],
  folderContents: { [name]: [], [AISTUDIO_ROOT_BUCKET_ID]: [] },
});

async function pass(): Promise<void> {
  await settle(20);
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  await settle(20);
}

function signIn(account: Account): void {
  const indicator = document.querySelector('.account-switcher-text')!;
  indicator.setAttribute('data-email', `${account}@example.com`);
  indicator.textContent = `${account}@example.com`;
}

async function openPage(): Promise<void> {
  memory.values.sync.set(StorageKeys.GV_AISTUDIO_ENABLED, true);
  const admission = createOfficialAdmission();
  admitAIStudioFolders(admission, { masterOn: true, lifetime: lifetime.signal });
  admission.close();
  host = new PluginHost({
    url: location.href,
    sources: [new BundledCatalogPluginSource()],
    doc: document,
    admission,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await pass();
}

/** The account poll, as its interval would fire it. */
async function poll(): Promise<void> {
  for (const run of polls) run();
  await pass();
}

const panel = () => document.querySelector<HTMLElement>(PANEL);
const outline = () =>
  treeDriver({ root: treeRoot(), rootBucketId: AISTUDIO_ROOT_BUCKET_ID }).outline();
const scopedWrites = () => memory.writes.filter((write) => write.key.startsWith(`${KEY}:acct:`));

/** Each scope resolution after this resolves, then lets `after` move the page on. */
function resolveThen(after: (call: number) => void, calls: number) {
  const resolve = accountIsolationService.resolveAccountScope.bind(accountIsolationService);
  let call = 0;
  return vi
    .spyOn(accountIsolationService, 'resolveAccountScope')
    .mockImplementation(async (input) => {
      const scope = await resolve(input);
      if (call < calls) after(call++);
      return scope;
    });
}

function requestData(): Promise<{ ok: boolean; data?: FolderData; accountScope?: unknown }> {
  return new Promise((done) => {
    for (const listener of runtimeListeners) {
      listener({ type: 'gv.sync.requestData' }, {}, done as (response: unknown) => void);
    }
  });
}

beforeEach(async () => {
  original = globalThis.chrome.storage;
  memory = createMemoryStorage();
  globalThis.chrome.storage = memory.api;
  lifetime = new AbortController();
  host = null;
  polls = [];
  runtimeListeners.clear();
  document.body.innerHTML = `<span class="account-switcher-text" data-email="a@example.com">a@example.com</span>${NAV}`;
  keys = {} as Record<Account, string>;
  for (const account of ACCOUNTS) {
    const scope = await accountIsolationService.resolveAccountScope({
      pageUrl: location.href,
      email: `${account}@example.com`,
    });
    keys[account] = buildScopedStorageKey(KEY, scope.accountKey);
    memory.values.local.set(keys[account], folder(`Private ${account}`));
  }
  memory.values.local.set(KEY, folder('Global'));
  memory.values.sync.set(StorageKeys.LANGUAGE, 'en');
  memory.values.sync.set(StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED, true);
  const setInterval = window.setInterval.bind(window);
  vi.spyOn(window, 'setInterval').mockImplementation(((handler: () => void, ms?: number) => {
    if (ms !== 1200) return setInterval(handler, ms);
    polls.push(handler);
    return 0;
  }) as typeof window.setInterval);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(async () => {
  host?.stop();
  lifetime.abort();
  await pass();
  globalThis.chrome.storage = original;
  vi.restoreAllMocks();
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe("AI Studio folders behind the page's account", () => {
  it('stays blocked once the bind retries run out, and opens on the next poll that binds the page', async () => {
    memory.values.sync.set(StorageKeys.FOLDER_ENABLED, false);
    await openPage();
    // Every bind lands one account behind the page: b, c, d, e bind while it shows c … f.
    const resolving = resolveThen((call) => signIn(ACCOUNTS[call + 2]), 4);
    signIn('b');
    await memory.api.sync.set({ [StorageKeys.FOLDER_ENABLED]: true });
    await vi.waitFor(() => expect(resolving).toHaveBeenCalledTimes(4));
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    await pass();

    expect(outline()).toEqual([]);
    expect(panel()!.inert).toBe(true);
    panel()!.querySelector<HTMLButtonElement>('.gv-folder-add-btn')!.click();
    await pass();
    expect(scopedWrites()).toEqual([]);
    expect(await requestData()).toEqual({ ok: false });

    await poll();

    await vi.waitFor(() => expect(outline()).toEqual(['Private f']));
    expect(panel()!.inert).toBe(false);
    expect(scopedWrites()).toEqual([]);
  });

  it("shows none of the old account's folders when isolation turns on as the page switches", async () => {
    memory.values.sync.set(StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED, false);
    await openPage();
    await vi.waitFor(() => expect(outline()).toEqual(['Global']));
    const resolving = resolveThen(() => signIn('b'), 1);

    await memory.api.sync.set({ [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: true });
    await vi.waitFor(() => expect(resolving).toHaveBeenCalled());
    await pass();

    expect(outline()).toEqual([]);
    expect(await requestData()).toEqual({ ok: false });
    await poll();
    await vi.waitFor(() => expect(outline()).toEqual(['Private b']));
    expect(scopedWrites()).toEqual([]);
  });

  it("never shows the old account's folders when the page switches while the panel waits for the nav", async () => {
    document.querySelector('.nav-content')!.remove();
    await openPage();
    signIn('b');
    document.body.insertAdjacentHTML('beforeend', NAV);
    await vi.waitFor(() => expect(panel()).not.toBeNull());
    await pass();

    expect(outline()).toEqual([]);
    expect(panel()!.textContent).not.toContain('Private a');
    await poll();
    await vi.waitFor(() => expect(outline()).toEqual(['Private b']));
    expect(scopedWrites()).toEqual([]);
  });

  it("answers the popup with no folders while the page's account is not the bound one", async () => {
    await openPage();
    await vi.waitFor(() => expect(outline()).toEqual(['Private a']));
    expect((await requestData()).data).toEqual(folder('Private a'));

    signIn('b');
    expect(await requestData()).toEqual({ ok: false });

    await poll();
    const reply = await requestData();
    expect(reply.ok).toBe(true);
    expect(reply.data).toEqual(folder('Private b'));
    expect(reply.accountScope).toBeTruthy();
  });
});
