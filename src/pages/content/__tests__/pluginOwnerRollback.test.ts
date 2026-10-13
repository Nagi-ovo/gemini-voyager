/** Owner policy must retain stored local imports when a restored build closes their handlers. */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { LocalPluginSource } from '@/features/plugins/local/LocalPluginSource';
import type { LocalPluginRecordMap } from '@/features/plugins/local/localPluginStore';
import { validateLocalManifest } from '@/features/plugins/local/validateLocalManifest';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';

import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';

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
const LOCAL_COLLAPSE = 'local.me.gemini-collapse';
const LOCAL_SEND = 'local.me.gemini-send';

const storedLocalPlugins: LocalPluginRecordMap = {
  [LOCAL_SEND]: {
    manifest: {
      id: LOCAL_SEND,
      name: 'My send shortcut',
      version: '1.0.0',
      description: 'Use Ctrl+Enter to send',
      author: 'me',
      category: 'productivity',
      license: 'MIT',
      engine: '>=1.8.0',
      tier: 'declarative',
      matches: ['https://gemini.google.com/*'],
      contributes: { domOps: [{ op: 'native', handler: 'sendShortcut', params: {} }] },
    },
    importedAt: 1,
    updatedAt: 1,
  },
  [LOCAL_COLLAPSE]: {
    manifest: {
      id: LOCAL_COLLAPSE,
      name: 'My code collapse',
      version: '1.0.0',
      description: 'Fold long code blocks',
      author: 'me',
      category: 'productivity',
      license: 'MIT',
      engine: '>=1.8.0',
      tier: 'declarative',
      matches: ['https://gemini.google.com/*'],
      contributes: { domOps: [{ op: 'native', handler: 'codeCollapse', params: {} }] },
    },
    importedAt: 1,
    updatedAt: 1,
  },
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

async function flush(): Promise<void> {
  for (let i = 0; i < 8; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  formula.starts = 0;
  const state = {
    [LOCAL_FORMULA]: { enabled: true, installedAt: 1 },
    [LOCAL_COLLAPSE]: { enabled: true, installedAt: 1 },
    [LOCAL_SEND]: { enabled: true, installedAt: 1 },
    // A stale "on" in plugin state for an official plugin is ignored as well.
    [OFFICIAL_PLUGIN_IDS.geminiHideInputHalo]: { enabled: true, installedAt: 1 },
  };
  (chrome.storage.local.get as unknown as Mock).mockResolvedValue({ gvPluginsState: state });
});

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset();
});

describe('closed owner host policy', () => {
  it('keeps a stored local plugin listed and enabled, reported as blocked by host policy, and mounts no official plugin', async () => {
    // Import would refuse them now; reading what the user already stored does not.
    expect(validateLocalManifest(storedLocalPlugins[LOCAL_FORMULA].manifest).success).toBe(false);
    expect(validateLocalManifest(storedLocalPlugins[LOCAL_COLLAPSE].manifest).success).toBe(false);
    expect(validateLocalManifest(storedLocalPlugins[LOCAL_SEND].manifest).success).toBe(false);
    registerBuiltinNativeHandlers();

    // A restored legacy owner closes its public handlers; stored records remain intact.
    const admission = createOfficialAdmission();
    admission.close();
    const pluginHost = new PluginHost({
      url: GEMINI_URL,
      sources: [
        new BundledCatalogPluginSource(),
        new BuiltinPluginSource(),
        new LocalPluginSource({ loadRecords: async () => storedLocalPlugins }),
      ],
      doc: document,
      admission,
      // The opt-in switches on; the stage 3 renderers are on while their keys are unset.
      legacySettings: {
        load: async () => ({
          [StorageKeys.INPUT_HALO_HIDDEN]: true,
          [StorageKeys.INPUT_VIM_MODE]: true,
          [StorageKeys.CHAT_FONT_SIZE_ENABLED]: true,
          [StorageKeys.CHAT_LINE_HEIGHT_ENABLED]: true,
          [StorageKeys.CHAT_WIDTH_ENABLED]: true,
          [StorageKeys.PROMPT_HISTORY_ENABLED]: true,
          [StorageKeys.INPUT_COLLAPSE_ENABLED]: true,
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
      { id: LOCAL_SEND, version: '1.0.0', kind: 'blocked', blockedReason: 'host-policy' },
      { id: LOCAL_COLLAPSE, version: '1.0.0', kind: 'blocked', blockedReason: 'host-policy' },
      { id: LOCAL_FORMULA, version: '1.0.0', kind: 'blocked', blockedReason: 'host-policy' },
    ]);
    expect(document.documentElement.innerHTML).not.toContain('chat-loading-animation');
    expect(document.querySelector('style[data-gv-plugin]')).toBeNull();
    expect(document.getElementById('gv-plugin-chat-width')).toBeNull();
    expect(document.querySelector('.gv-ph-trigger')).toBeNull();
    expect(document.getElementById('gemini-voyager-input-collapse')).toBeNull();
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    pluginHost.stop();
  });
});
