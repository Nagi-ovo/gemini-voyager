/**
 * Cold start on Gemini once formula copy is owned by its packaged official
 * plugin. The official plugin's on/off is a legacy setting read beside the
 * host's start-up, so for a moment nobody knows whether it runs. A local
 * plugin that needs the same page-wide runtime must not take it in that
 * moment: once taken, the incumbent rule would keep the official plugin out
 * for the rest of the page's life.
 *
 * Runs on the real owner table, which hands Gemini formula copy to the
 * plugin, so the host policy, the admission and the host all see what the
 * build ships; the formula runtime is a counter.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import geminiFormulaJson from '../catalog/sites/gemini/plugins/formula-copy/plugin.json';
import { validateManifest } from '../manifest/validate';
import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import { hostPolicyRefusal } from '../sites/hostPolicy';
import type { LegacySettingSnapshot } from '../storage/legacySettingBindings';
import type { PluginManifest, PluginSource } from '../types';
import { PluginHost } from './PluginHost';
import type { LegacySettingsSource } from './legacySnapshotFeed';
import { type OfficialAdmissionController, createOfficialAdmission } from './officialAdmission';
import type { PluginStatus } from './pluginStatus';

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
const OFFICIAL_ID = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;
const FORMULA_KEY = StorageKeys.FORMULA_COPY_ENABLED;

function parsed(raw: unknown): PluginManifest {
  const result = validateManifest(raw);
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data;
}

const official = parsed(geminiFormulaJson);
const localFormula: PluginManifest = {
  ...official,
  id: 'local.me.gemini-formula',
  author: 'me',
  i18n: undefined,
};
const localTweak: PluginManifest = {
  id: 'local.me.gemini-tweak',
  name: 'Tweak',
  version: '1.0.0',
  description: 'd',
  author: 'me',
  category: 'other',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: ['https://gemini.google.com/*'],
  contributes: {
    styles: [{ css: '.gv-gemini-tweak{outline:1px solid red}' }],
    domOps: [
      { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-gemini-tweak' },
    ],
  },
};
const tweakMounted = (): boolean => document.body.classList.contains('gv-gemini-tweak');

/** A legacy settings source whose initial read stays open until the test settles it. */
function deferredLegacy() {
  let resolveLoad: (snapshot: LegacySettingSnapshot) => void = () => {};
  let rejectLoad: (error: unknown) => void = () => {};
  const loaded = new Promise<LegacySettingSnapshot>((resolve, reject) => {
    resolveLoad = resolve;
    rejectLoad = reject;
  });
  const legacySettings: LegacySettingsSource = { load: () => loaded, subscribe: () => () => {} };
  return {
    legacySettings,
    resolve: (snapshot: LegacySettingSnapshot) => resolveLoad(snapshot),
    reject: (error: unknown) => rejectLoad(error),
  };
}

function enableLocal(...ids: string[]): void {
  const state = Object.fromEntries(ids.map((id) => [id, { enabled: true, installedAt: 1 }]));
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: state });
}

function geminiHost(
  legacySettings: LegacySettingsSource,
  admission: OfficialAdmissionController,
): PluginHost {
  const packaged: PluginSource = { id: 'bundled', list: async () => [official] };
  const local: PluginSource = {
    id: 'local',
    kind: 'local',
    list: async () => [localFormula, localTweak],
  };
  return new PluginHost({
    url: GEMINI_URL,
    sources: [packaged, local],
    doc: document,
    admission,
    legacySettings,
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
}

function statusOf(pluginHost: PluginHost, id: string): Partial<PluginStatus> {
  const status = pluginHost.getStatuses().find((entry) => entry.id === id);
  if (!status) return {};
  const { kind, blockedReason, blockedBy } = status;
  return kind === 'no-effect'
    ? { kind: 'mounted' }
    : { kind, ...(blockedReason ? { blockedReason } : {}), ...(blockedBy ? { blockedBy } : {}) };
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

const PENDING = { kind: 'blocked', blockedReason: 'pending', blockedBy: OFFICIAL_ID };
const CONFLICT = { kind: 'blocked', blockedReason: 'conflict', blockedBy: OFFICIAL_ID };

beforeEach(() => {
  formula.starts = 0;
  formula.live = 0;
  document.body.className = '';
  enableLocal(localFormula.id, localTweak.id);
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.onChanged.addListener as unknown as Mock).mockClear();
});

describe('Gemini cold start with formula copy owned by its official plugin', () => {
  it('runs on the real owner table: the host policy lets both formula plugins in', () => {
    expect(hostPolicyRefusal(GEMINI_URL, official)).toBeNull();
    expect(hostPolicyRefusal(GEMINI_URL, localFormula)).toBeNull();
  });

  it.each([
    ['pending', false],
    ['admitted', true],
  ])(
    'keeps a local formula plugin off while the legacy switch is unread (admission %s), and nothing else',
    async (_label, admitFirst) => {
      const legacy = deferredLegacy();
      const admission = createOfficialAdmission();
      if (admitFirst) admission.admit('gemini', 'formulaCopy');
      const pluginHost = geminiHost(legacy.legacySettings, admission);

      await pluginHost.start(); // never waits on the legacy read
      await flush();
      expect(formula.starts).toBe(0);
      expect(statusOf(pluginHost, localFormula.id)).toEqual(PENDING);
      expect(statusOf(pluginHost, OFFICIAL_ID)).toEqual({ kind: 'ready' });
      expect(tweakMounted()).toBe(true);
      expect(statusOf(pluginHost, localTweak.id)).toEqual({ kind: 'mounted' });

      // Once the switch reads on, the official plugin takes the runtime (on admission).
      legacy.resolve({});
      admission.admit('gemini', 'formulaCopy');
      await flush();
      expect(formula.starts).toBe(1);
      expect(statusOf(pluginHost, OFFICIAL_ID)).toEqual({ kind: 'mounted' });
      expect(statusOf(pluginHost, localFormula.id)).toEqual(CONFLICT);
      expect(tweakMounted()).toBe(true);
      pluginHost.stop();
    },
  );

  it('hands the wait over to the reservation when the switch reads on, and the runtime to the official plugin once admitted', async () => {
    const legacy = deferredLegacy();
    const admission = createOfficialAdmission();
    const pluginHost = geminiHost(legacy.legacySettings, admission);
    await pluginHost.start();
    await flush();

    legacy.resolve({}); // missing key: formula copy is on by default
    await flush();
    expect(formula.starts).toBe(0);
    expect(statusOf(pluginHost, localFormula.id)).toEqual(CONFLICT);

    admission.admit('gemini', 'formulaCopy');
    await flush();
    expect(formula.starts).toBe(1);
    expect(formula.live).toBe(1);
    expect(statusOf(pluginHost, OFFICIAL_ID)).toEqual({ kind: 'mounted' });
    expect(statusOf(pluginHost, localFormula.id)).toEqual(CONFLICT);
    expect(tweakMounted()).toBe(true);
    pluginHost.stop();
  });

  it('starts the local plugin as soon as the switch reads off', async () => {
    const legacy = deferredLegacy();
    const admission = createOfficialAdmission();
    const pluginHost = geminiHost(legacy.legacySettings, admission);
    await pluginHost.start();
    await flush();

    legacy.resolve({ [FORMULA_KEY]: false });
    await flush();
    expect(formula.starts).toBe(1);
    expect(statusOf(pluginHost, localFormula.id)).toEqual({ kind: 'mounted' });

    admission.admit('gemini', 'formulaCopy');
    await flush();
    expect(formula.starts).toBe(1);
    expect(statusOf(pluginHost, OFFICIAL_ID)).toEqual({ kind: 'ready' });
    pluginHost.stop();
  });

  it('stops waiting once the admission is denied, read or not', async () => {
    const legacy = deferredLegacy();
    const admission = createOfficialAdmission();
    const pluginHost = geminiHost(legacy.legacySettings, admission);
    await pluginHost.start();
    await flush();

    admission.close();
    await flush();
    expect(formula.starts).toBe(1);
    expect(statusOf(pluginHost, localFormula.id)).toEqual({ kind: 'mounted' });
    pluginHost.stop();
  });

  it('hands the reserved runtime to the local plugin when the admission closes without the official one', async () => {
    const legacy = deferredLegacy();
    const admission = createOfficialAdmission();
    const pluginHost = geminiHost(legacy.legacySettings, admission);
    await pluginHost.start();
    legacy.resolve({});
    await flush();
    expect(statusOf(pluginHost, localFormula.id)).toEqual(CONFLICT);

    admission.close();
    await flush();
    expect(formula.starts).toBe(1);
    expect(statusOf(pluginHost, localFormula.id)).toEqual({ kind: 'mounted' });
    pluginHost.stop();
  });

  it('lets the local plugin run, and never the official one, when the legacy read fails for good', async () => {
    const legacy = deferredLegacy();
    const admission = createOfficialAdmission();
    admission.admit('gemini', 'formulaCopy');
    const pluginHost = geminiHost(legacy.legacySettings, admission);
    await pluginHost.start();
    await flush();
    expect(statusOf(pluginHost, localFormula.id)).toEqual(PENDING);

    legacy.reject(new Error('Extension context invalidated.'));
    await flush();
    // No snapshot will ever come: not a missing key read as "on", and no endless wait.
    expect(formula.starts).toBe(1);
    expect(statusOf(pluginHost, localFormula.id)).toEqual({ kind: 'mounted' });
    expect(statusOf(pluginHost, OFFICIAL_ID)).toEqual({ kind: 'ready' });
    expect(tweakMounted()).toBe(true);
    pluginHost.stop();
  });
});
