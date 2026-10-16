// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
/** Real packaged source, registered handler, sync feed and native-point admission. */
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

const ID = OFFICIAL_PLUGIN_IDS.geminiMarkdownFix;
const SWITCH = StorageKeys.MARKDOWN_FIX_ENABLED;
let harness: LifecycleHarness;
let cleanupManager: CleanupManager;
let host: PluginHost | null;

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

function reply(html = 'before **bold** after'): HTMLElement {
  const response = document.createElement('model-response');
  response.innerHTML = `<p>${html}</p>`;
  document.body.appendChild(response);
  return response;
}

const statusOf = (): string | undefined =>
  host?.getStatuses().find((entry) => entry.id === ID)?.kind;

async function start(admit = true): Promise<void> {
  const admission = createOfficialAdmission();
  if (admit) await createGeminiBuiltinStartup(admission, cleanupManager).startMarkdownFix();
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
  vi.useFakeTimers();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
  harness = installLifecycleHarness();
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

describe('Gemini Markdown rendering fix through its official plugin', () => {
  it.each([
    ['missing', undefined, true],
    ['false', false, false],
    ['true', true, true],
  ] as const)('preserves the %s switch despite stale plugin state', async (_name, value, on) => {
    if (value !== undefined) harness.storage.sync.set(SWITCH, value);
    const staleState = { [ID]: { enabled: !on, installedAt: 1, settings: {} } };
    harness.storage.local.set(StorageKeys.PLUGINS_STATE, staleState);
    const response = reply();

    await start();
    await vi.advanceTimersByTimeAsync(150);

    expect(statusOf() === 'mounted').toBe(on);
    expect(response.querySelectorAll('strong')).toHaveLength(on ? 1 : 0);
    expect(response.textContent).toBe(on ? 'before bold after' : 'before **bold** after');
    if (!on) expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.storage.sync.get(SWITCH)).toBe(value);
    expect(harness.storage.local.get(StorageKeys.PLUGINS_STATE)).toEqual(staleState);
    expect(
      vi
        .mocked(chrome.storage.local.set)
        .mock.calls.some(([values]) => Object.hasOwn(values, StorageKeys.PLUGINS_STATE)),
    ).toBe(false);
  });

  it('retains completed fixes on live off and re-enables without double patching', async () => {
    const inline = reply();
    const split = reply('before **<b data-path-to-node="0">split</b>** after');
    const nativeNode = split.querySelector('b')!;
    await start();
    const wrappers = [inline.querySelector('strong'), split.querySelector('strong')];
    expect(wrappers.every(Boolean)).toBe(true);
    const observerCount = harness.ledger.openObservers().length;
    const listenerCount = harness.ledger.openStorageListeners();

    setSwitch(false);
    await flush();
    const unpatched = reply();
    await vi.advanceTimersByTimeAsync(150);

    expect(statusOf()).not.toBe('mounted');
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(inline.querySelector('strong')).toBe(wrappers[0]);
    expect(split.querySelector('strong')).toBe(wrappers[1]);
    expect(split.querySelector('b')).toBe(nativeNode);
    expect(unpatched.querySelector('strong')).toBeNull();

    setSwitch(true);
    await flush();
    await vi.advanceTimersByTimeAsync(150);
    expect(statusOf()).toBe('mounted');
    expect(unpatched.querySelectorAll('strong')).toHaveLength(1);
    expect(inline.querySelector('strong')).toBe(wrappers[0]);
    expect(split.querySelector('strong')).toBe(wrappers[1]);
    expect(document.querySelectorAll('strong')).toHaveLength(3);
    expect(harness.ledger.openObservers()).toHaveLength(observerCount);
    expect(harness.ledger.openStorageListeners()).toBe(listenerCount);
  });

  it('never overwrites a host-replaced or host-updated node on disable', async () => {
    const replaced = reply();
    const updated = reply();
    await start();
    replaced.innerHTML = '<p>Host replacement **keep raw**</p>';
    updated.querySelector('strong')!.textContent = 'Host update';
    const hostNode = replaced.firstChild;

    setSwitch(false);
    await flush();
    await vi.advanceTimersByTimeAsync(150);

    expect(replaced.firstChild).toBe(hostNode);
    expect(replaced.textContent).toBe('Host replacement **keep raw**');
    expect(updated.textContent).toBe('before Host update after');
    expect(harness.ledger.openObservers()).toEqual([]);
  });

  it('cancels queued repairs on off and patches once after an immediate re-enable', async () => {
    await start();
    const pending = reply();
    await flush();
    setSwitch(false);
    await flush();
    await vi.advanceTimersByTimeAsync(150);
    expect(pending.querySelector('strong')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    setSwitch(true);
    await flush();
    await vi.advanceTimersByTimeAsync(150);
    expect(pending.querySelectorAll('strong')).toHaveLength(1);
  });

  it('restores default on when the sync key is removed live without writing it back', async () => {
    harness.storage.sync.set(SWITCH, false);
    const response = reply();
    await start();
    expect(response.querySelector('strong')).toBeNull();
    harness.storage.sync.delete(SWITCH);
    harness.emitStorageChange({ [SWITCH]: { oldValue: false } }, 'sync');
    await flush();
    expect(statusOf()).toBe('mounted');
    expect(response.querySelector('strong')?.textContent).toBe('bold');
    expect(harness.storage.sync.has(SWITCH)).toBe(false);
  });

  it('stops patching new replies after a content-script handoff while keeping completed fixes', async () => {
    const fixed = reply();
    await start();
    const pending = reply();
    await flush();
    host!.stop();
    await flush();
    const after = reply();
    await vi.advanceTimersByTimeAsync(150);
    expect(fixed.querySelector('strong')?.textContent).toBe('bold');
    expect(pending.querySelector('strong')).toBeNull();
    expect(after.querySelector('strong')).toBeNull();
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does nothing without admission even with an explicit on', async () => {
    harness.storage.sync.set(SWITCH, true);
    const response = reply();
    await start(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(statusOf()).not.toBe('mounted');
    expect(response.querySelector('strong')).toBeNull();
    expect(harness.ledger.openObservers()).toEqual([]);
  });

  it('only admits at the native start point and leaves patching to PluginHost', async () => {
    const response = reply();
    const admission = createOfficialAdmission();
    await createGeminiBuiltinStartup(admission, cleanupManager).startMarkdownFix();
    admission.close();
    await flush();
    expect(admission.stateOf(ID)).toBe('admitted');
    expect(response.querySelector('strong')).toBeNull();
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.ledger.openStorageListeners()).toBe(0);
  });
});
