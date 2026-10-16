/**
 * The official Gemini / AI Studio plugins the popup lists, and how it presents
 * them: group, order and the search words their old settings rows answered
 * to. Presentation only: whether a plugin runs, and which storage holds its
 * switch, stay with `featureOwners.ts` and the legacy bindings.
 *
 * A plugin joins this table in the same change that removes its old settings
 * row, so one switch never shows twice (see
 * `.github/docs/POPUP_PLUGIN_LIST_DESIGN.md`).
 */
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import type { TranslationKey } from '@/utils/translations';

export type OfficialPluginGroup = 'appearance' | 'content' | 'input' | 'conversation';

/** Display order of the groups, with their headings. */
export const OFFICIAL_PLUGIN_GROUPS: readonly {
  readonly id: OfficialPluginGroup;
  readonly label: TranslationKey;
}[] = [
  { id: 'appearance', label: 'pluginGroupAppearance' },
  { id: 'content', label: 'pluginGroupContent' },
  { id: 'input', label: 'pluginGroupInput' },
  { id: 'conversation', label: 'pluginGroupConversation' },
];

export interface OfficialPluginEntry {
  readonly id: string;
  readonly group: OfficialPluginGroup;
  /** The retired settings row's label and hint, so its old search words still find the row. */
  readonly searchKeys: readonly TranslationKey[];
  readonly searchAliases?: readonly string[];
  readonly experimental?: boolean;
}

/** Array order is the display order within each group. */
export const OFFICIAL_PLUGIN_ENTRIES: readonly OfficialPluginEntry[] = [
  {
    id: OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
    group: 'appearance',
    searchKeys: ['hideInputHalo', 'hideInputHaloHint'],
    searchAliases: ['halo ripple 光晕 水波纹'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
    group: 'content',
    searchKeys: ['enableCodeBlockCollapse', 'enableCodeBlockCollapseHint'],
    searchAliases: ['code block collapse fold expand 代码块 折叠 展开'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiUserLatex,
    group: 'content',
    searchKeys: ['enableUserLatexRendering', 'enableUserLatexRenderingHint'],
    searchAliases: ['latex math formula katex 公式 数学'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiMermaid,
    group: 'content',
    searchKeys: ['enableMermaidRendering', 'enableMermaidRenderingHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
    group: 'content',
    searchKeys: ['enableWaveDromRendering', 'enableWaveDromRenderingHint'],
    searchAliases: ['wavedrom wavejson timing diagram'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiECharts,
    group: 'content',
    searchKeys: ['enableEchartsRendering', 'enableEchartsRenderingHint'],
    searchAliases: ['echarts chart diagram'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiPromptHistory,
    group: 'input',
    searchKeys: ['promptHistoryTitle', 'promptHistoryEnabledHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiQuoteReply,
    group: 'input',
    searchKeys: ['enableQuoteReply', 'enableQuoteReplyHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
    group: 'conversation',
    searchKeys: ['preventAutoScroll', 'preventAutoScrollHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiFork,
    group: 'conversation',
    searchKeys: ['enableForkFeature', 'enableForkFeatureHint'],
    experimental: true,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiResearchPack,
    group: 'conversation',
    searchKeys: ['researchPackEnable', 'researchPackEnableHint'],
    searchAliases: [
      'research pack markdown sources citations carry chatgpt claude 研究 资料包 引用 来源',
    ],
    experimental: true,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
    group: 'conversation',
    searchKeys: ['enableDefaultModelAutoApply', 'enableDefaultModelAutoApplyHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
    group: 'conversation',
    searchKeys: ['usageStatusToggle', 'usageStatusToggleHint'],
    searchAliases: ['usage quota limit 用量 限额'],
  },
];

const ENTRY_BY_ID = new Map(OFFICIAL_PLUGIN_ENTRIES.map((entry) => [entry.id, entry]));

export function officialPluginEntry(id: string): OfficialPluginEntry | null {
  return ENTRY_BY_ID.get(id) ?? null;
}
