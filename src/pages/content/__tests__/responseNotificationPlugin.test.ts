// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import {
  FEATURE_OWNERS,
  type FeatureOwner,
  OFFICIAL_PLUGIN_IDS,
  featureOwner,
} from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { activateGeminiResponseNotification } from '../responseNotification/pluginHandler';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const ID = OFFICIAL_PLUGIN_IDS.geminiResponseNotification;
const ENABLED_KEY = StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED;
const PAGE_OBSERVER_SOURCE = 'gemini-voyager-response-complete-observer';
let harness: LifecycleHarness;
let cleanup: CleanupManager;
let host: PluginHost | null;
let routeStorage: ((changes: Record<string, chrome.storage.StorageChange>) => void) | undefined;

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

async function start(owner: FeatureOwner = 'plugin'): Promise<void> {
  const owners = FEATURE_OWNERS.map((entry) =>
    entry.feature === 'responseNotification' ? { ...entry, owner } : entry,
  );
  const admission = createOfficialAdmission(owners);
  const startup = createGeminiBuiltinStartup(admission, cleanup, undefined, (site, feature) =>
    feature === 'responseNotification' ? owner : featureOwner(site, feature),
  );
  routeStorage = (changes) => startup.handleStorageChange(changes, 'sync');
  await startup.startResponseNotification();
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
}

function flip(enabled: unknown): void {
  harness.storage.sync.set(ENABLED_KEY, enabled);
  const changes = { [ENABLED_KEY]: { newValue: enabled } };
  routeStorage?.(changes);
  harness.emitStorageChange(changes, 'sync');
}

function observerMessage(type: 'request-start' | 'request-complete', requestId: number): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      source: window,
      data: {
        source: PAGE_OBSERVER_SOURCE,
        type,
        payload: { requestId, shouldNotify: true, outcome: 'success', pageUrl: location.href },
      },
    }),
  );
}

function completedRequest(requestId: number): void {
  observerMessage('request-start', requestId);
  observerMessage('request-complete', requestId);
}

function notifications(): unknown[] {
  return vi
    .mocked(chrome.runtime.sendMessage)
    .mock.calls.filter(
      ([message]) => (message as { type?: string })?.type === 'gv.responseComplete.notify',
    );
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState({}, '', '/u/0/app/test');
  document.body.innerHTML = '';
  harness = installLifecycleHarness();
  cleanup = new CleanupManager();
  host = null;
  routeStorage = undefined;
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
  (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({ ok: true });
  // The existing popup opt-in switch remains authoritative over old plugins backups.
  harness.storage.local.set(StorageKeys.PLUGINS_STATE, { [ID]: { enabled: true, installedAt: 1 } });
});

afterEach(async () => {
  host?.stop();
  cleanup.executeCleanups();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('response notifications through the registered official plugin', () => {
  it.each(['plugin', 'legacy'] as const)(
    'with the %s owner, only true enables notifications and the live setting wins',
    async (owner) => {
      await start(owner);
      for (const [index, value] of [undefined, false, 'true', 1].entries()) {
        flip(value);
        await flush();
        completedRequest(index + 1);
      }
      expect(notifications()).toHaveLength(0);
      flip(true);
      await flush();
      const status = host!.getStatuses().find((entry) => entry.id === ID)?.kind;
      if (owner === 'plugin') expect(status).toBe('mounted');
      else expect(status).not.toBe('mounted');
      completedRequest(10);
      expect(notifications()).toHaveLength(1);
      flip(false);
      await flush();
      completedRequest(11);
      expect(notifications()).toHaveLength(1);
      flip(true);
      await flush();
      completedRequest(12);
      expect(notifications()).toHaveLength(2);
      host!.stop();
      cleanup.executeCleanups();
      completedRequest(13);
      expect(notifications()).toHaveLength(2);
    },
  );

  it.each(['plugin', 'legacy'] as const)(
    'with the %s owner, off drops a pending completion and reopening ignores its late terminal event',
    async (owner) => {
      harness.storage.sync.set(ENABLED_KEY, true);
      await start(owner);
      observerMessage('request-start', 1);
      flip(false);
      await flush();
      observerMessage('request-complete', 1);
      expect(notifications()).toHaveLength(0);
      flip(true);
      await flush();
      observerMessage('request-complete', 1);
      expect(notifications()).toHaveLength(0);
      completedRequest(2);
      observerMessage('request-complete', 2);
      expect(notifications()).toHaveLength(1);
    },
  );

  it.each(['plugin', 'legacy'] as const)(
    'with the %s owner, a retired run initial read cannot enable it or disturb the successor',
    async (owner) => {
      harness.storage.sync.set(ENABLED_KEY, true);
      let resolve!: (value: Record<string, unknown>) => void;
      const initialRead = new Promise<Record<string, unknown>>((settle) => (resolve = settle));
      const get = chrome.storage.sync.get as unknown as Mock;
      const normalGet = get.getMockImplementation()!;
      let held = false;
      get.mockImplementation((keys: unknown, callback?: unknown) => {
        // Hold only the actual run's single-key read; PluginHost's settings snapshot must settle.
        if (
          !held &&
          typeof keys === 'object' &&
          keys !== null &&
          !Array.isArray(keys) &&
          Object.keys(keys).length === 1 &&
          ENABLED_KEY in keys
        ) {
          held = true;
          return initialRead;
        }
        return normalGet(keys, callback);
      });
      await start(owner);
      expect(held).toBe(true);
      completedRequest(1);
      expect(notifications()).toHaveLength(0);
      flip(false);
      await flush();
      flip(true);
      await flush();
      resolve({ [ENABLED_KEY]: true });
      await flush();
      completedRequest(2);
      expect(notifications()).toHaveLength(1);
    },
  );

  it('scope abort stops a run before a slow ledger disposer and its successor notifies alone', async () => {
    await start();
    harness.storage.sync.set(ENABLED_KEY, true);
    const old = new PluginScope();
    activateGeminiResponseNotification(old);
    await flush();
    observerMessage('request-start', 1);
    let finish!: () => void;
    old.effect(() => () => new Promise<void>((resolve) => (finish = resolve)));
    const stopping = old.dispose();
    const newer = new PluginScope();
    try {
      observerMessage('request-complete', 1);
      expect(notifications()).toHaveLength(0);
      activateGeminiResponseNotification(newer);
      await flush();
    } finally {
      finish();
      await stopping;
    }
    try {
      observerMessage('request-complete', 1);
      completedRequest(2);
      expect(notifications()).toHaveLength(1);
    } finally {
      await newer.dispose();
    }
    completedRequest(3);
    expect(notifications()).toHaveLength(1);
  });
});
