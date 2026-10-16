// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
/** Context Sync through its packaged source, real handler, storage feed and admission. */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import type { DialogNode } from '@/features/contextSync/types';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const { captureDialogue, syncToIDE } = vi.hoisted(() => ({
  captureDialogue: vi.fn(),
  syncToIDE: vi.fn(),
}));
vi.mock('../contextSync/capture', () => ({
  ContextCaptureService: { getInstance: () => ({ captureDialogue }) },
}));
vi.mock('@/features/contextSync/services/SyncService', () => ({
  SyncService: { getInstance: () => ({ syncToIDE }) },
}));

const ID = OFFICIAL_PLUGIN_IDS.geminiContextSync;
const SWITCH = StorageKeys.CONTEXT_SYNC_ENABLED;
let harness: LifecycleHarness;
let cleanupManager: CleanupManager;
let host: PluginHost | null;

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

const statusOf = (): string | undefined =>
  host?.getStatuses().find((entry) => entry.id === ID)?.kind;

function dispatch(respond = vi.fn()) {
  return vi
    .mocked(chrome.runtime.onMessage.addListener)
    .mock.calls.map(([listener]) => listener)
    .filter((listener) => chrome.runtime.onMessage.hasListener(listener))
    .map((listener) => listener({ action: 'sync_to_ide' }, {}, respond));
}

async function start(admit = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) await createGeminiBuiltinStartup(admission, cleanupManager).startContextSync();
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

function setSwitch(enabled: boolean): void {
  harness.storage.sync.set(SWITCH, enabled);
  harness.emitStorageChange({ [SWITCH]: { newValue: enabled } }, 'sync');
}

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  harness = installLifecycleHarness();
  cleanupManager = new CleanupManager();
  host = null;
  captureDialogue.mockResolvedValue([]);
  syncToIDE.mockResolvedValue({ received: true });
});

afterEach(async () => {
  host?.stop();
  cleanupManager.executeCleanups();
  await flush();
  expect(harness.ledger.openRuntimeListeners()).toBe(0);
  harness.restore();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Gemini Context Sync through its registered official plugin', () => {
  it.each([
    ['missing', undefined, false],
    ['false', false, false],
    ['true', true, true],
    ['truthy non-boolean', 'true', false],
  ] as const)(
    'respects the %s sync key despite opposing stale plugin state',
    async (_name, value, on) => {
      if (value !== undefined) harness.storage.sync.set(SWITCH, value);
      const staleState = { [ID]: { enabled: !on, installedAt: 1, settings: {} } };
      harness.storage.local.set(StorageKeys.PLUGINS_STATE, staleState);
      await start();

      expect(statusOf() === 'mounted').toBe(on);
      expect(harness.ledger.openRuntimeListeners()).toBe(on ? 1 : 0);
      const respond = vi.fn();
      expect(dispatch(respond)).toEqual(on ? [true] : []);
      await flush();
      expect(captureDialogue).toHaveBeenCalledTimes(on ? 1 : 0);
      expect(respond).toHaveBeenCalledTimes(on ? 1 : 0);
      expect(harness.storage.sync.get(SWITCH)).toBe(value);
      expect(harness.storage.local.get(StorageKeys.PLUGINS_STATE)).toEqual(staleState);
      expect(
        vi
          .mocked(chrome.storage.local.set)
          .mock.calls.some(([values]) => Object.hasOwn(values, StorageKeys.PLUGINS_STATE)),
      ).toBe(false);
    },
  );

  it('live off refuses new requests while the already accepted capture completes normally', async () => {
    let finishCapture!: (data: DialogNode[]) => void;
    captureDialogue.mockReturnValue(
      new Promise<DialogNode[]>((resolve) => (finishCapture = resolve)),
    );
    harness.storage.sync.set(SWITCH, true);
    await start();
    const acceptedResponse = vi.fn();
    expect(dispatch(acceptedResponse)).toEqual([true]);
    expect(captureDialogue).toHaveBeenCalledOnce();

    setSwitch(false);
    await flush();
    expect(statusOf()).not.toBe('mounted');
    expect(harness.ledger.openRuntimeListeners()).toBe(0);
    const refusedResponse = vi.fn();
    // No receiver means sendMessage rejects or returns no success; the existing popup handles both.
    expect(dispatch(refusedResponse)).toEqual([]);
    expect(captureDialogue).toHaveBeenCalledOnce();
    expect(refusedResponse).not.toHaveBeenCalled();

    finishCapture([]);
    await flush();
    expect(syncToIDE).toHaveBeenCalledOnce();
    expect(acceptedResponse).toHaveBeenCalledWith({
      status: 'success',
      data: { received: true },
    });

    captureDialogue.mockResolvedValue([]);
    setSwitch(true);
    await flush();
    expect(statusOf()).toBe('mounted');
    expect(harness.ledger.openRuntimeListeners()).toBe(1);
    const resumedResponse = vi.fn();
    expect(dispatch(resumedResponse)).toEqual([true]);
    await flush();
    expect(captureDialogue).toHaveBeenCalledTimes(2);
    expect(syncToIDE).toHaveBeenCalledTimes(2);
    expect(resumedResponse).toHaveBeenCalledOnce();
  });

  it('removing the sync key live disables capture without writing a replacement', async () => {
    harness.storage.sync.set(SWITCH, true);
    await start();
    expect(harness.ledger.openRuntimeListeners()).toBe(1);
    harness.storage.sync.delete(SWITCH);
    harness.emitStorageChange({ [SWITCH]: { oldValue: true } }, 'sync');
    await flush();
    expect(statusOf()).not.toBe('mounted');
    expect(dispatch()).toEqual([]);
    expect(harness.storage.sync.has(SWITCH)).toBe(false);
    expect(captureDialogue).not.toHaveBeenCalled();
  });

  it('does nothing without admission even when explicitly enabled', async () => {
    harness.storage.sync.set(SWITCH, true);
    await start(false);
    expect(statusOf()).not.toBe('mounted');
    expect(dispatch()).toEqual([]);
    expect(harness.ledger.openRuntimeListeners()).toBe(0);
    expect(captureDialogue).not.toHaveBeenCalled();
  });

  it('the native start point only admits and installs no listener before the host starts', async () => {
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanupManager).startContextSync();
    admission.close();
    await flush();
    expect(admission.stateOf(ID)).toBe('admitted');
    expect(harness.ledger.openRuntimeListeners()).toBe(0);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(captureDialogue).not.toHaveBeenCalled();
  });
});
