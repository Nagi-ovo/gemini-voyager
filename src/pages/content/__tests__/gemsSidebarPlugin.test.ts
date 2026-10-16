// @vitest-environment-options { "url": "https://gemini.google.com/u/2/app/test" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

// Both storage APIs address the same extension data in production.
vi.mock('webextension-polyfill', () => ({
  default: {
    get storage() {
      return chrome.storage;
    },
  },
}));

const ID = OFFICIAL_PLUGIN_IDS.geminiGemsSidebar;
const SWITCH = StorageKeys.GV_GEMS_SIDEBAR_ENABLED;
const COUNT = StorageKeys.GV_GEMS_SIDEBAR_COUNT;
const gems = ['g1', 'g2', 'g3'].map((id) => ({ id, name: id, href: `/gem/${id}` }));
let harness: LifecycleHarness;
let cleanupManager: CleanupManager;
let host: PluginHost | null;

async function flush(): Promise<void> {
  for (let i = 0; i < 80; i++) await Promise.resolve();
}

function page(management = false): void {
  document.body.innerHTML = `<div data-test-id="overflow-container"><mat-nav-list class="nav">
    <gem-nav-list-item data-test-id="gems-side-nav-entry-button"></gem-nav-list-item>
  </mat-nav-list></div>${
    management
      ? `<div data-test-id="your-gems-list">${gems
          .map(
            (gem) =>
              `<bot-list-row><div><a class="bot-row" href="/u/2${gem.href}"><div class="title-container">${gem.name}</div></a></div></bot-list-row>`,
          )
          .join('')}</div>`
      : ''
  }`;
  const entry = document.querySelector('gem-nav-list-item')!;
  Object.defineProperty(entry, 'getBoundingClientRect', {
    value: () => ({ top: 0, left: 0, right: 200, bottom: 40, width: 200, height: 40 }),
  });
}
const lists = () => document.querySelectorAll('.gv-gems-inline-list');
const rows = () => document.querySelectorAll('.gv-gems-inline-list a');
const pins = () => document.querySelectorAll('.gv-gem-pin-toggle');
const status = () => host?.getStatuses().find((entry) => entry.id === ID)?.kind;

async function start(admit = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) await createGeminiBuiltinStartup(admission, cleanupManager).startGemsSidebar();
  admission.close();
  host = new PluginHost({
    url: location.href,
    sources: [new BuiltinPluginSource()],
    doc: document,
    admission,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await flush();
  await vi.advanceTimersByTimeAsync(50);
}
function change(key: string, value: unknown): void {
  if (value === undefined) harness.storage.sync.delete(key);
  else harness.storage.sync.set(key, value);
  harness.emitStorageChange({ [key]: { newValue: value } }, 'sync');
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/u/2/app/test');
  document.head.innerHTML = '';
  page();
  harness = installLifecycleHarness();
  harness.storage.local.set(StorageKeys.GV_GEMS_LIST_CACHE, {
    items: gems,
    cachedAt: 1,
    accountSegment: '/u/2',
  });
  harness.storage.local.set(StorageKeys.GV_GEMS_MRU, { entries: [] });
  harness.storage.local.set('gvGemsSidebarExpanded', true);
  harness.storage.sync.set(StorageKeys.GV_GEMS_PINNED, ['g1']);
  cleanupManager = new CleanupManager();
  host = null;
});
afterEach(async () => {
  host?.stop();
  cleanupManager.executeCleanups();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('recent Gems through its real builtin source and host', () => {
  it.each([
    ['missing', undefined, true],
    ['false', false, false],
    ['true', true, true],
  ] as const)(
    'uses the %s master key independently of stale plugin state',
    async (_label, value, on) => {
      if (value !== undefined) harness.storage.sync.set(SWITCH, value);
      const stale = { [ID]: { enabled: !on, installedAt: 1, settings: { count: 0 } } };
      harness.storage.local.set(StorageKeys.PLUGINS_STATE, stale);
      await start();
      expect(status() === 'mounted').toBe(on);
      expect(lists()).toHaveLength(on ? 1 : 0);
      expect(rows()).toHaveLength(on ? 3 : 0);
      expect(harness.storage.sync.get(SWITCH)).toBe(value);
      expect(harness.storage.local.get(StorageKeys.PLUGINS_STATE)).toEqual(stale);
    },
  );

  it('keeps count-zero users hidden while scraping and pin controls continue', async () => {
    window.history.replaceState({}, '', '/u/2/gems/view');
    page(true);
    harness.storage.sync.set(COUNT, 0);
    await start();
    await vi.advanceTimersByTimeAsync(400);
    expect(status()).toBe('mounted');
    expect(lists()).toHaveLength(0);
    expect(pins()).toHaveLength(3);
    expect(harness.ledger.openObservers().length).toBeGreaterThan(0);
    const row = document.querySelector('.title-container')!;
    row.textContent = 'Renamed';
    await vi.advanceTimersByTimeAsync(400);
    expect(harness.storage.local.get(StorageKeys.GV_GEMS_LIST_CACHE)).toMatchObject({
      items: [expect.objectContaining({ name: 'Renamed' }), gems[1], gems[2]],
    });
    expect(lists()).toHaveLength(0);
  });

  it('updates count live without remounting, keeps account links and hides even pinned gems at zero', async () => {
    harness.storage.sync.set(COUNT, 1);
    await start();
    expect(rows()).toHaveLength(1);
    const reads = vi.mocked(chrome.storage.sync.get).mock.calls.length;
    const observers = harness.ledger.openObservers().length;
    const listeners = harness.ledger.openStorageListeners();
    change(COUNT, 2);
    await flush();
    expect(chrome.storage.sync.get).toHaveBeenCalledTimes(reads);
    expect(rows()).toHaveLength(2);
    expect([...rows()].map((a) => a.getAttribute('href'))).toEqual([
      'https://gemini.google.com/u/2/gem/g1',
      'https://gemini.google.com/u/2/gem/g2',
    ]);
    expect(harness.ledger.openObservers()).toHaveLength(observers);
    expect(harness.ledger.openStorageListeners()).toBe(listeners);
    change(COUNT, undefined);
    await flush();
    expect(rows()).toHaveLength(3);
    change(COUNT, '2');
    await flush();
    expect(rows()).toHaveLength(2);
    change(COUNT, 0);
    await flush();
    expect(lists()).toHaveLength(0);
  });

  it('off preserves pins, expanded state, cache and MRU, and re-enabling adds no duplicate controls', async () => {
    window.history.replaceState({}, '', '/u/2/gems/view');
    page(true);
    await start();
    await vi.advanceTimersByTimeAsync(400);
    const before = [...harness.storage.local.entries()];
    const pinned = harness.storage.sync.get(StorageKeys.GV_GEMS_PINNED);
    const observers = harness.ledger.openObservers().length;
    const listeners = harness.ledger.openStorageListeners();
    expect(pins()).toHaveLength(3);
    change(SWITCH, false);
    await flush();
    expect(lists()).toHaveLength(0);
    expect(pins()).toHaveLength(0);
    expect(harness.ledger.openObservers()).toHaveLength(0);
    document.querySelector('.title-container')!.textContent = 'Changed while off';
    await vi.advanceTimersByTimeAsync(1000);
    expect([...harness.storage.local.entries()]).toEqual(before);
    expect(harness.storage.sync.get(StorageKeys.GV_GEMS_PINNED)).toEqual(pinned);
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
    change(SWITCH, true);
    await flush();
    expect(lists()).toHaveLength(1);
    expect(pins()).toHaveLength(3);
    expect(harness.ledger.openObservers()).toHaveLength(observers);
    expect(harness.ledger.openStorageListeners()).toBe(listeners);
  });

  it('drops late scrape completion after off without pruning pins or MRU or restoring UI', async () => {
    window.history.replaceState({}, '', '/u/2/gems/view');
    page(true);
    harness.storage.sync.set(StorageKeys.GV_GEMS_PINNED, ['g3']);
    harness.storage.local.set(StorageKeys.GV_GEMS_MRU, {
      entries: [{ ...gems[2], lastUsedAt: 1 }],
    });
    await start();
    await vi.advanceTimersByTimeAsync(400);
    let resolveWrite!: () => void;
    const pending = new Promise<void>((resolve) => {
      resolveWrite = resolve;
    });
    const set = vi.mocked(chrome.storage.local.set);
    set.mockImplementationOnce(() => pending);
    document.querySelectorAll('bot-list-row')[2].remove();
    await vi.advanceTimersByTimeAsync(400);
    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        [StorageKeys.GV_GEMS_LIST_CACHE]: expect.objectContaining({ items: expect.any(Array) }),
      }),
    );
    change(SWITCH, false);
    await flush();
    const localWrites = set.mock.calls.length;
    const syncWrites = vi.mocked(chrome.storage.sync.set).mock.calls.length;
    resolveWrite();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(lists()).toHaveLength(0);
    expect(pins()).toHaveLength(0);
    expect(set).toHaveBeenCalledTimes(localWrites);
    expect(chrome.storage.sync.set).toHaveBeenCalledTimes(syncWrites);
    expect(harness.storage.sync.get(StorageKeys.GV_GEMS_PINNED)).toEqual(['g3']);
    expect(harness.storage.local.get(StorageKeys.GV_GEMS_MRU)).toMatchObject({
      entries: [{ id: 'g3' }],
    });
    expect(harness.ledger.openObservers()).toHaveLength(0);
  });

  it('restores default-on on live master-key removal', async () => {
    harness.storage.sync.set(SWITCH, false);
    await start();
    change(SWITCH, undefined);
    await flush();
    expect(status()).toBe('mounted');
    expect(lists()).toHaveLength(1);
    expect(harness.storage.sync.has(SWITCH)).toBe(false);
  });

  it('does nothing without admission even with an explicit on', async () => {
    harness.storage.sync.set(SWITCH, true);
    await start(false);
    expect(status()).not.toBe('mounted');
    expect(lists()).toHaveLength(0);
    expect(harness.ledger.openObservers()).toHaveLength(0);
  });

  it('admission alone starts no DOM or storage work', async () => {
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanupManager).startGemsSidebar();
    expect(admission.stateOf(ID)).toBe('admitted');
    expect(lists()).toHaveLength(0);
    expect(harness.ledger.activity()).toBe(0);
    expect(chrome.storage.sync.get).not.toHaveBeenCalled();
  });
});
