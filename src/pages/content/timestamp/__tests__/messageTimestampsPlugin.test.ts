// @vitest-environment-options { "url": "https://gemini.google.com/app/a" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import type { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';

import {
  type ExtensionFake,
  GeminiPage,
  installExtension,
  settle,
} from '../../timeline/__tests__/geminiTimelineHarness';

vi.mock('webextension-polyfill', async () =>
  (await import('../../timeline/__tests__/geminiTimelineHarness')).polyfillMock(),
);

const ID = OFFICIAL_PLUGIN_IDS.geminiMessageTimestamps;
const SWITCH = StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS;
const FIRST = '1111111111111111';
const SECOND = '2222222222222222';
const STORED_TIME = new Date(2024, 0, 1, 0, 0, 1).getTime();
const CACHE = {
  version: 2,
  conversations: { 'gemini:conv:a': { [`s-${FIRST}`]: STORED_TIME } },
};
let ext: ExtensionFake;
let host: PluginHost | null;
let cleanup: CleanupManager;
let stopHistory: () => void;
let api: typeof import('../messageTimestampPageService');

const labels = () => document.querySelectorAll('.gv-timestamp');
const status = () => host?.getStatuses().find((entry) => entry.id === ID)?.kind;
async function flush(): Promise<void> {
  for (let round = 0; round < 100; round++) await Promise.resolve();
}

async function admit() {
  const admission = createOfficialAdmission();
  const { createGeminiBuiltinStartup } = await import('../../geminiBuiltinStartup');
  await createGeminiBuiltinStartup(admission, cleanup).startMessageTimestamps();
  return admission;
}

async function start(allowed = true): Promise<void> {
  const admission = allowed ? await admit() : createOfficialAdmission();
  admission.close();
  const { PluginHost } = await import('@/features/plugins/runtime/PluginHost');
  const { BuiltinPluginSource } = await import('@/features/plugins/sources/BuiltinPluginSource');
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
}

function captureHistory(id: string, serverId = SECOND): void {
  const turn = [['c_a', `r_${serverId}`], null, [['History turn']], [STORED_TIME / 1000, 0]];
  const rows = JSON.stringify([
    ['wrb.fr', 'hNvQHb', JSON.stringify([[turn], null]), null, null, null, 'generic'],
  ]);
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      origin: location.origin,
      data: {
        source: 'gv-history-observer',
        type: 'capture',
        payload: { id, body: `)]}'\n\n${rows.length}\n${rows}\n` },
      },
    }),
  );
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.setSystemTime(new Date(2026, 8, 5, 12));
  localStorage.clear();
  document.body.innerHTML = '';
  history.replaceState({}, '', '/app/a');
  ext = installExtension();
  ext.seed('local', { [StorageKeys.GV_MESSAGE_TIMESTAMPS]: CACHE });
  cleanup = new CleanupManager();
  host = null;
  api = await import('../messageTimestampPageService');
  const { registerBuiltinNativeHandlers } = await import('../../pluginNativeRegistration');
  registerBuiltinNativeHandlers();
  const { startHistoryTimestampPageService } = await import('../historyTimestampPageService');
  stopHistory = startHistoryTimestampPageService();
  await flush();
});

afterEach(async () => {
  host?.stop();
  cleanup.executeCleanups();
  stopHistory();
  await flush();
  await vi.runOnlyPendingTimersAsync();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('message timestamps through the real builtin source and PluginHost', () => {
  it.each([
    ['missing', undefined, false],
    ['false', false, false],
    ['true', true, true],
    ['truthy string', 'true', false],
    ['truthy number', 1, false],
  ] as const)(
    'uses the strict legacy %s value despite stale plugin state',
    async (_name, value, on) => {
      if (value !== undefined) ext.seed('sync', { [SWITCH]: value });
      const stale = { [ID]: { enabled: !on, installedAt: 1, settings: {} } };
      ext.seed('local', { [StorageKeys.PLUGINS_STATE]: stale });
      const writeLocal = vi.spyOn(chrome.storage.local, 'set');
      const writeSync = vi.spyOn(chrome.storage.sync, 'set');
      new GeminiPage([{ prompt: 'Saved turn', serverId: FIRST }]);

      await start();
      expect(status() === 'mounted').toBe(on);
      expect(await api.whenMessageTimestampsReady()).toBe(true);
      expect(labels()).toHaveLength(on ? 1 : 0);
      expect(document.querySelector('.gemini-timeline-bar')).toBeNull();
      expect(ext.read('sync', SWITCH)).toBe(value);
      expect(ext.read('local', StorageKeys.PLUGINS_STATE)).toEqual(stale);
      expect(writeLocal.mock.calls.some(([values]) => StorageKeys.PLUGINS_STATE in values)).toBe(
        false,
      );
      expect(writeSync).not.toHaveBeenCalled();
    },
  );

  it('removes labels live, keeps data and re-enables without duplicate labels or listeners', async () => {
    ext.seed('sync', { [SWITCH]: true });
    const page = new GeminiPage([{ prompt: 'Saved turn', serverId: FIRST }]);
    await start();
    await settle(801);
    const listenerCount = ext.listeners.size;
    page.append({ prompt: 'New turn', serverId: SECOND });
    await settle(201);
    expect(labels()).toHaveLength(2);
    const saved = ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS);

    for (let cycle = 0; cycle < 2; cycle++) {
      ext.external('sync', { [SWITCH]: false });
      await flush();
      expect(status()).not.toBe('mounted');
      expect(labels()).toHaveLength(0);
      expect(await api.whenMessageTimestampsReady()).toBe(true);
      expect(ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS)).toEqual(saved);

      ext.external('sync', { [SWITCH]: true });
      await flush();
      await settle(801);
      expect(status()).toBe('mounted');
      expect(labels()).toHaveLength(2);
      expect(
        new Set(Array.from(labels(), (label) => label.getAttribute('data-gv-turn-id'))).size,
      ).toBe(2);
      expect(ext.listeners.size).toBe(listenerCount);
      expect(ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS)).toEqual(saved);
    }
  });

  it('keeps a recorded turn when off→on races an unfinished cache write', async () => {
    ext.seed('sync', { [SWITCH]: true });
    const page = new GeminiPage([{ prompt: 'Saved turn', serverId: FIRST }]);
    await start();
    await settle(801);
    const local = chrome.storage.local;
    const normalSet = local.set.bind(local) as (
      items: Record<string, unknown>,
      callback?: () => void,
    ) => Promise<void>;
    let finish: (() => void) | undefined;
    vi.spyOn(local, 'set').mockImplementation(
      (items: Record<string, unknown>, callback?: () => void) => {
        if (!finish && StorageKeys.GV_MESSAGE_TIMESTAMPS in items) {
          return new Promise<void>((resolve) => {
            finish = () => {
              void normalSet(items, callback);
              resolve();
            };
          });
        }
        return normalSet(items, callback);
      },
    );
    page.append({ prompt: 'Recorded before off', serverId: SECOND });
    await settle(201);
    expect(finish).toBeDefined();
    page.append({ prompt: 'Recorded during the pending write', serverId: '3333333333333333' });
    await settle(201);
    ext.external('sync', { [SWITCH]: false });
    await flush();
    expect(labels()).toHaveLength(0);
    ext.external('sync', { [SWITCH]: true });
    await flush();
    finish!();
    await settle(1);
    await api.whenMessageTimestampsReady();
    await settle(801);
    page.append({ prompt: 'Recorded after on', serverId: '4444444444444444' });
    await settle(201);
    const saved = ext.read<{ conversations: Record<string, Record<string, number>> }>(
      'local',
      StorageKeys.GV_MESSAGE_TIMESTAMPS,
    );
    expect(saved?.conversations['gemini:conv:a']).toEqual({
      [`s-${FIRST}`]: STORED_TIME,
      [`s-${SECOND}`]: expect.any(Number),
      's-3333333333333333': expect.any(Number),
      's-4444444444444444': expect.any(Number),
    });
    expect(labels()).toHaveLength(4);
  });

  it('waits for retired legacy-cache cleanup before making the successor ready', async () => {
    ext.seed('sync', { [SWITCH]: true });
    ext.seed('local', { [StorageKeys.GV_MESSAGE_TIMESTAMPS]: { [`s-${FIRST}`]: STORED_TIME } });
    const page = new GeminiPage([{ prompt: 'Existing turn', serverId: FIRST }]);
    const normalRemove = chrome.storage.local.remove.bind(chrome.storage.local);
    let finish!: () => void;
    vi.spyOn(chrome.storage.local, 'remove').mockImplementationOnce(
      (keys, callback) =>
        new Promise<void>((resolve) => {
          finish = () => {
            void normalRemove(keys, callback);
            resolve();
          };
        }),
    );
    await start();
    expect(finish).toBeDefined();
    ext.external('sync', { [SWITCH]: false });
    await flush();
    ext.external('sync', { [SWITCH]: true });
    await flush();
    let ready = false;
    const readiness = api.whenMessageTimestampsReady().then((value) => {
      ready = value;
    });
    await flush();
    expect(ready).toBe(false);
    finish();
    await readiness;
    expect(ready).toBe(true);
    await settle(801);
    page.append({ prompt: 'New turn', serverId: SECOND });
    await settle(201);
    const saved = ext.read<{ conversations: Record<string, Record<string, number>> }>(
      'local',
      StorageKeys.GV_MESSAGE_TIMESTAMPS,
    );
    expect(saved?.conversations['gemini:conv:a']?.[`s-${SECOND}`]).toEqual(expect.any(Number));
    expect(labels()).toHaveLength(1);
  });

  it('removes labels synchronously when the plugin scope aborts', async () => {
    ext.seed('sync', { [SWITCH]: true });
    new GeminiPage([{ prompt: 'Saved turn', serverId: FIRST }]);
    await start();
    expect(labels()).toHaveLength(1);
    host!.stop();
    expect(labels()).toHaveLength(0);
    expect(ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS)).toEqual(CACHE);
    await flush();
    expect(await api.whenMessageTimestampsReady()).toBe(true);
  });

  it('returns to default off when the legacy setting is deleted live', async () => {
    ext.seed('sync', { [SWITCH]: true });
    new GeminiPage([{ prompt: 'Saved turn', serverId: FIRST }]);
    await start();
    expect(labels()).toHaveLength(1);
    await chrome.storage.sync.remove(SWITCH);
    await flush();
    expect(status()).not.toBe('mounted');
    expect(labels()).toHaveLength(0);
    expect(ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS)).toEqual(CACHE);
  });

  it('does nothing without admission even with explicit on', async () => {
    ext.seed('sync', { [SWITCH]: true });
    const observe = vi.spyOn(MutationObserver.prototype, 'observe');
    const page = new GeminiPage([{ prompt: 'Saved turn', serverId: FIRST }]);
    await start(false);
    await settle(801);
    page.append({ prompt: 'New turn', serverId: SECOND });
    await settle(201);
    expect(status()).not.toBe('mounted');
    expect(await api.whenMessageTimestampsReady()).toBe(true);
    expect(labels()).toHaveLength(0);
    expect(observe).not.toHaveBeenCalled();
    expect(ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS)).toEqual(CACHE);
  });

  it('only admits at the old start point without starting the service', async () => {
    ext.seed('sync', { [SWITCH]: true });
    new GeminiPage([{ prompt: 'Saved turn', serverId: FIRST }]);
    const admission = await admit();
    expect(admission.stateOf(ID)).toBe('admitted');
    expect(await api.whenMessageTimestampsReady()).toBe(true);
    expect(labels()).toHaveLength(0);
  });

  it('keeps native history capture and durable identities working with the plugin off', async () => {
    ext.seed('sync', { [SWITCH]: false });
    const { historyTimestampStore } = await import('../historyTimestamps');
    const { whenHistoryTimestampsReady } = await import('../historyTimestampPageService');
    const stopStore = vi.spyOn(historyTimestampStore, 'stop');
    const startStore = vi.spyOn(historyTimestampStore, 'start');
    await start();
    expect(await whenHistoryTimestampsReady(undefined, { requirePageService: true })).toBe(true);
    captureHistory('plugin-off');
    await settle(1500);
    expect(historyTimestampStore.resolveCanonicalTurnId('a', 'u-0')).toBe(`s-${SECOND}`);
    expect(ext.read('local', StorageKeys.GV_TURN_IDENTITY_CACHE)).toBeDefined();
    expect(ext.read('local', StorageKeys.GV_MESSAGE_TIMESTAMPS)).toEqual(CACHE);
    expect(labels()).toHaveLength(0);
    host!.stop();
    await flush();
    captureHistory('host-stopped', FIRST);
    await settle(1500);
    expect(historyTimestampStore.resolveCanonicalTurnId('a', 'u-0')).toBe(`s-${FIRST}`);
    expect(startStore).not.toHaveBeenCalled();
    expect(stopStore).not.toHaveBeenCalled();
  });
});
