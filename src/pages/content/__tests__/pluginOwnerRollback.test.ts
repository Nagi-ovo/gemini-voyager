/**
 * Rolling a feature back to its native module is one edit in the owner table.
 * This file replaces the table with every entry set back to 'legacy', so the
 * host policy, the admission and the host all see what that build would ship:
 * the native start path runs once, the official plugins never mount, and a
 * local plugin the user stored while the primitive was open stays listed and
 * enabled, reported as `blocked: host-policy`.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { LocalPluginSource } from '@/features/plugins/local/LocalPluginSource';
import type { LocalPluginRecordMap } from '@/features/plugins/local/localPluginStore';
import { validateLocalManifest } from '@/features/plugins/local/validateLocalManifest';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import {
  FEATURE_OWNERS,
  type FeatureOwner,
  OFFICIAL_PLUGIN_IDS,
  type OwnedFeatureId,
  type PackagedSiteId,
} from '@/features/plugins/sites/featureOwners';
import { allowsNativeHandler } from '@/features/plugins/sites/hostPolicy';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';

import { startOwnedFeature } from '../featureOwnerStartup';

vi.mock('@/features/plugins/sites/featureOwners', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/plugins/sites/featureOwners')>();
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
const LOCAL_FORMULA = 'local.me.gemini-formula';

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

/** The owner lookup `startOwnedFeature` is given, read from the rolled-back table. */
function ownerOf(site: PackagedSiteId, feature: OwnedFeatureId): FeatureOwner {
  return (
    FEATURE_OWNERS.find((entry) => entry.site === site && entry.feature === feature)?.owner ??
    'legacy'
  );
}

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  formula.starts = 0;
  const state = {
    [LOCAL_FORMULA]: { enabled: true, installedAt: 1 },
    // A stale "on" in plugin state for an official plugin is ignored as well.
    [OFFICIAL_PLUGIN_IDS.geminiHideInputHalo]: { enabled: true, installedAt: 1 },
  };
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: state });
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
});

describe('rolling every owned feature back to its native module', () => {
  it('closes the primitives again on Gemini and AI Studio', () => {
    expect(allowsNativeHandler('gemini', 'formulaCopy')).toBe(false);
    expect(allowsNativeHandler('gemini', 'vimInput')).toBe(false);
    expect(allowsNativeHandler('aistudio', 'formulaCopy')).toBe(false);
  });

  it('starts each native module exactly once and admits no official plugin', async () => {
    const admission = createOfficialAdmission();
    const started: string[] = [];
    for (const { site, feature } of FEATURE_OWNERS) {
      await startOwnedFeature(
        admission,
        site,
        feature,
        async () => {
          started.push(`${site}/${feature}`);
        },
        ownerOf,
      );
    }
    admission.close();

    expect(started).toEqual(FEATURE_OWNERS.map(({ site, feature }) => `${site}/${feature}`));
    for (const { officialPluginId } of FEATURE_OWNERS) {
      expect(admission.stateOf(officialPluginId)).toBe('denied');
    }
  });

  it('keeps a stored local plugin listed and enabled, reported as blocked by host policy, and mounts no official plugin', async () => {
    // Import would refuse it now; reading what the user already stored does not.
    expect(validateLocalManifest(storedLocalFormula[LOCAL_FORMULA].manifest).success).toBe(false);

    // The content start points run (natively) and close the admission, with
    // every legacy switch reading "on": no official plugin may start.
    const admission = createOfficialAdmission();
    const startLegacy = vi.fn(async () => {});
    for (const { site, feature } of FEATURE_OWNERS) {
      await startOwnedFeature(admission, site, feature, startLegacy, ownerOf);
    }
    admission.close();
    expect(startLegacy).toHaveBeenCalledTimes(FEATURE_OWNERS.length);
    const pluginHost = new PluginHost({
      url: GEMINI_URL,
      sources: [
        new BundledCatalogPluginSource(),
        new LocalPluginSource({ loadRecords: async () => storedLocalFormula }),
      ],
      doc: document,
      admission,
      legacySettings: {
        load: async () => ({
          [StorageKeys.INPUT_HALO_HIDDEN]: true,
          [StorageKeys.INPUT_VIM_MODE]: true,
        }),
        subscribe: () => () => {},
      },
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
    await pluginHost.start();
    await flush();

    expect(formula.starts).toBe(0);
    // The official plugins are the native modules' business: none is listed.
    expect(pluginHost.getStatuses()).toEqual([
      { id: LOCAL_FORMULA, version: '1.0.0', kind: 'blocked', blockedReason: 'host-policy' },
    ]);
    expect(document.documentElement.innerHTML).not.toContain('chat-loading-animation');
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    pluginHost.stop();
  });
});
