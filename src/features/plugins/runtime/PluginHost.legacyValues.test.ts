/**
 * Official plugins whose settings are existing Voyager values (the Gemini
 * typography sliders): the host renders them from the legacy keys alone,
 * pushes a changed value into the running plugin, keeps the last number when
 * a value turns invalid, and never writes a normalized value back. The
 * packaged manifests run under their own ids, switches and value bindings on
 * the shipped owner table; only the plugin source is given.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import { BundledCatalogPluginSource } from '../sources/BundledCatalogPluginSource';
import type { LegacySettingSnapshot } from '../storage/legacySettingBindings';
import type { PluginManifest, PluginSource } from '../types';
import { PluginHost } from './PluginHost';
import { DeclarativeEngine } from './declarativeEngine';
import type { LegacySettingsSource } from './legacySnapshotFeed';
import { createOfficialAdmission } from './officialAdmission';

const FONT_SWITCH = StorageKeys.CHAT_FONT_SIZE_ENABLED;
const SPACING_SWITCH = StorageKeys.CHAT_LINE_HEIGHT_ENABLED;
const FONT_ID = OFFICIAL_PLUGIN_IDS.geminiChatFontSize;
const SPACING_ID = OFFICIAL_PLUGIN_IDS.geminiChatLineHeight;
const GEMINI_URL = 'https://gemini.google.com/app/abc';

async function packaged(id: string): Promise<PluginManifest> {
  const manifest = (await new BundledCatalogPluginSource().list()).find((m) => m.id === id);
  if (!manifest) throw new Error(`${id} is not packaged`);
  return manifest;
}

function liveLegacy(initial: LegacySettingSnapshot) {
  let listener: ((changed: LegacySettingSnapshot) => void) | null = null;
  const legacySettings: LegacySettingsSource = {
    load: async () => initial,
    subscribe(callback) {
      listener = callback;
      return () => {
        listener = null;
      };
    },
  };
  return { legacySettings, fire: (changed: LegacySettingSnapshot) => listener?.(changed) };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((r) => setTimeout(r, 0));
}

function pluginStyles(): HTMLStyleElement[] {
  return Array.from(document.querySelectorAll<HTMLStyleElement>('style[data-gv-plugin]'));
}

async function startHost(
  plugins: readonly PluginManifest[],
  legacySettings: LegacySettingsSource,
): Promise<PluginHost> {
  const admission = createOfficialAdmission();
  admission.admit('gemini', 'chatFontSize');
  admission.admit('gemini', 'chatLineHeight');
  const source: PluginSource = { id: 'bundled', list: async () => plugins };
  const host = new PluginHost({
    url: GEMINI_URL,
    sources: [source],
    doc: document,
    admission,
    legacySettings,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
  await host.start();
  await flush();
  return host;
}

let fontSize: PluginManifest;
let spacing: PluginManifest;

beforeEach(async () => {
  fontSize = await packaged(FONT_ID);
  spacing = await packaged(SPACING_ID);
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: {} });
  for (const node of document.querySelectorAll('[data-gv-plugin]')) node.remove();
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.sync.set as unknown as Mock).mockClear();
  vi.restoreAllMocks();
});

describe('PluginHost: official plugin settings from legacy values', () => {
  it("resolves a bound official plugin's settings only from its legacy keys and ignores stored plugin-state settings", async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginsState: {
        [FONT_ID]: { enabled: false, installedAt: 1, settings: { fontSize: 140 } },
        [SPACING_ID]: { enabled: true, installedAt: 1, settings: { lineHeight: 300 } },
      },
    });
    const legacy = liveLegacy({ [FONT_SWITCH]: true, [StorageKeys.CHAT_FONT_SIZE]: 120 });
    const host = await startHost([fontSize, spacing], legacy.legacySettings);

    // The spacing switch was never stored: off, whatever plugin state says.
    const [style] = pluginStyles();
    expect(pluginStyles()).toHaveLength(1);
    expect(style?.getAttribute('data-gv-plugin')).toBe(FONT_ID);
    expect(style?.textContent).toContain('--gv-chat-font-size: 120%;');
    expect(style?.textContent).not.toContain('140%');
    host.stop();
  });

  it('pushes a changed legacy value to the mounted plugin without remounting it', async () => {
    const mount = vi.spyOn(DeclarativeEngine.prototype, 'mount');
    const legacy = liveLegacy({ [FONT_SWITCH]: true, [StorageKeys.CHAT_FONT_SIZE]: 110 });
    const host = await startHost([fontSize], legacy.legacySettings);
    const [style] = pluginStyles();
    expect(style?.textContent).toContain('--gv-chat-font-size: 110%;');

    legacy.fire({ [StorageKeys.CHAT_FONT_SIZE]: 130 });
    await flush();
    expect(pluginStyles()).toEqual([style]);
    expect(style?.textContent).toContain('--gv-chat-font-size: 130%;');
    expect(mount).toHaveBeenCalledTimes(1);

    // A removed or non-numeric value keeps the last number, as the native listener did.
    legacy.fire({ [StorageKeys.CHAT_FONT_SIZE]: undefined });
    legacy.fire({ [StorageKeys.CHAT_FONT_SIZE]: 'huge' });
    await flush();
    expect(style?.textContent).toContain('--gv-chat-font-size: 130%;');
    host.stop();
  });

  it('clamps an out-of-range stored size when rendering without writing it back', async () => {
    const legacy = liveLegacy({ [FONT_SWITCH]: true, [StorageKeys.CHAT_FONT_SIZE]: 400 });
    const host = await startHost([fontSize], legacy.legacySettings);
    expect(pluginStyles()[0]?.textContent).toContain('--gv-chat-font-size: 150%;');

    legacy.fire({ [StorageKeys.CHAT_FONT_SIZE]: 10 });
    await flush();
    expect(pluginStyles()[0]?.textContent).toContain('--gv-chat-font-size: 80%;');
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    host.stop();
  });

  it('scales line height and paragraph spacing together under the one spacing switch', async () => {
    const legacy = liveLegacy({
      [SPACING_SWITCH]: true,
      [StorageKeys.CHAT_LINE_HEIGHT]: 180,
      [StorageKeys.CHAT_PARAGRAPH_SPACING]: 20,
    });
    const host = await startHost([spacing], legacy.legacySettings);
    const [style] = pluginStyles();
    expect(style?.textContent).toContain('--gv-chat-line-height: 180;');
    expect(style?.textContent).toContain('--gv-chat-paragraph-spacing: 20px;');

    legacy.fire({ [SPACING_SWITCH]: false });
    await flush();
    expect(pluginStyles()).toEqual([]);
    host.stop();
  });

  it('removes the typography styles when the legacy switch turns off and leaves no native style node', async () => {
    const legacy = liveLegacy({
      [FONT_SWITCH]: true,
      [SPACING_SWITCH]: true,
      [StorageKeys.CHAT_FONT_SIZE]: 120,
    });
    const host = await startHost([fontSize, spacing], legacy.legacySettings);
    expect(pluginStyles()).toHaveLength(2);

    for (let round = 0; round < 5; round += 1) {
      legacy.fire({ [FONT_SWITCH]: false, [SPACING_SWITCH]: false });
      await flush();
      legacy.fire({ [FONT_SWITCH]: true, [SPACING_SWITCH]: true });
      await flush();
    }
    expect(pluginStyles()).toHaveLength(2);

    legacy.fire({ [FONT_SWITCH]: false, [SPACING_SWITCH]: false });
    await flush();
    expect(pluginStyles()).toEqual([]);
    // The native modules' own style nodes never appear on the plugin path.
    expect(document.getElementById('gemini-voyager-chat-font-size')).toBeNull();
    expect(document.getElementById('gemini-voyager-chat-line-height')).toBeNull();
    expect(document.getElementById('gv-chat-paragraph-spacing-style')).toBeNull();
    host.stop();
  });
});
