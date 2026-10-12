/**
 * Who runs each Gemini / AI Studio feature that is moving from a native
 * Voyager module to a packaged official plugin: the native module ('legacy')
 * or the plugin ('plugin'). This table is the one source of that answer.
 *
 * The content script reads it at its legacy start points, and `hostPolicy`
 * derives which `native` primitives a plugin may call on these sites from it,
 * so flipping one entry moves a feature and opens (or closes) its primitive in
 * the same build.
 *
 * Invariants the derived allowlist relies on (keep them when editing):
 *   1. An owner is fixed for a page's whole content-script instance; it is
 *      build data, never a setting read and flipped while features run.
 *   2. Every production start point of a legacy feature is gated by this same
 *      table, not just its registry entry, so legacy and plugin never both run.
 *   3. A handler opened here, or through `EXTRA_ALLOWED_HANDLERS`, shares no
 *      exclusive resource with any feature still owned by 'legacy'. Compare the
 *      resources, not the handler names: two different handlers can drive the
 *      same singleton.
 *   4. A handler listed by several entries on one site stays closed until every
 *      entry listing it is owned by 'plugin' (`pluginOwnedHandlers` does this).
 *
 * Kept free of storage keys, browser APIs and `import.meta`: the local-plugin
 * validator imports this through `hostPolicy`, and the CLI bundles that chain.
 */

export type PackagedSiteId = 'gemini' | 'aistudio';
export type OwnedFeatureId =
  | 'formulaCopy'
  | 'vimInput'
  | 'hideInputHalo'
  | 'chatFontSize'
  /** Line height and paragraph spacing: one switch, one plugin. */
  | 'chatLineHeight'
  | 'chatWidth'
  | 'userLatex'
  | 'codeCollapse'
  | 'waveDrom'
  | 'echarts'
  | 'mermaid'
  | 'promptHistory'
  | 'inputCollapse'
  | 'researchPack'
  | 'defaultModel'
  | 'ctrlEnterSend'
  | 'safariEnterFix'
  /**
   * Stage 6: native until their own flips, which add the official id, the
   * owner entry and the binding together. Missing from the table reads 'legacy'.
   */
  | 'quoteReply'
  | 'highlight'
  | 'preventAutoScroll'
  | 'responseNotification';
export type FeatureOwner = 'legacy' | 'plugin';

/** The packaged official plugin ids, by feature. */
export const OFFICIAL_PLUGIN_IDS = {
  geminiFormulaCopy: 'voyager.gemini-formula-copy',
  aistudioFormulaCopy: 'voyager.aistudio-formula-copy',
  geminiVimInput: 'voyager.gemini-vim-input',
  geminiHideInputHalo: 'voyager.gemini-hide-input-halo',
  geminiChatFontSize: 'voyager.gemini-chat-font-size',
  geminiChatLineHeight: 'voyager.gemini-chat-line-height',
  geminiChatWidth: 'voyager.gemini-chat-width',
  geminiUserLatex: 'voyager.gemini-user-latex',
  geminiCodeCollapse: 'voyager.gemini-code-collapse',
  geminiWaveDrom: 'voyager.gemini-wavedrom',
  geminiECharts: 'voyager.gemini-echarts',
  geminiMermaid: 'voyager.gemini-mermaid',
  geminiPromptHistory: 'voyager.gemini-prompt-history',
  geminiInputCollapse: 'voyager.gemini-input-collapse',
  geminiResearchPack: 'voyager.gemini-research-pack',
  geminiDefaultModel: 'voyager.gemini-default-model',
  geminiCtrlEnterSend: 'voyager.gemini-ctrl-enter-send',
  geminiSafariEnterFix: 'voyager.gemini-safari-enter-fix',
} as const;

export interface OwnedFeature {
  readonly site: PackagedSiteId;
  readonly feature: OwnedFeatureId;
  readonly owner: FeatureOwner;
  readonly officialPluginId: string;
  /** Primitives this feature's runtime is; opened to plugins on `site` once the plugin owns it. */
  readonly handlers: readonly string[];
  /**
   * Whether the plugin engine's selector health monitor (a body-subtree
   * MutationObserver) watches this plugin. These features are on by default,
   * so a monitor would run on every Gemini page; their own runtimes already
   * cope with a missing target.
   */
  readonly healthTracking: boolean;
}

/**
 * Setting an entry back to 'legacy' is the rollback: its native start path
 * runs again, its primitive closes on that site, and a stored local plugin
 * calling it stays listed but reports `blocked: host-policy` (the local
 * source defers the host policy on read).
 */
export const FEATURE_OWNERS: readonly OwnedFeature[] = [
  {
    site: 'gemini',
    feature: 'ctrlEnterSend',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend,
    handlers: ['sendShortcut'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'safariEnterFix',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'formulaCopy',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiFormulaCopy,
    handlers: ['formulaCopy'],
    healthTracking: false,
  },
  {
    site: 'aistudio',
    feature: 'formulaCopy',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy,
    handlers: ['formulaCopy'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'vimInput',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiVimInput,
    handlers: ['vimInput'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'hideInputHalo',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
    handlers: [],
    healthTracking: false,
  },
  // Stage 3. Appearance opens no primitive (pure CSS, or a fixed-id builtin
  // handler), so rolling it back never blocks a local CSS plugin. Rolled back,
  // the Mermaid, WaveDrom and ECharts native modules still have no stop: they
  // start once per page and leave only on unload.
  {
    site: 'gemini',
    feature: 'chatFontSize',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'chatLineHeight',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'chatWidth',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiChatWidth,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'userLatex',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiUserLatex,
    handlers: ['userLatex'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'codeCollapse',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
    handlers: ['codeCollapse'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'waveDrom',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
    handlers: ['wavedrom'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'echarts',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiECharts,
    handlers: ['echarts'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'mermaid',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiMermaid,
    handlers: ['mermaid'],
    healthTracking: false,
  },
  // Stage 4. Fixed-id builtins that open no primitive: prompt history keeps
  // its records per account, a policy no manifest can carry, and Vim, quote
  // reply, prompt history and the Prompt Manager expand the composer through
  // input collapse's module API whether or not the feature runs.
  {
    site: 'gemini',
    feature: 'promptHistory',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiPromptHistory,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'inputCollapse',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiInputCollapse,
    handlers: [],
    healthTracking: false,
  },
  // Stage 5. Gemini-only fixed-id builtins that open no primitive. The
  // research pack's receiver on ChatGPT and Claude stays in core either way.
  {
    site: 'gemini',
    feature: 'researchPack',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiResearchPack,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'defaultModel',
    owner: 'plugin',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
    handlers: [],
    healthTracking: false,
  },
];

/**
 * Ids only this build may supply, whoever owns the feature today. Remote
 * catalogs can never replace, delist or impersonate them. This set never
 * shrinks when an owner entry above is flipped or retired.
 */
export const PACKAGED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set(
  Object.values(OFFICIAL_PLUGIN_IDS),
);

export function isPackagedOfficialPluginId(id: string): boolean {
  return PACKAGED_OFFICIAL_PLUGIN_IDS.has(id);
}

/** The owner of `feature` on `site`; a feature missing from the table stays native. */
export function featureOwner(site: PackagedSiteId, feature: OwnedFeatureId): FeatureOwner {
  return (
    FEATURE_OWNERS.find((entry) => entry.site === site && entry.feature === feature)?.owner ??
    'legacy'
  );
}

export function ownedFeatureByPluginId(id: string): OwnedFeature | null {
  return FEATURE_OWNERS.find((entry) => entry.officialPluginId === id) ?? null;
}

/** False only for official plugins whose owner entry opts out of the health monitor. */
export function tracksPluginHealth(id: string): boolean {
  return ownedFeatureByPluginId(id)?.healthTracking ?? true;
}

/** Handlers a feature still owned by 'legacy' runs on `site`. */
export function legacyOwnedHandlers(
  site: string,
  owners: readonly OwnedFeature[] = FEATURE_OWNERS,
): ReadonlySet<string> {
  return new Set(
    owners
      .filter((entry) => entry.site === site && entry.owner === 'legacy')
      .flatMap((entry) => entry.handlers),
  );
}

/**
 * Handlers the plugin owner has taken over on `site`, minus any handler a
 * legacy feature there still lists (invariant 4).
 */
export function pluginOwnedHandlers(
  site: string,
  owners: readonly OwnedFeature[] = FEATURE_OWNERS,
): ReadonlySet<string> {
  const legacy = legacyOwnedHandlers(site, owners);
  return new Set(
    owners
      .filter((entry) => entry.site === site && entry.owner === 'plugin')
      .flatMap((entry) => entry.handlers)
      .filter((handler) => !legacy.has(handler)),
  );
}
