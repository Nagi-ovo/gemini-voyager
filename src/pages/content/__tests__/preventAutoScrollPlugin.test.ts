// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import * as sendKeys from '@/core/services/composer/sendKeys/sendKeyCoordinator';
import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { PluginScope } from '@/features/plugins/runtime/pluginScope';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { activateGeminiPreventAutoScroll } from '../preventAutoScroll/pluginHandler';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const ID = OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll;
const BRIDGE_ID = 'gv-prevent-auto-scroll-bridge';
let harness: LifecycleHarness;
let cleanup: CleanupManager;
let host: PluginHost | null;
let coordinator: ReturnType<typeof sendKeys.createSendKeyCoordinator> | null;

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

async function start(): Promise<void> {
  coordinator = sendKeys.createSendKeyCoordinator('gemini');
  await coordinator.whenReady();
  const admission = createOfficialAdmission();
  const startup = createGeminiBuiltinStartup(admission, cleanup);
  await startup.startPreventAutoScroll();
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
  harness.storage.sync.set(StorageKeys.PREVENT_AUTO_SCROLL_ENABLED, enabled);
  const changes = { [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: { newValue: enabled } };
  harness.emitStorageChange(changes, 'sync');
}

function bridge(): HTMLElement {
  return document.getElementById(BRIDGE_ID)!;
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.useFakeTimers();
  history.replaceState({}, '', '/u/0/app/test');
  document.body.innerHTML = '';
  document.getElementById(BRIDGE_ID)?.remove();
  document.getElementById('gv-prevent-auto-scroll-script')?.remove();
  harness = installLifecycleHarness();
  cleanup = new CleanupManager();
  host = null;
  coordinator = null;
  // Each case is a fresh page; the production singleton stays retired after stop.
  vi.spyOn(sendKeys, 'getSendKeyCoordinator').mockImplementation((site) =>
    site === 'gemini' ? coordinator : null,
  );
  // An old plugins backup cannot turn this opt-in feature on.
  harness.storage.local.set(StorageKeys.PLUGINS_STATE, { [ID]: { enabled: true, installedAt: 1 } });
});

afterEach(async () => {
  host?.stop();
  cleanup.executeCleanups();
  coordinator?.stop();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  vi.clearAllTimers();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.getElementById(BRIDGE_ID)?.remove();
  document.getElementById('gv-prevent-auto-scroll-script')?.remove();
});

describe('prevent-auto-scroll through its registered official plugin', () => {
  it('only true enables prevention and off keeps the core bridge installed', async () => {
    await start();
    const installed = bridge();
    expect(installed).not.toBeNull();
    expect(document.getElementById('gv-prevent-auto-scroll-script')?.getAttribute('src')).toContain(
      'prevent-auto-scroll.js',
    );
    for (const value of [undefined, false, 'true', 1]) {
      flip(value);
      await flush();
      expect(bridge()).toBe(installed);
      expect(installed.dataset.enabled).toBe('false');
    }
    flip(true);
    await flush();
    expect(installed.dataset.enabled).toBe('true');
    const status = host!.getStatuses().find((entry) => entry.id === ID)?.kind;
    expect(status).toBe('mounted');
    flip(false);
    await flush();
    expect(bridge()).toBe(installed);
    expect(installed.dataset.enabled).toBe('false');
    expect(document.getElementById('gv-prevent-auto-scroll-script')).not.toBeNull();
    host!.stop();
    cleanup.executeCleanups();
    expect(bridge()).toBe(installed);
    expect(installed.dataset.enabled).toBe('false');
  });

  it('scope abort releases immediately and its late disposer cannot turn a newer claim off after bridge teardown', async () => {
    await start();
    const old = new PluginScope();
    activateGeminiPreventAutoScroll(old);
    let finish!: () => void;
    old.effect(() => () => new Promise<void>((resolve) => (finish = resolve)));
    expect(bridge().dataset.enabled).toBe('true');
    const stopping = old.dispose();
    const newer = new PluginScope();
    try {
      expect(bridge().dataset.enabled).toBe('false');
      activateGeminiPreventAutoScroll(newer);
      cleanup.executeCleanups();
      expect(bridge().dataset.enabled).toBe('true');
    } finally {
      finish();
      await stopping;
    }
    try {
      expect(bridge().dataset.enabled).toBe('true');
      // Gemini can remove the old root before a plugin's final ledger cleanup arrives.
      bridge().remove();
    } finally {
      await newer.dispose();
    }
    expect(document.getElementById(BRIDGE_ID)).toBeNull();
  });
});
