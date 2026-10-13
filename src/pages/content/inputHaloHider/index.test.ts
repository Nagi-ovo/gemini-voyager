// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';
import type { PluginManifest } from '@/features/plugins/types';
import { beforeValue, elementValue } from '@/tests/pseudoElementPaint';

const KEY = StorageKeys.INPUT_HALO_HIDDEN;
const ID = OFFICIAL_PLUGIN_IDS.geminiHideInputHalo;
let plugin: PluginManifest;
let hosts: PluginHost[] = [];

function startHost(load: () => Promise<LegacySettingSnapshot>) {
  let changed: ((changes: LegacySettingSnapshot) => void) | null = null;
  const admission = createOfficialAdmission();
  admission.admit('gemini', 'hideInputHalo');
  const host = new PluginHost({
    url: location.href,
    doc: document,
    admission,
    isTopFrame: true,
    sources: [{ id: 'bundled', list: async () => [plugin] }],
    legacySettings: {
      load,
      subscribe(listener) {
        changed = listener;
        return () => {
          changed = null;
        };
      },
    },
    requestCatalogRefresh: () => {},
  });
  hosts.push(host);
  return { host, fire: (value: boolean) => changed?.({ [KEY]: value }) };
}
const mounted = () => Boolean(document.querySelector(`style[data-gv-plugin="${ID}"]`));

beforeEach(async () => {
  plugin = (await new BundledCatalogPluginSource().list()).find((item) => item.id === ID)!;
  expect(plugin).toBeDefined();
  document.head.replaceChildren();
  document.body.innerHTML =
    '<chat-window></chat-window><chat-loading-animation></chat-loading-animation><div class="nl-canvas"></div>';
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: {} });
});

afterEach(async () => {
  hosts.splice(0).forEach((host) => host.stop());
  await vi.waitFor(() => expect(mounted()).toBe(false));
  vi.restoreAllMocks();
  document.head.replaceChildren();
  document.body.replaceChildren();
});

describe('the packaged input halo plugin', () => {
  it('hides the halo and both blurred surfaces while on, and follows the original switch until stopped', async () => {
    const { host, fire } = startHost(async () => ({ [KEY]: true }));
    await host.start();
    await vi.waitFor(() => expect(mounted()).toBe(true));
    expect(beforeValue(document.querySelector('chat-window')!, 'background')).toBe('transparent');
    expect(beforeValue(document.querySelector('chat-window')!, 'background-image')).toBe('none');
    expect(elementValue(document.querySelector('chat-loading-animation')!, 'display')).toBe('none');
    expect(elementValue(document.querySelector('.nl-canvas')!, 'display')).toBe('none');
    fire(false);
    await vi.waitFor(() => expect(mounted()).toBe(false));
    fire(true);
    await vi.waitFor(() => expect(mounted()).toBe(true));
    host.stop();
    await vi.waitFor(() => expect(mounted()).toBe(false));
    fire(true);
    expect(mounted()).toBe(false);
  });

  it('stays stopped when the enabled startup read lands after stop', async () => {
    let resolveRead!: (value: LegacySettingSnapshot) => void;
    const { host } = startHost(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const starting = host.start();
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf('function'));
    host.stop();
    resolveRead({ [KEY]: true });
    await starting;
    expect(mounted()).toBe(false);
  });

  it('keeps a live show choice when an older hide read lands after it', async () => {
    let resolveRead!: (value: LegacySettingSnapshot) => void;
    const { host, fire } = startHost(
      () =>
        new Promise((resolve) => {
          resolveRead = resolve;
        }),
    );
    const starting = host.start();
    await vi.waitFor(() => expect(resolveRead).toBeTypeOf('function'));
    fire(false);
    resolveRead({ [KEY]: true });
    await starting;
    expect(mounted()).toBe(false);
  });
});
