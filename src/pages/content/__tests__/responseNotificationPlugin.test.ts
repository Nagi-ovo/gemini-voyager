// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
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

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

async function start(): Promise<void> {
  const admission = createOfficialAdmission();
  const startup = createGeminiBuiltinStartup(admission, cleanup);
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
  it('only true enables notifications and the live setting wins', async () => {
    await start();
    for (const [index, value] of [undefined, false, 'true', 1].entries()) {
      flip(value);
      await flush();
      completedRequest(index + 1);
    }
    expect(notifications()).toHaveLength(0);
    flip(true);
    await flush();
    const status = host!.getStatuses().find((entry) => entry.id === ID)?.kind;
    expect(status).toBe('mounted');
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
  });

  it('off drops a pending completion and reopening ignores its late terminal event', async () => {
    harness.storage.sync.set(ENABLED_KEY, true);
    await start();
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
  });

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
