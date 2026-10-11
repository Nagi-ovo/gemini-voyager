/**
 * Gemini and AI Studio with formula copy owned by its packaged official
 * plugin, on the owner table this build ships (nothing here replaces it): the
 * content start point admits the official plugin instead of starting the
 * native module, and the real bundled catalog, local source and host decide
 * what runs. The formula runtime is a counter.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { LocalPluginSource } from '@/features/plugins/local/LocalPluginSource';
import type { LocalPluginRecordMap } from '@/features/plugins/local/localPluginStore';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import type { LegacySettingsSource } from '@/features/plugins/runtime/legacySnapshotFeed';
import {
  type OfficialAdmissionController,
  createOfficialAdmission,
} from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS, featureOwner } from '@/features/plugins/sites/featureOwners';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';

import { admitPluginOwnedFeature, startOwnedFeature } from '../featureOwnerStartup';

const formula = vi.hoisted(() => ({ starts: 0, live: 0 }));

vi.mock('@/features/formulaCopy', () => ({
  activateFormulaCopy: (scope: { effect: (run: () => () => void, label: string) => void }) => {
    scope.effect(() => {
      formula.starts += 1;
      formula.live += 1;
      return () => {
        formula.live -= 1;
      };
    }, 'formula-copy');
  },
}));

const GEMINI_URL = 'https://gemini.google.com/app/abc';
const AISTUDIO_URL = 'https://aistudio.google.com/prompts/new_chat';
const FORMULA_KEY = StorageKeys.FORMULA_COPY_ENABLED;
const MASTER_KEY = StorageKeys.GV_AISTUDIO_ENABLED;
const LOCAL_FORMULA = 'local.me.gemini-formula';

/** A local formula plugin as the popup stored it, before the gate re-reads it. */
const storedLocalFormula: LocalPluginRecordMap = {
  [LOCAL_FORMULA]: {
    manifest: {
      id: LOCAL_FORMULA,
      name: 'My formula copy',
      version: '1.0.0',
      description: 'Click a formula to copy its LaTeX',
      author: 'me',
      category: 'productivity',
      license: 'MIT',
      engine: '>=1.3.0',
      tier: 'declarative',
      matches: ['https://gemini.google.com/*'],
      contributes: { domOps: [{ op: 'native', handler: 'formulaCopy', params: {} }] },
    },
    importedAt: 1,
    updatedAt: 1,
  },
};

function legacy(snapshot: LegacySettingSnapshot): LegacySettingsSource {
  return { load: async () => snapshot, subscribe: () => () => {} };
}

function enable(...ids: string[]): void {
  const state = Object.fromEntries(ids.map((id) => [id, { enabled: true, installedAt: 1 }]));
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: state });
}

function host(
  url: string,
  admission: OfficialAdmissionController,
  snapshot: LegacySettingSnapshot,
  records: LocalPluginRecordMap = {},
): PluginHost {
  return new PluginHost({
    url,
    sources: [
      new BundledCatalogPluginSource(),
      new LocalPluginSource({ loadRecords: async () => records }),
    ],
    doc: document,
    admission,
    legacySettings: legacy(snapshot),
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
}

function kindOf(pluginHost: PluginHost, id: string): string | undefined {
  const status = pluginHost.getStatuses().find((entry) => entry.id === id);
  if (!status) return undefined;
  if (status.kind === 'no-effect') return 'mounted';
  return status.kind === 'blocked' ? `blocked:${status.blockedReason}` : status.kind;
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  formula.starts = 0;
  formula.live = 0;
  enable(LOCAL_FORMULA);
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.sync.get as unknown as Mock).mockReset();
  (chrome.storage.onChanged.addListener as unknown as Mock).mockClear();
});

describe('Gemini formula copy owned by its official plugin', () => {
  it('admits the official plugin at the native start point instead of starting the native module', async () => {
    expect(featureOwner('gemini', 'formulaCopy')).toBe('plugin');
    const admission = createOfficialAdmission();
    const startLegacy = vi.fn(async () => {});

    await startOwnedFeature(admission, 'gemini', 'formulaCopy', startLegacy);

    expect(startLegacy).not.toHaveBeenCalled();
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)).toBe('admitted');
  });

  it('keeps the official plugin off when the legacy switch is off, and runs the user’s local one', async () => {
    const admission = createOfficialAdmission();
    await startOwnedFeature(admission, 'gemini', 'formulaCopy', async () => {});
    const pluginHost = host(GEMINI_URL, admission, { [FORMULA_KEY]: false }, storedLocalFormula);
    await pluginHost.start();
    await flush();

    expect(formula.starts).toBe(1);
    expect(formula.live).toBe(1);
    expect(kindOf(pluginHost, LOCAL_FORMULA)).toBe('mounted');
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)).toBe('ready');
    pluginHost.stop();
    expect(formula.live).toBe(0);
  });

  it('runs the official plugin once admitted when the legacy switch was never set, and keeps the local one waiting', async () => {
    const admission = createOfficialAdmission();
    await startOwnedFeature(admission, 'gemini', 'formulaCopy', async () => {});
    const pluginHost = host(GEMINI_URL, admission, {}, storedLocalFormula);
    await pluginHost.start();
    await flush();

    expect(formula.starts).toBe(1);
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiFormulaCopy)).toBe('mounted');
    expect(kindOf(pluginHost, LOCAL_FORMULA)).toBe('blocked:conflict');
    pluginHost.stop();
    expect(formula.live).toBe(0);
  });
});

describe('AI Studio formula copy under the master switch', () => {
  function setMaster(value: boolean): void {
    (chrome.storage.sync.get as unknown as Mock).mockImplementation(
      async (defaults: Record<string, unknown>) => ({ ...defaults, [MASTER_KEY]: value }),
    );
  }

  function fireMaster(value: boolean): void {
    const listeners = (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls;
    for (const [listener] of listeners) listener({ [MASTER_KEY]: { newValue: value } }, 'sync');
  }

  it('unmounts and remounts the official plugin as the switch goes off, on and off, writing nothing', async () => {
    enable();
    setMaster(false);
    const admission = createOfficialAdmission();
    // What initializeFeatures does on AI Studio with Voyager switched off.
    admitPluginOwnedFeature(admission, 'aistudio', 'formulaCopy');
    admission.close();
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy)).toBe('admitted');

    const pluginHost = host(AISTUDIO_URL, admission, {});
    await pluginHost.start();
    await flush();
    expect(formula.live).toBe(0);

    fireMaster(true);
    await flush();
    expect(formula.live).toBe(1);
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy)).toBe('mounted');

    fireMaster(false);
    await flush();
    expect(formula.live).toBe(0);

    fireMaster(true);
    await flush();
    expect(formula.starts).toBe(2);
    expect(formula.live).toBe(1);

    // The formula switch, its format and every plugin choice are left as they were.
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    pluginHost.stop();
    expect(formula.live).toBe(0);
  });
});
