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

import { sidebarWidthForDisplay } from './sidebarWidthDisplay';

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
  /** The title of the card the row left: a remembered "General Options" search still shows it. */
  readonly formerSectionTitle: TranslationKey;
  readonly searchAliases?: readonly string[];
  readonly experimental?: boolean;
  /** Whether the row applies in this popup at all; listed everywhere its manifest matches when absent. */
  readonly eligible?: (context: OfficialPluginContext) => boolean;
  /**
   * How to use the feature once it is on (a shortcut, the keys it takes), shown
   * under the description while the row is on. `{modifier}` reads Ctrl or ⌘.
   */
  readonly usageHint?: TranslationKey;
  /** One slider per number setting of the manifest, keyed by setting. */
  readonly sliders?: Readonly<Record<string, OfficialPluginSlider>>;
}

/** How a number setting shows as a slider; the range comes from the manifest. */
export interface OfficialPluginSlider {
  readonly label: TranslationKey;
  readonly minLabel: TranslationKey;
  readonly maxLabel: TranslationKey;
  readonly step: number;
  readonly unit: '%' | 'px';
  /** What a stored reading looks like on this slider, when the two differ. */
  readonly toDisplay?: (value: number) => number;
}

/** What a row's eligibility may depend on besides the active tab. */
export interface OfficialPluginContext {
  readonly isSafariBrowser: boolean;
}

/** Array order is the display order within each group. */
export const OFFICIAL_PLUGIN_ENTRIES: readonly OfficialPluginEntry[] = [
  {
    id: OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
    group: 'appearance',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['hideInputHalo', 'hideInputHaloHint'],
    searchAliases: ['halo ripple 光晕 水波纹'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiChatWidth,
    group: 'appearance',
    formerSectionTitle: 'chatWidth',
    searchKeys: ['chatWidth', 'chatWidthNarrow', 'chatWidthWide'],
    searchAliases: ['conversation width message width content width 宽 窄 对话宽度'],
    sliders: {
      widthPercent: {
        label: 'chatWidth',
        minLabel: 'chatWidthNarrow',
        maxLabel: 'chatWidthWide',
        step: 1,
        unit: '%',
      },
    },
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiChatFontSize,
    group: 'appearance',
    formerSectionTitle: 'chatFontSize',
    searchKeys: ['chatFontSize', 'chatFontSizeSmall', 'chatFontSizeLarge'],
    searchAliases: ['font text size typography zoom 字号 字体 大小'],
    sliders: {
      fontSize: {
        label: 'chatFontSize',
        minLabel: 'chatFontSizeSmall',
        maxLabel: 'chatFontSizeLarge',
        step: 5,
        unit: '%',
      },
    },
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiChatLineHeight,
    group: 'appearance',
    formerSectionTitle: 'chatLineHeight',
    searchKeys: [
      'chatLineHeight',
      'chatLineHeightTight',
      'chatLineHeightLoose',
      'chatParagraphSpacing',
    ],
    searchAliases: ['line spacing paragraph leading readability 行高 段落 间距'],
    sliders: {
      lineHeight: {
        label: 'chatLineHeight',
        minLabel: 'chatLineHeightTight',
        maxLabel: 'chatLineHeightLoose',
        step: 5,
        unit: '%',
      },
      paragraphSpacing: {
        label: 'chatParagraphSpacing',
        minLabel: 'chatLineHeightTight',
        maxLabel: 'chatLineHeightLoose',
        step: 1,
        unit: 'px',
      },
    },
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiEditInputWidth,
    group: 'appearance',
    formerSectionTitle: 'editInputWidth',
    searchKeys: ['editInputWidth', 'editInputWidthNarrow', 'editInputWidthWide'],
    searchAliases: ['prompt input compose editor width 输入框 编辑框 宽度'],
    sliders: {
      widthPercent: {
        label: 'editInputWidth',
        minLabel: 'editInputWidthNarrow',
        maxLabel: 'editInputWidthWide',
        step: 1,
        unit: '%',
      },
    },
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
    group: 'appearance',
    formerSectionTitle: 'sidebarWidth',
    searchKeys: ['sidebarWidth', 'sidebarWidthNarrow', 'sidebarWidthWide'],
    searchAliases: ['side panel nav rail left width 侧边栏 宽度'],
    sliders: {
      widthPx: {
        label: 'sidebarWidth',
        minLabel: 'sidebarWidthNarrow',
        maxLabel: 'sidebarWidthWide',
        step: 8,
        unit: 'px',
        toDisplay: sidebarWidthForDisplay,
      },
    },
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide,
    group: 'appearance',
    formerSectionTitle: 'sidebarAutoHide',
    searchKeys: ['sidebarAutoHide', 'sidebarAutoHideHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide,
    group: 'appearance',
    formerSectionTitle: 'sidebarAutoHide',
    searchKeys: ['sidebarFullHide', 'sidebarFullHideHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiCodeCollapse,
    group: 'content',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['enableCodeBlockCollapse', 'enableCodeBlockCollapseHint'],
    searchAliases: ['code block collapse fold expand 代码块 折叠 展开'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiUserLatex,
    group: 'content',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['enableUserLatexRendering', 'enableUserLatexRenderingHint'],
    searchAliases: ['latex math formula katex 公式 数学'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiMermaid,
    group: 'content',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['enableMermaidRendering', 'enableMermaidRenderingHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
    group: 'content',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['enableWaveDromRendering', 'enableWaveDromRenderingHint'],
    searchAliases: ['wavedrom wavejson timing diagram'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiECharts,
    group: 'content',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['enableEchartsRendering', 'enableEchartsRenderingHint'],
    searchAliases: ['echarts chart diagram'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiPromptHistory,
    group: 'input',
    formerSectionTitle: 'promptManagerOptions',
    searchKeys: ['promptHistoryTitle', 'promptHistoryEnabledHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiQuoteReply,
    group: 'input',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['enableQuoteReply', 'enableQuoteReplyHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiInputCollapse,
    group: 'input',
    formerSectionTitle: 'inputCollapseOptions',
    searchKeys: [
      'enableInputCollapse',
      'enableInputCollapseHint',
      'inputCollapseShortcutHint',
      'allowCollapseWhenNotEmpty',
      'allowCollapseWhenNotEmptyHint',
    ],
    usageHint: 'inputCollapseShortcutHint',
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiCtrlEnterSend,
    group: 'input',
    formerSectionTitle: 'inputCollapseOptions',
    searchKeys: ['ctrlEnterSend', 'ctrlEnterSendHint'],
    searchAliases: ['send enter return ctrl cmd 发送 回车'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.aistudioEnterSend,
    group: 'input',
    formerSectionTitle: 'inputCollapseOptions',
    searchKeys: ['aistudioEnterSend', 'aistudioEnterSendHint'],
    searchAliases: ['send enter return 发送 回车'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiSafariEnterFix,
    group: 'input',
    formerSectionTitle: 'inputCollapseOptions',
    searchKeys: ['safariEnterFix', 'safariEnterFixHint'],
    // The fix only runs in Safari (its binding's derive), so other browsers never offered it.
    eligible: ({ isSafariBrowser }) => isSafariBrowser,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiVimInput,
    group: 'input',
    formerSectionTitle: 'inputCollapseOptions',
    searchKeys: ['inputVimMode', 'inputVimModeHint'],
    usageHint: 'inputVimModeHint',
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiDraftSave,
    group: 'input',
    formerSectionTitle: 'inputCollapseOptions',
    searchKeys: ['draftAutoSave', 'draftAutoSaveHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll,
    group: 'conversation',
    formerSectionTitle: 'timelineOptions',
    searchKeys: ['preventAutoScroll', 'preventAutoScrollHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiFork,
    group: 'conversation',
    formerSectionTitle: 'folderOptions',
    searchKeys: ['enableForkFeature', 'enableForkFeatureHint'],
    experimental: true,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiResearchPack,
    group: 'conversation',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['researchPackEnable', 'researchPackEnableHint'],
    searchAliases: [
      'research pack markdown sources citations carry chatgpt claude 研究 资料包 引用 来源',
    ],
    experimental: true,
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiDefaultModel,
    group: 'conversation',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['enableDefaultModelAutoApply', 'enableDefaultModelAutoApplyHint'],
  },
  {
    id: OFFICIAL_PLUGIN_IDS.geminiUsageStatus,
    group: 'conversation',
    formerSectionTitle: 'generalOptions',
    searchKeys: ['usageStatusToggle', 'usageStatusToggleHint'],
    searchAliases: ['usage quota limit 用量 限额'],
  },
];

const ENTRY_BY_ID = new Map(OFFICIAL_PLUGIN_ENTRIES.map((entry) => [entry.id, entry]));

export function officialPluginEntry(id: string): OfficialPluginEntry | null {
  return ENTRY_BY_ID.get(id) ?? null;
}
