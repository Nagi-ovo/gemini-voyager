import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { FEATURE_OWNERS, OFFICIAL_PLUGIN_IDS, SHARED_FEATURE_OWNERS } from '../sites/featureOwners';
import {
  legacyBindingFor,
  legacyBindingKeys,
  legacyEnableWrite,
  resolveEffectiveEnabled,
  resolveEffectiveSettings,
} from './legacySettingBindings';
import { testManifest as manifest } from './legacySettingBindings.fixtures';

const FORMULA_G = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;
const FORMULA_A = OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy;
const VIM = OFFICIAL_PLUGIN_IDS.geminiVimInput;
const HALO = OFFICIAL_PLUGIN_IDS.geminiHideInputHalo;
const FONT = OFFICIAL_PLUGIN_IDS.geminiChatFontSize;
const SPACING = OFFICIAL_PLUGIN_IDS.geminiChatLineHeight;
const WIDTH = OFFICIAL_PLUGIN_IDS.geminiChatWidth;
const LATEX = OFFICIAL_PLUGIN_IDS.geminiUserLatex;
const COLLAPSE = OFFICIAL_PLUGIN_IDS.geminiCodeCollapse;
const HISTORY = OFFICIAL_PLUGIN_IDS.geminiPromptHistory;
const INPUT_COLLAPSE = OFFICIAL_PLUGIN_IDS.geminiInputCollapse;
const DIAGRAMS = [
  OFFICIAL_PLUGIN_IDS.geminiWaveDrom,
  OFFICIAL_PLUGIN_IDS.geminiECharts,
  OFFICIAL_PLUGIN_IDS.geminiMermaid,
];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('legacy enable bindings', () => {
  it.each([OFFICIAL_PLUGIN_IDS.geminiBatchDelete, OFFICIAL_PLUGIN_IDS.aistudioBatchDelete])(
    'keeps %s on by default only while its native folder surface is available',
    (id) => {
      for (const folder of [undefined, false, true]) {
        for (const enabled of [undefined, false, true]) {
          const snapshot = {
            [StorageKeys.FOLDER_ENABLED]: folder,
            [StorageKeys.BATCH_DELETE_ENABLED]: enabled,
          };
          const expected = folder !== false && enabled !== false;
          expect(resolveEffectiveEnabled({ [id]: { enabled: !expected } }, snapshot, id)).toBe(
            expected,
          );
          expect(resolveEffectiveEnabled({}, snapshot, id, () => true)).toBe(expected);
        }
      }
      expect(legacyEnableWrite(id, false)).toEqual({ [StorageKeys.BATCH_DELETE_ENABLED]: false });
      expect(legacyEnableWrite(id, true)).toEqual({ [StorageKeys.BATCH_DELETE_ENABLED]: true });
      expect(
        resolveEffectiveSettings(manifest(id), { [id]: { settings: { stray: true } } }),
      ).toEqual({});
    },
  );

  it('keeps AI Studio on independently of the Gemini switch and stale plugin state', () => {
    const id = OFFICIAL_PLUGIN_IDS.aistudioSidebarWidth;
    for (const value of [undefined, true, false]) {
      expect(
        resolveEffectiveEnabled(
          { [id]: { enabled: false } },
          {
            [StorageKeys.SIDEBAR_WIDTH_ENABLED]: false,
            [StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED]: value,
          },
          id,
        ),
      ).toBe(value !== false);
    }
    expect(legacyEnableWrite(id, false)).toEqual({
      [StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED]: false,
    });
  });
  it('keeps both folders plugins on the one Folders card switch, whatever the plugin state says', () => {
    for (const id of [OFFICIAL_PLUGIN_IDS.geminiFolders, OFFICIAL_PLUGIN_IDS.aistudioFolders]) {
      for (const stored of [undefined, true, false]) {
        const snapshot = { [StorageKeys.FOLDER_ENABLED]: stored };
        expect(resolveEffectiveEnabled({ [id]: { enabled: stored === false } }, snapshot, id)).toBe(
          stored !== false,
        );
      }
      expect(legacyEnableWrite(id, false)).toEqual({ [StorageKeys.FOLDER_ENABLED]: false });
    }
  });

  it('derives sidebar width only from a customized initial width and preserves explicit switches', () => {
    const id = OFFICIAL_PLUGIN_IDS.geminiSidebarWidth;
    const key = StorageKeys.SIDEBAR_WIDTH_ENABLED;
    const value = StorageKeys.SIDEBAR_WIDTH;
    const stale = { [id]: { enabled: true, settings: { widthPx: 500 } } };
    expect(resolveEffectiveEnabled(stale, {}, id)).toBe(false);
    expect(resolveEffectiveEnabled(stale, { [value]: 312 }, id)).toBe(false);
    for (const stored of [26, 390, '390']) {
      expect(resolveEffectiveEnabled(stale, { [value]: stored }, id)).toBe(true);
      expect(resolveEffectiveEnabled(stale, { [value]: stored, [key]: false }, id)).toBe(false);
      expect(
        resolveEffectiveEnabled(stale, { [value]: stored }, id, (changed) => changed === key),
      ).toBe(false);
      expect(
        resolveEffectiveEnabled(stale, { [value]: stored }, id, (changed) => changed === value),
      ).toBe(false);
    }
    expect(legacyEnableWrite(id, false)).toEqual({ [key]: false });
  });

  it('bind every official feature to a legacy key', () => {
    for (const owned of [...FEATURE_OWNERS, ...SHARED_FEATURE_OWNERS]) {
      expect(legacyBindingFor(owned.officialPluginId)?.area).toBe('sync');
    }
    expect(legacyBindingFor('voyager.chatgpt-folders')).toBeNull();
    expect(legacyBindingFor('toString')).toBeNull();
    expect(legacyBindingFor('__proto__')).toBeNull();
  });

  it('list each storage key once, switches and slider values, with both formula ids sharing one switch', () => {
    expect([...legacyBindingKeys()].sort()).toEqual(
      [
        StorageKeys.WATERMARK_DOWNLOAD_ENABLED,
        StorageKeys.WATERMARK_PREVIEW_ENABLED,
        StorageKeys.WATERMARK_REMOVER_ENABLED,
        StorageKeys.GV_VISUAL_EFFECT,
        StorageKeys.GV_SNOW_EFFECT,
        StorageKeys.FORMULA_COPY_ENABLED,
        StorageKeys.INPUT_VIM_MODE,
        StorageKeys.INPUT_HALO_HIDDEN,
        StorageKeys.CHAT_FONT_SIZE_ENABLED,
        StorageKeys.CHAT_LINE_HEIGHT_ENABLED,
        StorageKeys.CHAT_WIDTH_ENABLED,
        StorageKeys.EDIT_INPUT_WIDTH_ENABLED,
        StorageKeys.SIDEBAR_WIDTH_ENABLED,
        StorageKeys.SIDEBAR_WIDTH,
        StorageKeys.AISTUDIO_SIDEBAR_WIDTH,
        StorageKeys.AISTUDIO_SIDEBAR_WIDTH_ENABLED,
        StorageKeys.FOLDER_ENABLED,
        StorageKeys.BATCH_DELETE_ENABLED,
        StorageKeys.GV_SIDEBAR_AUTO_HIDE,
        StorageKeys.GV_SIDEBAR_FULL_HIDE,
        StorageKeys.MARKDOWN_FIX_ENABLED,
        StorageKeys.CANVAS_COPY_ENABLED,
        StorageKeys.DEEP_RESEARCH_EXPORT_ENABLED,
        StorageKeys.GEMINI_EXPORT_ENABLED,
        StorageKeys.GV_GEMS_SIDEBAR_ENABLED,
        StorageKeys.GV_GEMS_SIDEBAR_COUNT,
        StorageKeys.CONTEXT_SYNC_ENABLED,
        StorageKeys.USER_LATEX_ENABLED,
        StorageKeys.CODE_BLOCK_COLLAPSE_ENABLED,
        StorageKeys.WAVEDROM_ENABLED,
        StorageKeys.ECHARTS_ENABLED,
        StorageKeys.MERMAID_ENABLED,
        StorageKeys.PROMPT_HISTORY_ENABLED,
        StorageKeys.INPUT_COLLAPSE_ENABLED,
        StorageKeys.INPUT_COLLAPSE_WHEN_NOT_EMPTY,
        StorageKeys.RESEARCH_PACK_ENABLED,
        StorageKeys.DEFAULT_MODEL_AUTO_APPLY,
        StorageKeys.FORK_ENABLED,
        StorageKeys.USAGE_STATUS_ENABLED,
        StorageKeys.QUOTE_REPLY_ENABLED,
        StorageKeys.HIGHLIGHT_ENABLED,
        StorageKeys.PREVENT_AUTO_SCROLL_ENABLED,
        StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED,
        StorageKeys.GV_TIMELINE_ENABLED,
        StorageKeys.GV_SHOW_MESSAGE_TIMESTAMPS,
        StorageKeys.CTRL_ENTER_SEND,
        StorageKeys.AISTUDIO_ENTER_SEND,
        StorageKeys.DRAFT_AUTO_SAVE,
        StorageKeys.SAFARI_ENTER_FIX,
        StorageKeys.CHAT_FONT_SIZE,
        StorageKeys.CHAT_LINE_HEIGHT,
        StorageKeys.CHAT_PARAGRAPH_SPACING,
        StorageKeys.CHAT_WIDTH,
        StorageKeys.EDIT_INPUT_WIDTH,
        StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS_AISTUDIO,
        StorageKeys.FOLDER_HIDE_ARCHIVED_CONVERSATIONS,
      ].sort(),
    );
    expect(legacyBindingFor(FORMULA_G)?.key).toBe(legacyBindingFor(FORMULA_A)?.key);
  });

  // Production readings: research pack opts in; default model and Quote stay on unless false.
  it.each([
    ['missing', undefined, false, true],
    ['false', false, false, false],
    ['true', true, true, true],
    ['"false"', 'false', false, true],
    ['0', 0, false, true],
  ])(
    'read a stored %s for research pack, default model and selection switches as production does',
    (_l, stored, researchPack, defaultModel) => {
      expect(legacyBindingFor('voyager.gemini-research-pack')?.read(stored)).toBe(researchPack);
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiHighlight)?.read(stored)).toBe(
        researchPack,
      );
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiPreventAutoScroll)?.read(stored)).toBe(
        researchPack,
      );
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiResponseNotification)?.read(stored)).toBe(
        researchPack,
      );
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiDeepResearchExport)?.read(stored)).toBe(
        defaultModel,
      );
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiCanvasCopy)?.read(stored)).toBe(
        defaultModel,
      );
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiGemsSidebar)?.read(stored)).toBe(
        defaultModel,
      );
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiContextSync)?.read(stored)).toBe(
        researchPack,
      );
      expect(legacyBindingFor('voyager.gemini-default-model')?.read(stored)).toBe(defaultModel);
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiTimeline)?.read(stored)).toBe(defaultModel);
      expect(legacyBindingFor(OFFICIAL_PLUGIN_IDS.geminiQuoteReply)?.read(stored)).toBe(
        defaultModel,
      );
    },
  );

  // Production readings: the appearance switches `=== true`; collapse, LaTeX and diagrams `!== false`.
  it.each([
    ['missing', undefined, false, true],
    ['false', false, false, false],
    ['true', true, true, true],
    ['"false"', 'false', false, true],
    ['0', 0, false, true],
    ['null', null, false, true],
  ])(
    'read a stored %s for the stage 3 switches as production does',
    (_l, stored, appearance, on) => {
      for (const id of [
        FONT,
        SPACING,
        WIDTH,
        OFFICIAL_PLUGIN_IDS.geminiSidebarWidth,
        OFFICIAL_PLUGIN_IDS.geminiSidebarAutoHide,
        OFFICIAL_PLUGIN_IDS.geminiSidebarFullHide,
      ])
        expect(legacyBindingFor(id)?.read(stored)).toBe(appearance);
      for (const id of [LATEX, COLLAPSE, ...DIAGRAMS])
        expect(legacyBindingFor(id)?.read(stored)).toBe(on);
    },
  );

  // Prompt history reads `=== true`; input collapse starts unless the key is missing or false.
  it.each([
    ['missing', undefined, false, false],
    ['false', false, false, false],
    ['true', true, true, true],
    ['"false"', 'false', false, true],
    ['0', 0, false, true],
    ['null', null, false, true],
  ])(
    'read a stored %s for prompt history and input collapse as their native startup reads do',
    (_l, stored, history, collapse) => {
      expect(legacyBindingFor(HISTORY)?.read(stored)).toBe(history);
      expect(legacyBindingFor(INPUT_COLLAPSE)?.read(stored)).toBe(collapse);
    },
  );

  // Production readings: formula copy `!== false`; Vim and halo `=== true`.
  it.each([
    ['missing', undefined, true, false, false],
    ['false', false, false, false, false],
    ['true', true, true, true, true],
    ['"false"', 'false', true, false, false],
    ['"true"', 'true', true, false, false],
    ['0', 0, true, false, false],
    ['1', 1, true, false, false],
    ['null', null, true, false, false],
  ])('read a stored %s as production does', (_label, stored, formula, vim, halo) => {
    expect(legacyBindingFor(FORMULA_G)?.read(stored)).toBe(formula);
    expect(legacyBindingFor(FORMULA_A)?.read(stored)).toBe(formula);
    expect(legacyBindingFor(VIM)?.read(stored)).toBe(vim);
    expect(legacyBindingFor(HALO)?.read(stored)).toBe(halo);
  });

  it('write the legacy key the popup writes', () => {
    expect(legacyEnableWrite(FORMULA_A, false)).toEqual({
      [StorageKeys.FORMULA_COPY_ENABLED]: false,
    });
    expect(legacyEnableWrite(VIM, true)).toEqual({ [StorageKeys.INPUT_VIM_MODE]: true });
    expect(legacyEnableWrite(HALO, true)).toEqual({ [StorageKeys.INPUT_HALO_HIDDEN]: true });
    expect(() => legacyEnableWrite('voyager.chatgpt-folders', true)).toThrow();
  });
});
