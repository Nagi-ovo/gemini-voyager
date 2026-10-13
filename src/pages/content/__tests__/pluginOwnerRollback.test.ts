/**
 * Rolling a feature back to its native module is one edit in the owner table.
 * This file replaces the table with every entry set back to 'legacy', so the
 * host policy, the admission, Gemini's real start points and the host all see
 * what that build would ship: the native start path runs once, the official
 * plugins never mount, and a local plugin the user stored while the primitive
 * was open stays listed and enabled, reported as `blocked: host-policy`. The
 * stage 3 native modules, native prompt history, input collapse, the research
 * pack, default model and fork are counters.
 */
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
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
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';

import { startGeminiChatAppearance } from '../appearanceStartup';
import { startOwnedFeature } from '../featureOwnerStartup';
import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { createGeminiInputStartup, startGeminiSendKeys } from '../inputStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { createGeminiRendererStartup } from '../rendererStartup';
import { createSelectionStartup } from '../selectionStartup';

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
const native = vi.hoisted(() => ({ started: [] as string[] }));

vi.mock('../chatWidth/index', () => ({
  startChatWidthAdjuster: () => native.started.push('chatWidth'),
}));
vi.mock('../chatFontSize/index', () => ({
  startChatFontSizeAdjuster: () => native.started.push('chatFontSize'),
}));
vi.mock('../chatLineHeight/index', () => ({
  startChatLineHeightAdjuster: () => native.started.push('chatLineHeight'),
}));
vi.mock('../chatParagraphSpacing/index', () => ({
  startChatParagraphSpacingAdjuster: () => native.started.push('chatParagraphSpacing'),
}));
vi.mock('../codeBlockCollapse', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../codeBlockCollapse')>()),
  startCodeBlockCollapse: () => {
    native.started.push('codeCollapse');
    return () => {};
  },
}));
vi.mock('../userLatex/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../userLatex/index')>()),
  startUserLatex: () => {
    native.started.push('userLatex');
    return () => {};
  },
}));
// The three diagram modules return no stop: rolled back, they leave only on unload.
vi.mock('../mermaid/index', () => ({ startMermaid: () => native.started.push('mermaid') }));
vi.mock('../wavedrom/index', () => ({ startWaveDrom: () => native.started.push('waveDrom') }));
vi.mock('../echarts/index', () => ({ startEcharts: () => native.started.push('echarts') }));
vi.mock('../promptHistory/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../promptHistory/index')>()),
  startPromptHistory: async () => {
    native.started.push('promptHistory');
    return () => {};
  },
}));
vi.mock('../inputCollapse/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../inputCollapse/index')>()),
  startInputCollapse: () => {
    native.started.push('inputCollapse');
    return () => {};
  },
}));

vi.mock('../researchPack/index', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../researchPack/index')>()),
  startResearchPack: () => {
    native.started.push('researchPack');
    return () => {};
  },
}));
vi.mock('../defaultModel/modelLocker', () => ({
  startDefaultModelNative: () => {
    native.started.push('defaultModel');
    return () => {};
  },
}));
vi.mock('../fork/index', () => ({
  startFork: () => {
    native.started.push('fork');
    return () => {};
  },
}));
vi.mock('../quoteReply/quoteAction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../quoteReply/quoteAction')>()),
  startQuoteAction: () => {
    native.started.push('quoteReply');
    return () => {};
  },
}));
vi.mock('../highlight/highlightAction', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../highlight/highlightAction')>()),
  startHighlightAction: () => {
    native.started.push('highlight');
    return () => {};
  },
}));
vi.mock('../preventAutoScroll/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../preventAutoScroll/bridge')>()),
  claimPreventAutoScroll: () => {
    native.started.push('preventAutoScroll');
    return () => {};
  },
}));
vi.mock('../timeline/index', () => ({
  startTimeline: () => {
    native.started.push('timeline');
    return () => {};
  },
}));
vi.mock('../responseNotification/index', () => ({
  createResponseNotificationRun: () => {
    native.started.push('responseNotification');
    return { stop: () => {}, ready: Promise.resolve() };
  },
}));

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
  native.started = [];
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

describe('rolling every owned feature back to its native module', () => {
  it('closes the primitives again on Gemini and AI Studio', () => {
    for (const handler of [
      'formulaCopy',
      'vimInput',
      'userLatex',
      'codeCollapse',
      'wavedrom',
      'echarts',
      'mermaid',
      'sendShortcut',
    ]) {
      expect(allowsNativeHandler('gemini', handler)).toBe(false);
    }
    expect(allowsNativeHandler('aistudio', 'formulaCopy')).toBe(false);
  });

  it('starts every stage 3 native module once at Gemini’s real start points and admits none of their official plugins', async () => {
    (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({});
    const admission = createOfficialAdmission();

    await startGeminiChatAppearance(admission);
    const renderers = createGeminiRendererStartup(admission, new CleanupManager());
    await renderers.startCodeBlockCollapse();
    await renderers.startRenderers();
    admission.close();

    expect([...native.started].sort()).toEqual(
      [
        'chatFontSize',
        'chatLineHeight',
        'chatParagraphSpacing',
        'chatWidth',
        'codeCollapse',
        'echarts',
        'mermaid',
        'userLatex',
        'waveDrom',
      ].sort(),
    );
    for (const id of [
      OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
      OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
      OFFICIAL_PLUGIN_IDS.geminiChatWidth,
      OFFICIAL_PLUGIN_IDS.geminiUserLatex,
      OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
      OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
      OFFICIAL_PLUGIN_IDS.geminiECharts,
      OFFICIAL_PLUGIN_IDS.geminiMermaid,
    ]) {
      expect(admission.stateOf(id)).toBe('denied');
    }
    (chrome.storage.sync.get as unknown as Mock).mockReset();
  });

  it('starts native prompt history and input collapse once at their Gemini start points and admits neither official plugin', async () => {
    // Both switches on: the native modules run them, the official plugins stay out.
    (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({
      [StorageKeys.INPUT_COLLAPSE_ENABLED]: true,
      [StorageKeys.PROMPT_HISTORY_ENABLED]: true,
    });
    const admission = createOfficialAdmission();
    const cleanupManager = new CleanupManager();
    const inputs = createGeminiInputStartup(admission, cleanupManager);

    await inputs.startInputCollapse();
    await inputs.startPromptHistory();
    admission.close();

    expect(native.started).toEqual(['inputCollapse', 'promptHistory']);
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiInputCollapse)).toBe('denied');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiPromptHistory)).toBe('denied');
    cleanupManager.executeCleanups();
    (chrome.storage.sync.get as unknown as Mock).mockReset();
  });

  it('rolls both Gemini send entries back to one native send behavior and admits neither official plugin', async () => {
    const admission = createOfficialAdmission();
    const startLegacy = vi.fn(async () => {});
    await startGeminiSendKeys(admission, startLegacy);
    admission.close();
    expect(startLegacy).toHaveBeenCalledTimes(1);
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend)).toBe('denied');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix)).toBe('denied');
  });

  it.each([
    ['research pack', 'researchPack', OFFICIAL_PLUGIN_IDS.geminiResearchPack],
    ['default model', 'defaultModel', OFFICIAL_PLUGIN_IDS.geminiDefaultModel],
    ['quote reply', 'quoteReply', OFFICIAL_PLUGIN_IDS.geminiQuoteReply],
    ['highlight', 'highlight', OFFICIAL_PLUGIN_IDS.geminiHighlight],
    ['timeline', 'timeline', OFFICIAL_PLUGIN_IDS.geminiTimeline],
    ['prevent auto-scroll', 'preventAutoScroll', OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll],
    [
      'response notification',
      'responseNotification',
      OFFICIAL_PLUGIN_IDS.geminiResponseNotification,
    ],
  ])(
    'starts native %s once at its Gemini start point and admits no official plugin when rolled back',
    async (_label, feature, id) => {
      // Both switches on: the native modules run them, the official plugins stay out.
      (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({
        [StorageKeys.RESEARCH_PACK_ENABLED]: true,
        [StorageKeys.DEFAULT_MODEL_AUTO_APPLY]: true,
        [StorageKeys.HIGHLIGHT_ENABLED]: true,
        [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true,
        [StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED]: true,
      });
      const admission = createOfficialAdmission();
      const cleanupManager = new CleanupManager();
      const builtins = createGeminiBuiltinStartup(admission, cleanupManager);

      if (feature === 'quoteReply' || feature === 'highlight')
        await createSelectionStartup(admission, cleanupManager).start();
      else if (feature === 'preventAutoScroll') await builtins.startPreventAutoScroll();
      else if (feature === 'responseNotification') await builtins.startResponseNotification();
      else if (feature === 'timeline') await builtins.startTimeline();
      else {
        await builtins.startDefaultModel();
        await builtins.startForkAndResearchPack();
      }
      admission.close();

      expect(native.started.filter((name) => name === feature)).toEqual([feature]);
      expect(admission.stateOf(id)).toBe('denied');
      cleanupManager.executeCleanups();
      (chrome.storage.sync.get as unknown as Mock).mockReset();
    },
  );

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
    // Import would refuse them now; reading what the user already stored does not.
    expect(validateLocalManifest(storedLocalPlugins[LOCAL_FORMULA].manifest).success).toBe(false);
    expect(validateLocalManifest(storedLocalPlugins[LOCAL_COLLAPSE].manifest).success).toBe(false);
    expect(validateLocalManifest(storedLocalPlugins[LOCAL_SEND].manifest).success).toBe(false);
    registerBuiltinNativeHandlers();

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
