/**
 * The host on Gemini while the owner table keeps every feature 'legacy' (the
 * rollback build): the native modules run those features, so their packaged
 * official plugins never mount and are never listed, and a local plugin
 * calling a primitive the rollback closed again is reported `blocked:
 * host-policy` and stays enabled.
 *
 * The owner table is replaced for this file only; the formula runtime is a
 * counter. Pure-CSS halo is the case host policy has nothing against, so it
 * is what shows the owner check alone keeps a legacy-owned plugin off, even
 * under an admission that (wrongly) admits it.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import geminiFormulaJson from '../catalog/sites/gemini/plugins/formula-copy/plugin.json';
import haloJson from '../catalog/sites/gemini/plugins/hide-input-halo/plugin.json';
import { validateManifest } from '../manifest/validate';
import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import { hostPolicyRefusal } from '../sites/hostPolicy';
import type { PluginManifest, PluginSource } from '../types';
import { PluginHost } from './PluginHost';
import { type OfficialAdmission, createOfficialAdmission } from './officialAdmission';

vi.mock('../sites/featureOwners', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sites/featureOwners')>();
  const owners = actual.FEATURE_OWNERS.map((entry) => ({ ...entry, owner: 'legacy' as const }));
  // Every helper closes over the module's own table: rebind each to the rolled-back one.
  const byId = (id: string) => owners.find((entry) => entry.officialPluginId === id) ?? null;
  return {
    ...actual,
    FEATURE_OWNERS: owners,
    featureOwner: (site: string, feature: string) =>
      owners.find((entry) => entry.site === site && entry.feature === feature)?.owner ?? 'legacy',
    ownedFeatureByPluginId: byId,
    tracksPluginHealth: (id: string) => byId(id)?.healthTracking ?? true,
    legacyOwnedHandlers: (site: string, list = owners) => actual.legacyOwnedHandlers(site, list),
    pluginOwnedHandlers: (site: string, list = owners) => actual.pluginOwnedHandlers(site, list),
  };
});

const formula = vi.hoisted(() => ({ starts: 0 }));

vi.mock('@/features/formulaCopy', () => ({
  activateFormulaCopy: (scope: { effect: (run: () => () => void, label: string) => void }) => {
    scope.effect(() => {
      formula.starts += 1;
      return () => {};
    }, 'formula-copy');
  },
}));

const GEMINI_URL = 'https://gemini.google.com/app/abc';
const HALO_CSS_MARKER = 'gv-legacy-owner-halo';

function parsed(raw: unknown): PluginManifest {
  const result = validateManifest(raw);
  if (!result.success) throw new Error(JSON.stringify(result.error));
  return result.data;
}

const officialFormula = parsed(geminiFormulaJson);
// The packaged manifest with its stylesheet inlined, as the bundled source loads it.
const halo = parsed({
  ...haloJson,
  contributes: { styles: [{ css: `.${HALO_CSS_MARKER}{display:none}` }] },
});
const localFormula: PluginManifest = {
  ...officialFormula,
  id: 'local.me.gemini-formula',
  author: 'me',
  i18n: undefined,
};

/** An admission that admits everything, the owner-table ids included. */
const ADMITS_ALL: OfficialAdmission = {
  stateOf: () => 'admitted',
  subscribe: () => () => {},
};

let state: Record<string, { enabled: boolean; installedAt: number }> = {};

function enable(...ids: string[]): void {
  state = Object.fromEntries(ids.map((id) => [id, { enabled: true, installedAt: 1 }]));
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: state });
}

function geminiHost(plugins: readonly PluginManifest[], admission: OfficialAdmission): PluginHost {
  const packaged: PluginSource = {
    id: 'bundled',
    list: async () => plugins.filter((plugin) => !plugin.id.startsWith('local.')),
  };
  const local: PluginSource = {
    id: 'local',
    kind: 'local',
    list: async () => plugins.filter((plugin) => plugin.id.startsWith('local.')),
  };
  return new PluginHost({
    url: GEMINI_URL,
    sources: [packaged, local],
    doc: document,
    admission,
    // Every legacy switch reads on: only the owner keeps the official plugins off.
    legacySettings: {
      load: async () => ({
        [StorageKeys.FORMULA_COPY_ENABLED]: true,
        [StorageKeys.INPUT_HALO_HIDDEN]: true,
        [StorageKeys.INPUT_VIM_MODE]: true,
      }),
      subscribe: () => () => {},
    },
    requestCatalogRefresh: () => {},
    isTopFrame: true,
  });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 6; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  formula.starts = 0;
  state = {};
  // A failed case never reaches stop(): keep its injected styles out of the next one.
  for (const node of document.querySelectorAll('[data-gv-plugin]')) node.remove();
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
  (chrome.storage.onChanged.addListener as unknown as Mock).mockClear();
});

describe('Gemini with every owned feature kept by its native module', () => {
  it('reports a refused local plugin as blocked and keeps it enabled; the legacy-owned official one stays unlisted', async () => {
    enable(localFormula.id, officialFormula.id);
    const pluginHost = geminiHost([localFormula, officialFormula], createOfficialAdmission());
    await pluginHost.start();
    await flush();

    expect(formula.starts).toBe(0);
    expect(pluginHost.getStatuses()).toEqual([
      { id: localFormula.id, version: '1.0.0', kind: 'blocked', blockedReason: 'host-policy' },
    ]);
    expect(state[localFormula.id]?.enabled).toBe(true);
    pluginHost.stop();
  });

  it.each([
    ['an admission that admits every id', () => ADMITS_ALL],
    [
      'the real admission after every admit',
      () => {
        const admission = createOfficialAdmission();
        admission.admit('gemini', 'formulaCopy');
        admission.admit('gemini', 'vimInput');
        admission.admit('gemini', 'hideInputHalo');
        return admission;
      },
    ],
  ])(
    'never mounts or lists a legacy-owned official plugin under %s, pure CSS included',
    async (_label, admission) => {
      expect(halo.id).toBe(OFFICIAL_PLUGIN_IDS.geminiHideInputHalo);
      expect(halo.contributes.domOps ?? []).toEqual([]);
      expect(hostPolicyRefusal(GEMINI_URL, halo)).toBeNull();
      enable(halo.id, officialFormula.id);
      const pluginHost = geminiHost([halo, officialFormula], admission());
      await pluginHost.start();
      await flush();

      expect(document.documentElement.innerHTML).not.toContain(HALO_CSS_MARKER);
      expect(formula.starts).toBe(0);
      expect(pluginHost.getStatuses()).toEqual([]);
      pluginHost.stop();
    },
  );
});
