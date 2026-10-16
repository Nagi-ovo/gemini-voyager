/**
 * Gemini and AI Studio with features owned by their packaged official plugins,
 * on the owner table this build ships (nothing here replaces it): the content
 * start points admit the official plugin instead of starting the native
 * module, and the real bundled catalog, builtin plugins, local source and host
 * decide what runs. The formula runtime is a counter; the stage 3 plugins run
 * their real primitives, stylesheets and the chat width handler; prompt
 * history and input collapse run their real builtin handlers.
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
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import type { LegacySettingSnapshot } from '@/features/plugins/storage/legacySettingBindings';

import { startGeminiChatAppearance } from '../appearanceStartup';
import {
  CODE_COLLAPSE_OWNER_ATTRIBUTE,
  LONG_CODE_BLOCK_MIN_LINES,
} from '../codeBlockCollapse/engine';
import { CODE_BLOCK_TOGGLE_CLASS } from '../codeBlockCollapse/toggle';
import { createGeminiBuiltinStartup } from '../geminiBuiltinStartup';
import { type InitializationEntry, enterInitialization } from '../initializationEntry';
import { createGeminiInputStartup } from '../inputStartup';
import { registerBuiltinNativeHandlers } from '../pluginNativeRegistration';
import { createGeminiRendererStartup } from '../rendererStartup';
import { createSelectionStartup } from '../selectionStartup';

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

beforeAll(() => {
  // As the content script does before the host starts: the builtin handlers.
  registerBuiltinNativeHandlers();
});

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
  it('keeps the official plugin off when the legacy switch is off, and runs the user’s local one', async () => {
    const admission = createOfficialAdmission();
    admission.admit('gemini', 'formulaCopy');
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
    admission.admit('gemini', 'formulaCopy');
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
    admission.admit('aistudio', 'formulaCopy');
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
    kind: 'edit input width',
    id: OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
    switchKey: StorageKeys.EDIT_INPUT_WIDTH_ENABLED,
    drawn: () => document.getElementById('gv-plugin-edit-input-width') !== null,
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

describe('Gemini prompt history and input collapse owned by their official plugins', () => {
  const HISTORY_KEY = StorageKeys.PROMPT_HISTORY_ENABLED;
  const COLLAPSE_KEY = StorageKeys.INPUT_COLLAPSE_ENABLED;
  const WHEN_NOT_EMPTY_KEY = StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY;
  const COLLAPSE_STYLE_ID = 'gemini-voyager-input-collapse';
  const historyTrigger = () => document.querySelector('.gv-ph-trigger') !== null;
  const collapseStyle = () => document.getElementById(COLLAPSE_STYLE_ID) !== null;

  beforeEach(() => {
    enable();
    document.body.replaceChildren();
    document.head.replaceChildren();
    // Prompt history reads the send key before it captures; every read answers "never stored".
    (chrome.storage.sync.get as unknown as Mock).mockImplementation(
      (_keys: unknown, callback?: (result: Record<string, unknown>) => void) => {
        callback?.({});
        return Promise.resolve({});
      },
    );
  });

  afterEach(() => {
    (chrome.storage.local.remove as unknown as Mock).mockClear();
  });

  function geminiHost(
    admission: OfficialAdmissionController,
    legacySettings: LegacySettingsSource,
  ) {
    return new PluginHost({
      url: GEMINI_URL,
      sources: [new BundledCatalogPluginSource(), new BuiltinPluginSource()],
      doc: document,
      admission,
      legacySettings,
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
  }

  it('admits the history plugin and starts no native history', async () => {
    const admission = createOfficialAdmission();
    const cleanupManager = new CleanupManager();
    await createGeminiInputStartup(admission, cleanupManager).startPromptHistory();
    admission.close();

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiPromptHistory)).toBe('admitted');
    await flush();
    expect(historyTrigger()).toBe(false);
    // The native module never subscribed to its switch, so turning it on starts nothing here.
    expect(chrome.storage.onChanged.addListener).not.toHaveBeenCalled();

    const legacy = liveLegacy({ [HISTORY_KEY]: false });
    const pluginHost = geminiHost(admission, legacy.legacySettings);
    await pluginHost.start();
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiPromptHistory)).toBe('ready');
    expect(historyTrigger()).toBe(false);

    legacy.fire({ [HISTORY_KEY]: true });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiPromptHistory)).toBe('mounted');
    expect(historyTrigger()).toBe(true);

    legacy.fire({ [HISTORY_KEY]: false });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiPromptHistory)).toBe('ready');
    expect(historyTrigger()).toBe(false);
    // Turning it off removes no stored history.
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
    pluginHost.stop();
    cleanupManager.executeCleanups();
  });

  it('admits the collapse plugin and starts no native collapse', async () => {
    const admission = createOfficialAdmission();
    const cleanupManager = new CleanupManager();
    const startup = createGeminiInputStartup(admission, cleanupManager);
    await startup.startInputCollapse();
    admission.close();

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiInputCollapse)).toBe('admitted');
    // No session: the native module is not running. The one read keeps the
    // collapse-with-content value the public collapse API uses.
    expect(collapseStyle()).toBe(false);
    // The content script's router no longer turns collapse on: the plugin owns its switch.
    startup.handleStorageChange({ [COLLAPSE_KEY]: { newValue: true } }, 'sync');
    await flush();
    expect(collapseStyle()).toBe(false);

    const legacy = liveLegacy({ [COLLAPSE_KEY]: false });
    const pluginHost = geminiHost(admission, legacy.legacySettings);
    await pluginHost.start();
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiInputCollapse)).toBe('ready');

    legacy.fire({ [COLLAPSE_KEY]: true });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiInputCollapse)).toBe('mounted');
    expect(collapseStyle()).toBe(true);
    const style = document.getElementById(COLLAPSE_STYLE_ID);

    // The sub-switch lands in place: the running session is not restarted.
    legacy.fire({ [WHEN_NOT_EMPTY_KEY]: true });
    await flush();
    expect(document.getElementById(COLLAPSE_STYLE_ID)).toBe(style);

    legacy.fire({ [COLLAPSE_KEY]: false });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiInputCollapse)).toBe('ready');
    expect(collapseStyle()).toBe(false);
    pluginHost.stop();
    cleanupManager.executeCleanups();
  });
});

describe('Gemini stage 5 features owned by their official plugins', () => {
  const RESEARCH_PACK_KEY = StorageKeys.RESEARCH_PACK_ENABLED;
  const AUTO_APPLY_KEY = StorageKeys.DEFAULT_MODEL_AUTO_APPLY;
  const FORK_KEY = StorageKeys.FORK_ENABLED;
  const packPanel = () => document.querySelector('.gv-rp-root') !== null;
  const stars = () => document.querySelectorAll('.gv-default-star-btn').length;

  beforeEach(() => {
    enable();
    document.body.replaceChildren();
    document.head.replaceChildren();
    // Every startup and preference read answers "never stored".
    (chrome.storage.sync.get as unknown as Mock).mockImplementation(
      (_keys: unknown, callback?: (result: Record<string, unknown>) => void) => {
        callback?.({});
        return Promise.resolve({});
      },
    );
  });

  afterEach(() => {
    (chrome.storage.sync.set as unknown as Mock).mockClear();
    (chrome.storage.sync.remove as unknown as Mock).mockClear();
  });

  function geminiHost(
    admission: OfficialAdmissionController,
    legacySettings: LegacySettingsSource,
    url = GEMINI_URL,
  ) {
    return new PluginHost({
      url,
      sources: [new BundledCatalogPluginSource(), new BuiltinPluginSource()],
      doc: document,
      admission,
      legacySettings,
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
  }

  /** Gemini's model menu, one row per model, as the stars find it. */
  function modelMenu(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'mat-mdc-menu-panel gds-mode-switch-menu';
    panel.setAttribute('role', 'menu');
    for (const [name, id] of [
      ['Pro', 'pro-id'],
      ['Flash', 'flash-id'],
    ]) {
      const item = document.createElement('button');
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('data-mode-id', id);
      item.innerHTML = `<div class="title-and-description"><div class="mode-title">${name}</div></div>`;
      panel.appendChild(item);
    }
    document.body.appendChild(panel);
    return panel;
  }

  async function admitAtStartPoints(admission: OfficialAdmissionController) {
    const cleanupManager = new CleanupManager();
    const builtins = createGeminiBuiltinStartup(admission, cleanupManager);
    await builtins.startDefaultModel();
    await builtins.startForkAndResearchPack();
    admission.close();
    return { cleanupManager, builtins };
  }

  it('keeps the official research pack plugin off when its switch is off and mounts it live when turned on', async () => {
    const admission = createOfficialAdmission();
    const { cleanupManager } = await admitAtStartPoints(admission);
    const legacy = liveLegacy({ [RESEARCH_PACK_KEY]: false });
    const pluginHost = geminiHost(admission, legacy.legacySettings);
    await pluginHost.start();
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiResearchPack)).toBe('ready');
    expect(packPanel()).toBe(false);

    legacy.fire({ [RESEARCH_PACK_KEY]: true });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiResearchPack)).toBe('mounted');
    expect(packPanel()).toBe(true);

    legacy.fire({ [RESEARCH_PACK_KEY]: false });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiResearchPack)).toBe('ready');
    expect(packPanel()).toBe(false);
    pluginHost.stop();
    cleanupManager.executeCleanups();
  });

  it('admits the default model plugin and starts no native default model', async () => {
    const admission = createOfficialAdmission();
    const { cleanupManager } = await admitAtStartPoints(admission);

    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).toBe('admitted');
    modelMenu();
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(stars()).toBe(0);
    cleanupManager.executeCleanups();
  });

  it('runs the default model plugin when auto-apply was never set', async () => {
    const admission = createOfficialAdmission();
    const { cleanupManager } = await admitAtStartPoints(admission);
    const pluginHost = geminiHost(admission, liveLegacy({}).legacySettings);
    await pluginHost.start();
    await flush();

    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).toBe('mounted');
    modelMenu();
    await vi.waitFor(() => expect(stars()).toBe(2));
    pluginHost.stop();
    cleanupManager.executeCleanups();
  });

  it('turns the default model plugin off and leaves no star in an open or reattached model menu', async () => {
    const admission = createOfficialAdmission();
    const { cleanupManager } = await admitAtStartPoints(admission);
    const legacy = liveLegacy({ [AUTO_APPLY_KEY]: true });
    const pluginHost = geminiHost(admission, legacy.legacySettings);
    await pluginHost.start();
    await flush();
    const open = modelMenu();
    const detached = modelMenu();
    await vi.waitFor(() => expect(stars()).toBe(4));

    detached.remove();
    legacy.fire({ [AUTO_APPLY_KEY]: false });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).toBe('ready');
    expect(open.querySelector('.gv-default-star-btn')).toBeNull();

    document.body.appendChild(detached);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(stars()).toBe(0);
    // Turning it off keeps the starred model and thinking level stored.
    expect(chrome.storage.sync.remove).not.toHaveBeenCalled();
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();

    legacy.fire({ [AUTO_APPLY_KEY]: true });
    await flush();
    expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).toBe('mounted');
    pluginHost.stop();
    cleanupManager.executeCleanups();
  });

  /** One page as initializeFeatures meets it, run through its real entry gates. */
  interface EntryCase {
    readonly label: string;
    readonly url: string;
    readonly enterpriseDom?: boolean;
    readonly customWebsites?: string[];
    readonly expected: InitializationEntry;
  }
  const ENTRY_CASES: readonly EntryCase[] = [
    {
      label: 'business.gemini.google',
      url: 'https://business.gemini.google/u/1/',
      expected: 'enterprise',
    },
    {
      label: 'an Enterprise URL hint',
      url: 'https://gemini.google.com/app?workspace=true',
      expected: 'enterprise',
    },
    {
      label: 'Enterprise DOM hints',
      url: GEMINI_URL,
      enterpriseDom: true,
      expected: 'enterprise',
    },
    {
      label: 'a custom website entry that covers gemini.google.com',
      url: GEMINI_URL,
      customWebsites: ['google.com'],
      expected: 'custom-coverage',
    },
  ];

  async function initializeAt(entryCase: Omit<EntryCase, 'label' | 'expected'>) {
    const url = new URL(entryCase.url);
    (chrome.storage.sync.get as unknown as Mock).mockImplementation(
      (_keys: unknown, callback?: (result: Record<string, unknown>) => void) => {
        const stored = {
          [FORK_KEY]: true,
          [StorageKeys.USAGE_STATUS_ENABLED]: true,
          [StorageKeys.QUOTE_REPLY_ENABLED]: true,
          [StorageKeys.HIGHLIGHT_ENABLED]: true,
          [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true,
          ...(entryCase.customWebsites
            ? { [StorageKeys.PROMPT_CUSTOM_WEBSITES]: entryCase.customWebsites }
            : {}),
        };
        callback?.(stored);
        return Promise.resolve(stored);
      },
    );
    if (entryCase.enterpriseDom) document.documentElement.classList.add('gv-enterprise-shell');
    const admission = createOfficialAdmission();
    const cleanupManager = new CleanupManager();
    const ran: string[] = [];
    try {
      const entry = await enterInitialization(url, document, {
        settle: (work) => work,
        followCoverage: async () => {
          ran.push('prompt-coverage');
        },
        mountEdgeNotice: async () => undefined,
        startEnterprisePanel: async () => {
          ran.push('prompt-panel');
        },
      });
      if (entry === 'start-points') {
        await createSelectionStartup(admission, cleanupManager).start();
        const builtins = createGeminiBuiltinStartup(admission, cleanupManager);
        await builtins.startTimeline();
        await builtins.startUsageStatus();
        await builtins.startPreventAutoScroll();
        await builtins.startResponseNotification();
        await builtins.startDefaultModel();
        await builtins.startForkAndResearchPack();
      }
      admission.close();
      return { entry, admission, cleanupManager, ran };
    } finally {
      document.documentElement.classList.remove('gv-enterprise-shell');
    }
  }

  it.each(ENTRY_CASES)(
    'ends initialization at $label and admits no Gemini feature plugin even when its switch is on',
    async ({ url, enterpriseDom, customWebsites, expected }) => {
      const { entry, admission, cleanupManager, ran } = await initializeAt({
        url,
        enterpriseDom,
        customWebsites,
      });

      expect(entry).toBe(expected);
      expect(ran).toEqual([expected === 'enterprise' ? 'prompt-panel' : 'prompt-coverage']);
      for (const id of [
        OFFICIAL_PLUGIN_IDS.geminiResearchPack,
        OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
        OFFICIAL_PLUGIN_IDS.geminiFork,
        OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
        OFFICIAL_PLUGIN_IDS.geminiQuoteReply,
        OFFICIAL_PLUGIN_IDS.geminiHighlight,
        OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
        OFFICIAL_PLUGIN_IDS.geminiResponseNotification,
        OFFICIAL_PLUGIN_IDS.geminiTimeline,
      ]) {
        expect(admission.stateOf(id)).toBe('denied');
      }
      const pluginHost = geminiHost(
        admission,
        liveLegacy({
          [RESEARCH_PACK_KEY]: true,
          [AUTO_APPLY_KEY]: true,
          [FORK_KEY]: true,
          [StorageKeys.USAGE_STATUS_ENABLED]: true,
          [StorageKeys.QUOTE_REPLY_ENABLED]: true,
          [StorageKeys.HIGHLIGHT_ENABLED]: true,
          [StorageKeys.PREVENT_AUTO_SCROLL_ENABLED]: true,
          [StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED]: true,
        }).legacySettings,
        url,
      );
      await pluginHost.start();
      await flush();
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiResearchPack)).not.toBe('mounted');
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).not.toBe('mounted');
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiFork)).not.toBe('mounted');
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiUsageStatus)).not.toBe('mounted');
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiQuoteReply)).not.toBe('mounted');
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiHighlight)).not.toBe('mounted');
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll)).not.toBe('mounted');
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiResponseNotification)).not.toBe(
        'mounted',
      );
      expect(kindOf(pluginHost, OFFICIAL_PLUGIN_IDS.geminiTimeline)).not.toBe('mounted');
      expect(packPanel()).toBe(false);
      pluginHost.stop();
      cleanupManager.executeCleanups();
    },
  );

  it('reaches the Gemini start points on gemini.google.com and admits its feature plugins there', async () => {
    const { entry, admission, cleanupManager } = await initializeAt({ url: GEMINI_URL });

    expect(entry).toBe('start-points');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiResearchPack)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiDefaultModel)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiFork)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiUsageStatus)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiQuoteReply)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiHighlight)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiResponseNotification)).toBe('admitted');
    expect(admission.stateOf(OFFICIAL_PLUGIN_IDS.geminiTimeline)).toBe('admitted');
    cleanupManager.executeCleanups();
  });
});
