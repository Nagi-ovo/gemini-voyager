/**
 * Which Gemini / AI Studio features moved from a native Voyager module to a
 * packaged official plugin. The content script admits each official plugin at
 * the feature's original start point, and `hostPolicy` derives from this table
 * which `native` primitives a plugin may call on these sites.
 *
 * Stage 7 deleted the native start paths, so a listed feature runs only as its
 * official plugin. Rolling one back to its native module means reverting the
 * stage 7 retirement commits (9c2161df and 0ae260c1) and the commit that
 * removed the 'legacy' owner option; this table alone cannot do it.
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
  | 'editInputWidth'
  | 'sidebarWidth'
  | 'sidebarAutoHide'
  | 'sidebarFullHide'
  | 'canvasCopy'
  | 'userLatex'
  | 'codeCollapse'
  | 'waveDrom'
  | 'echarts'
  | 'mermaid'
  | 'promptHistory'
  | 'inputCollapse'
  | 'researchPack'
  | 'defaultModel'
  | 'fork'
  | 'usageStatus'
  | 'ctrlEnterSend'
  | 'safariEnterFix'
  | 'enterSend'
  | 'draftSave'
  | 'quoteReply'
  | 'highlight'
  | 'preventAutoScroll'
  | 'responseNotification'
  | 'timeline';

/** The packaged official plugin ids, by feature. */
export const OFFICIAL_PLUGIN_IDS = {
  geminiFormulaCopy: 'voyager.gemini-formula-copy',
  aistudioFormulaCopy: 'voyager.aistudio-formula-copy',
  geminiVimInput: 'voyager.gemini-vim-input',
  geminiHideInputHalo: 'voyager.gemini-hide-input-halo',
  geminiChatFontSize: 'voyager.gemini-chat-font-size',
  geminiChatLineHeight: 'voyager.gemini-chat-line-height',
  geminiChatWidth: 'voyager.gemini-chat-width',
  geminiEditInputWidth: 'voyager.gemini-edit-input-width',
  geminiCanvasCopy: 'voyager.gemini-canvas-copy',
  geminiSidebarWidth: 'voyager.gemini-sidebar-width',
  geminiSidebarAutoHide: 'voyager.gemini-sidebar-auto-hide',
  geminiSidebarFullHide: 'voyager.gemini-sidebar-full-hide',
  geminiUserLatex: 'voyager.gemini-user-latex',
  geminiCodeCollapse: 'voyager.gemini-code-collapse',
  geminiWaveDrom: 'voyager.gemini-wavedrom',
  geminiECharts: 'voyager.gemini-echarts',
  geminiMermaid: 'voyager.gemini-mermaid',
  geminiPromptHistory: 'voyager.gemini-prompt-history',
  geminiInputCollapse: 'voyager.gemini-input-collapse',
  geminiResearchPack: 'voyager.gemini-research-pack',
  geminiDefaultModel: 'voyager.gemini-default-model',
  geminiFork: 'voyager.gemini-fork',
  geminiUsageStatus: 'voyager.gemini-usage-status',
  geminiQuoteReply: 'voyager.gemini-quote-reply',
  geminiHighlight: 'voyager.gemini-highlight',
  geminiPreventAutoScroll: 'voyager.gemini-prevent-auto-scroll',
  geminiResponseNotification: 'voyager.gemini-response-notification',
  geminiTimeline: 'voyager.gemini-timeline',
  geminiCtrlEnterSend: 'voyager.gemini-ctrl-enter-send',
  geminiSafariEnterFix: 'voyager.gemini-safari-enter-fix',
  aistudioEnterSend: 'voyager.aistudio-enter-send',
  geminiDraftSave: 'voyager.gemini-draft-save',
} as const;

export interface OwnedFeature {
  readonly site: PackagedSiteId;
  readonly feature: OwnedFeatureId;
  readonly officialPluginId: string;
  /** Primitives this feature's runtime is; opened to plugins on `site`. */
  readonly handlers: readonly string[];
  /**
   * Whether the plugin engine's selector health monitor (a body-subtree
   * MutationObserver) watches this plugin. These features are on by default,
   * so a monitor would run on every Gemini page; their own runtimes already
   * cope with a missing target.
   */
  readonly healthTracking: boolean;
}

export const FEATURE_OWNERS: readonly OwnedFeature[] = [
  {
    site: 'gemini',
    feature: 'timeline',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiTimeline,
    // The public rail uses the same stars/hierarchy and native start permission.
    handlers: ['turnNavigator'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'draftSave',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiDraftSave,
    handlers: ['draftSave'],
    healthTracking: false,
  },
  {
    site: 'aistudio',
    feature: 'enterSend',
    officialPluginId: OFFICIAL_PLUGIN_IDS.aistudioEnterSend,
    handlers: ['sendShortcut'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'ctrlEnterSend',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend,
    handlers: ['sendShortcut'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'safariEnterFix',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'formulaCopy',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiFormulaCopy,
    handlers: ['formulaCopy'],
    healthTracking: false,
  },
  {
    site: 'aistudio',
    feature: 'formulaCopy',
    officialPluginId: OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy,
    handlers: ['formulaCopy'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'vimInput',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiVimInput,
    handlers: ['vimInput'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'hideInputHalo',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
    handlers: [],
    healthTracking: false,
  },
  // Stage 3. Appearance opens no primitive (pure CSS, or a fixed-id builtin
  // handler).
  {
    site: 'gemini',
    feature: 'chatFontSize',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'chatLineHeight',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'chatWidth',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiChatWidth,
    handlers: [],
    healthTracking: false,
  },
  // A fixed-id builtin like chat width: its runtime is first-party CSS, no primitive.
  {
    site: 'gemini',
    feature: 'editInputWidth',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'sidebarWidth',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'sidebarAutoHide',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'sidebarFullHide',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'canvasCopy',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiCanvasCopy,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'userLatex',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiUserLatex,
    handlers: ['userLatex'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'codeCollapse',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
    handlers: ['codeCollapse'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'waveDrom',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
    handlers: ['wavedrom'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'echarts',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiECharts,
    handlers: ['echarts'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'mermaid',
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
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiPromptHistory,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'inputCollapse',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiInputCollapse,
    handlers: [],
    healthTracking: false,
  },
  // Stage 5. Gemini-only fixed-id builtins that open no primitive. The
  // research pack's receiver on ChatGPT and Claude stays in core either way.
  {
    site: 'gemini',
    feature: 'researchPack',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiResearchPack,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'defaultModel',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'fork',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiFork,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'usageStatus',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'quoteReply',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiQuoteReply,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'highlight',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiHighlight,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'preventAutoScroll',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
    handlers: [],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'responseNotification',
    officialPluginId: OFFICIAL_PLUGIN_IDS.geminiResponseNotification,
    handlers: [],
    healthTracking: false,
  },
];

/**
 * Ids only this build may supply. Remote catalogs can never replace, delist or
 * impersonate them. This set never shrinks when an owner entry above is retired.
 */
export const PACKAGED_OFFICIAL_PLUGIN_IDS: ReadonlySet<string> = new Set(
  Object.values(OFFICIAL_PLUGIN_IDS),
);

export function isPackagedOfficialPluginId(id: string): boolean {
  return PACKAGED_OFFICIAL_PLUGIN_IDS.has(id);
}

export function ownedFeatureByPluginId(id: string): OwnedFeature | null {
  return FEATURE_OWNERS.find((entry) => entry.officialPluginId === id) ?? null;
}

/** False only for official plugins whose owner entry opts out of the health monitor. */
export function tracksPluginHealth(id: string): boolean {
  return ownedFeatureByPluginId(id)?.healthTracking ?? true;
}

/** Handlers the official plugins on `site` have opened to every plugin there. */
export function pluginOwnedHandlers(
  site: string,
  owners: readonly OwnedFeature[] = FEATURE_OWNERS,
): ReadonlySet<string> {
  return new Set(owners.filter((entry) => entry.site === site).flatMap((entry) => entry.handlers));
}
