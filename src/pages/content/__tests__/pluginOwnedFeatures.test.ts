/**
 * Gemini and AI Studio with features owned by their packaged official plugins,
 * on the owner table this build ships (nothing here replaces it): the content
 * start points admit the official plugin instead of starting the native
 * module, and the real bundled catalog, builtin plugins, local source and host
 * decide what runs. The formula runtime is a counter; the stage 3 plugins run
 * their real primitives, stylesheets and the chat width handler.
 */
import { type Mock, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import { LocalPluginSource } from '@/features/plugins/local/LocalPluginSource';
import type { LocalPluginRecordMap } from '@/features/plugins/local/localPluginStore';
import { validateLocalManifest } from '@/features/plugins/local/validateLocalManifest';
import { PluginHost } from '@/features/plugins/runtime/PluginHost';
import type { LegacySettingsSource } from '@/features/plugins/runtime/legacySnapshotFeed';
import {
  type OfficialAdmissionController,
  createOfficialAdmission,
} from '@/features/plugins/runtime/officialAdmission';
import { OFFICIAL_PLUGIN_IDS, featureOwner } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';

import { startGeminiChatAppearance } from '../appearanceStartup';
import {
  CODE_COLLAPSE_OWNER_ATTRIBUTE,
  LONG_CODE_BLOCK_MIN_LINES,
} from '../codeBlockCollapse/engine';
import { CODE_BLOCK_TOGGLE_CLASS } from '../codeBlockCollapse/toggle';
import { admitPluginOwnedFeature, startOwnedFeature } from '../featureOwnerStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { createGeminiRendererStartup } from '../rendererStartup';

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

/** A Gemini reply with one long code block, as the native collapse has always seen it. */
function geminiCodeReply(): HTMLElement {
  const reply = document.createElement('model-response');
  const code = Array.from({ length: LONG_CODE_BLOCK_MIN_LINES }, (_, i) => `line ${i}`).join('\n');
  reply.innerHTML =
    '<message-content><code-block><div class="code-block-decoration"><span>Python</span>' +
    '<div class="buttons"><button class="copy-button">Copy</button></div></div>' +
    `<pre><code data-test-id="code-content">${code}</code></pre></code-block></message-content>`;
  document.body.append(reply);
  return reply;
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

interface Stage3Plugin {
  readonly kind: string;
  readonly id: string;
  readonly switchKey: string;
  /** What the page shows while the plugin runs, where a unit test can see it. */
  readonly drawn?: () => boolean;
}

const pluginStyle = (id: string) => () =>
  document.querySelector(`style[data-gv-plugin="${id}"]`) !== null;
const codeToggle = () =>
  document.querySelector(`code-block .buttons .${CODE_BLOCK_TOGGLE_CLASS}`) !== null;

const STAGE3_PLUGINS: readonly Stage3Plugin[] = [
  {
    kind: 'chat font size',
    id: OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
    switchKey: StorageKeys.CHAT_FONT_SIZE_ENABLED,
    drawn: pluginStyle(OFFICIAL_PLUGIN_IDS.geminiChatFontSize),
  },
  {
    kind: 'chat line height',
    id: OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
    switchKey: StorageKeys.CHAT_LINE_HEIGHT_ENABLED,
    drawn: pluginStyle(OFFICIAL_PLUGIN_IDS.geminiChatLineHeight),
  },
  {
    kind: 'chat width',
    id: OFFICIAL_PLUGIN_IDS.geminiChatWidth,
    switchKey: StorageKeys.CHAT_WIDTH_ENABLED,
    drawn: () => document.getElementById('gv-plugin-chat-width') !== null,
  },
  {
    kind: 'userLatex',
    id: OFFICIAL_PLUGIN_IDS.geminiUserLatex,
    switchKey: StorageKeys.USER_LATEX_ENABLED,
  },
  {
    kind: 'codeCollapse',
    id: OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
    switchKey: StorageKeys.CODE_BLOCK_COLLAPSE_ENABLED,
    drawn: codeToggle,
  },
  {
    kind: 'WaveDrom',
    id: OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
    switchKey: StorageKeys.WAVEDROM_ENABLED,
  },
  {
    kind: 'ECharts',
    id: OFFICIAL_PLUGIN_IDS.geminiECharts,
    switchKey: StorageKeys.ECHARTS_ENABLED,
  },
  {
    kind: 'Mermaid',
    id: OFFICIAL_PLUGIN_IDS.geminiMermaid,
    switchKey: StorageKeys.MERMAID_ENABLED,
  },
];

/** Every stage 3 switch off, as a user who turned them all off left it. */
const ALL_STAGE3_OFF: LegacySettingSnapshot = Object.fromEntries(
  STAGE3_PLUGINS.map(({ switchKey }) => [switchKey, false]),
);

describe('Gemini stage 3 features owned by their official plugins', () => {
  beforeAll(() => {
    // As the content script does before the host starts: the chat width builtin's handler.
    registerBuiltinNativeHandlers();
  });

  beforeEach(() => {
    enable();
    document.body.replaceChildren();
    document.head.replaceChildren();
  });

  /** The real Gemini start points, on the shipped owner table: they only admit. */
  async function admitAtStartPoints(admission: OfficialAdmissionController): Promise<void> {
    await startGeminiChatAppearance(admission);
    const renderers = createGeminiRendererStartup(admission, new CleanupManager());
    await renderers.startCodeBlockCollapse();
    await renderers.startRenderers();
    admission.close();
  }

  it.each(STAGE3_PLUGINS)(
    'keeps the official $kind plugin off when its legacy switch is false and mounts it live when turned on',
    async ({ id, switchKey, drawn }) => {
      geminiCodeReply();
      const admission = createOfficialAdmission();
      await admitAtStartPoints(admission);
      expect(admission.stateOf(id)).toBe('admitted');

      const legacy = liveLegacy(ALL_STAGE3_OFF);
      const pluginHost = new PluginHost({
        url: GEMINI_URL,
        sources: [new BundledCatalogPluginSource(), new BuiltinPluginSource()],
        doc: document,
        admission,
        legacySettings: legacy.legacySettings,
        requestCatalogRefresh: () => {},
        isTopFrame: true,
      });
      await pluginHost.start();
      await flush();
      expect(kindOf(pluginHost, id)).toBe('ready');
      expect(drawn?.() ?? false).toBe(false);

      legacy.fire({ [switchKey]: true });
      await flush();
      expect(kindOf(pluginHost, id)).toBe('mounted');
      if (drawn) expect(drawn()).toBe(true);

      legacy.fire({ [switchKey]: false });
      await flush();
      expect(kindOf(pluginHost, id)).toBe('ready');
      if (drawn) expect(drawn()).toBe(false);
      pluginHost.stop();
    },
  );

  it('lets a local codeCollapse plugin run on Gemini Enterprise while the official one stays denied', async () => {
    const localCollapse = 'local.me.enterprise-collapse';
    const records: LocalPluginRecordMap = {
      [localCollapse]: {
        manifest: {
          id: localCollapse,
          name: 'My code collapse',
          version: '1.0.0',
          description: 'Fold long code blocks on Gemini Enterprise',
          author: 'me',
          category: 'productivity',
          license: 'MIT',
          engine: '>=1.8.0',
          tier: 'declarative',
          matches: ['https://business.gemini.google/*'],
          contributes: { domOps: [{ op: 'native', handler: 'codeCollapse', params: {} }] },
        },
        importedAt: 1,
        updatedAt: 1,
      },
    };
    // Import takes it now that the plugin owns code block collapse on Gemini.
    expect(validateLocalManifest(records[localCollapse].manifest).success).toBe(true);
    enable(localCollapse);
    geminiCodeReply();
    // Enterprise returns before every Gemini start point: nothing is admitted.
    const admission = createOfficialAdmission();
    admission.close();

    const pluginHost = new PluginHost({
      url: 'https://business.gemini.google/u/1/',
      sources: [
        new BundledCatalogPluginSource(),
        new BuiltinPluginSource(),
        new LocalPluginSource({ loadRecords: async () => records }),
      ],
      doc: document,
      admission,
      legacySettings: legacy({}),
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
    await pluginHost.start();
    await flush();

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiCodeCollapse)).toBe('denied');
    expect(pluginHost.getStatuses().map((status) => status.id)).toEqual([localCollapse]);
    expect(kindOf(pluginHost, localCollapse)).toBe('mounted');
    const block = document.querySelector('code-block')!;
    expect(block.getAttribute(CODE_COLLAPSE_OWNER_ATTRIBUTE)).not.toBeNull();
    expect(codeToggle()).toBe(true);

    pluginHost.stop();
    expect(codeToggle()).toBe(false);
  });

  /** A Gemini Enterprise user turn with one line of LaTeX. */
  function enterpriseUserLine(): HTMLElement {
    const turn = document.createElement('user-query');
    const line = document.createElement('p');
    line.textContent = 'Euler $e^{i\\pi}+1=0$';
    turn.append(line);
    document.body.append(turn);
    return line;
  }
  const userLatexClaim = () => document.querySelector('[data-user-latex-owner]') !== null;

  it.each([
    {
      handler: 'userLatex',
      officialId: OFFICIAL_PLUGIN_IDS.geminiUserLatex,
      drawn: userLatexClaim,
    },
    { handler: 'wavedrom', officialId: OFFICIAL_PLUGIN_IDS.geminiWaveDrom },
    { handler: 'echarts', officialId: OFFICIAL_PLUGIN_IDS.geminiECharts },
    { handler: 'mermaid', officialId: OFFICIAL_PLUGIN_IDS.geminiMermaid },
  ])(
    'lets a local $handler plugin run on Gemini Enterprise while the official one stays denied',
    async ({ handler, officialId, drawn }) => {
      const localId = `local.me.enterprise-${handler.toLowerCase()}`;
      const records: LocalPluginRecordMap = {
        [localId]: {
          manifest: {
            id: localId,
            name: `My ${handler}`,
            version: '1.0.0',
            description: `Run ${handler} on Gemini Enterprise`,
            author: 'me',
            category: 'productivity',
            license: 'MIT',
            engine: '>=1.8.0',
            tier: 'declarative',
            matches: ['https://business.gemini.google/*'],
            contributes: { domOps: [{ op: 'native', handler, params: {} }] },
          },
          importedAt: 1,
          updatedAt: 1,
        },
      };
      // Import takes it now that the plugin owns this feature on Gemini.
      expect(validateLocalManifest(records[localId].manifest).success).toBe(true);
      enable(localId);
      geminiCodeReply();
      enterpriseUserLine();
      // Enterprise returns before every Gemini start point: nothing is admitted.
      const admission = createOfficialAdmission();
      admission.close();

      const pluginHost = new PluginHost({
        url: 'https://business.gemini.google/u/1/',
        sources: [
          new BundledCatalogPluginSource(),
          new BuiltinPluginSource(),
          new LocalPluginSource({ loadRecords: async () => records }),
        ],
        doc: document,
        admission,
        legacySettings: legacy({}),
        requestCatalogRefresh: () => {},
        isTopFrame: true,
      });
      await pluginHost.start();
      await flush();

      expect(admission.stateOf(officialId)).toBe('denied');
      expect(pluginHost.getStatuses().map((status) => status.id)).toEqual([localId]);
      expect(kindOf(pluginHost, localId)).toBe('mounted');
      if (drawn) expect(drawn()).toBe(true);

      pluginHost.stop();
      if (drawn) await vi.waitFor(() => expect(drawn()).toBe(false));
    },
  );
});
