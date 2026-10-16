// @vitest-environment-options { "url": "https://gemini.google.com/u/0/app/test" }
/**
 * Gemini edit input width through its registered official plugin: the real
 * builtin source, PluginHost, legacy snapshot feed and handler, admitted at
 * the content script's layout start point. The old sync keys stay the only
 * authority, so a user's existing choice carries over unchanged.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';

import { startGeminiChatAppearance } from '../appearanceStartup';
import { EDIT_INPUT_WIDTH_STYLE_ID } from '../editInputWidth/pluginHandler';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { type LifecycleHarness, installLifecycleHarness } from './lifecycleHarness';

const ID = OFFICIAL_PLUGIN_IDS.geminiEditInputWidth;
const SWITCH = StorageKeys.EDIT_INPUT_WIDTH_ENABLED;
const WIDTH = StorageKeys.EDIT_INPUT_WIDTH;
let harness: LifecycleHarness;
let host: PluginHost | null;

async function flush(): Promise<void> {
  for (let round = 0; round < 60; round++) await Promise.resolve();
}

/** The content script's layout start point, then the host it admits to. */
async function start(): Promise<PluginHost> {
  const admission = createOfficialAdmission();
  await startGeminiChatAppearance(admission);
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
  return host;
}

/** A popup write: stored, then announced the way `chrome.storage.onChanged` does. */
function popupWrites(values: Record<string, unknown>): void {
  const changes: Record<string, { newValue?: unknown }> = {};
  for (const [key, value] of Object.entries(values)) {
    harness.storage.sync.set(key, value);
    changes[key] = { newValue: value };
  }
  harness.emitStorageChange(changes, 'sync');
}

const sheet = (): HTMLStyleElement | null =>
  document.getElementById(EDIT_INPUT_WIDTH_STYLE_ID) as HTMLStyleElement | null;
const statusOf = (): string | undefined =>
  host?.getStatuses().find((entry) => entry.id === ID)?.kind;

beforeAll(registerBuiltinNativeHandlers);
beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '<main></main>';
  harness = installLifecycleHarness();
  host = null;
  // A stale plugins-state entry (an old plugins backup) never decides an official switch.
  harness.storage.local.set(StorageKeys.PLUGINS_STATE, {
    [ID]: { enabled: true, installedAt: 1, settings: { widthPercent: 95 } },
  });
});

afterEach(async () => {
  host?.stop();
  await flush();
  harness.restore();
  vi.restoreAllMocks();
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('Gemini edit input width through its registered official plugin', () => {
  it('stays off for a user who never touched it, whatever the plugins state says', async () => {
    await start();
    expect(statusOf()).not.toBe('mounted');
    expect(sheet()).toBeNull();
    // Nothing watches Gemini while it is off.
    expect(harness.ledger.openObservers()).toEqual([]);
    expect(harness.storage.sync.has(SWITCH)).toBe(false);
  });

  it('keeps an explicit off beside a customized width off', async () => {
    harness.storage.sync.set(SWITCH, false);
    harness.storage.sync.set(WIDTH, 85);
    await start();
    expect(statusOf()).not.toBe('mounted');
    expect(sheet()).toBeNull();
    expect(harness.storage.sync.get(SWITCH)).toBe(false);
  });

  it('keeps an explicit on at the stored width, not the plugins-state one', async () => {
    harness.storage.sync.set(SWITCH, true);
    harness.storage.sync.set(WIDTH, 72);
    await start();
    expect(statusOf()).toBe('mounted');
    expect(sheet()?.textContent).toContain('max-width: 72vw !important');
    expect(sheet()?.textContent).not.toContain('95vw');
  });

  it('turns on a pre-switch customized width and stores the switch and its percent once', async () => {
    // Saved before the switch existed, in the old px unit: 960 of 1200 px is 80 %.
    harness.storage.sync.set(WIDTH, 960);
    await start();
    expect(statusOf()).toBe('mounted');
    expect(sheet()?.textContent).toContain('max-width: 80vw !important');
    await vi.waitFor(() => expect(harness.storage.sync.get(SWITCH)).toBe(true));
    expect(harness.storage.sync.get(WIDTH)).toBe(80);
  });

  it('follows the popup switch and slider live, and leaves nothing behind when off', async () => {
    harness.storage.sync.set(SWITCH, false);
    harness.storage.sync.set(WIDTH, 70);
    await start();
    expect(sheet()).toBeNull();

    popupWrites({ [SWITCH]: true });
    await flush();
    expect(statusOf()).toBe('mounted');
    const style = sheet();
    expect(style?.textContent).toContain('max-width: 70vw !important');

    popupWrites({ [WIDTH]: 45 });
    await flush();
    // The width lands in place: the running plugin is not remounted.
    expect(sheet()).toBe(style);
    expect(style?.textContent).toContain('max-width: 45vw !important');

    popupWrites({ [SWITCH]: false });
    await flush();
    expect(statusOf()).not.toBe('mounted');
    expect(sheet()).toBeNull();
    expect(harness.ledger.openObservers()).toEqual([]);
    // Off keeps the width the user chose.
    expect(harness.storage.sync.get(WIDTH)).toBe(45);
  });

  it('does not run on a page whose start point never admitted it', async () => {
    harness.storage.sync.set(SWITCH, true);
    const admission = createOfficialAdmission();
    // Enterprise and custom coverage return before the layout start point.
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
    expect(admission.stateOf(ID)).toBe('denied');
    expect(sheet()).toBeNull();
  });

  it('starts nothing natively at the layout start point: only the plugin draws the width', async () => {
    harness.storage.sync.set(SWITCH, true);
    harness.storage.sync.set(WIDTH, 80);
    const admission = createOfficialAdmission();
    await startGeminiChatAppearance(admission);
    admission.close();
    await flush();
    expect(admission.stateOf(ID)).toBe('admitted');
    expect(document.querySelectorAll('style')).toHaveLength(0);
    expect(harness.ledger.openStorageListeners()).toBe(0);
  });
});
