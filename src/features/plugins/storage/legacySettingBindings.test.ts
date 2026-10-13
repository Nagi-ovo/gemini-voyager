import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { isCodeBlockCollapseEnabledValue } from '@/pages/content/codeBlockCollapse';
import { isInputCollapseEnabledValue } from '@/pages/content/inputCollapse/index';
import { isUserLatexEnabledValue } from '@/pages/content/userLatex/index';

import { legacyBoundSettings } from '../runtime/legacySnapshotFeed';
import { FEATURE_OWNERS, OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import type { PluginManifest } from '../types';
import {
  legacyBindingFor,
  legacyBindingKeys,
  legacyEnableWrite,
  loadLegacySettingSnapshot,
  resolveEffectiveEnabled,
  resolveEffectiveSettings,
  subscribeLegacySettings,
} from './legacySettingBindings';

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

const syncGet = () => chrome.storage.sync.get as unknown as Mock;
const addListener = () => chrome.storage.onChanged.addListener as unknown as Mock;
const removeListener = () => chrome.storage.onChanged.removeListener as unknown as Mock;

type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;

function manifest(
  id: string,
  settings?: PluginManifest['contributes']['settings'],
): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: '',
    author: 'test',
    category: 'utility',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://gemini.google.com/*'],
    contributes: settings ? { settings } : {},
  };
}

beforeEach(() => {
  syncGet().mockReset();
  addListener().mockReset();
  removeListener().mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('legacy enable bindings', () => {
  it('bind every official feature to a legacy key', () => {
    for (const owned of FEATURE_OWNERS) {
      expect(legacyBindingFor(owned.officialPluginId)?.area).toBe('sync');
    }
    expect(legacyBindingFor('voyager.chatgpt-folders')).toBeNull();
    expect(legacyBindingFor('toString')).toBeNull();
    expect(legacyBindingFor('__proto__')).toBeNull();
  });

  it('list each storage key once, switches and slider values, with both formula ids sharing one switch', () => {
    expect([...legacyBindingKeys()].sort()).toEqual(
      [
        StorageKeys.FORMULA_COPY_ENABLED,
        StorageKeys.INPUT_VIM_MODE,
        StorageKeys.INPUT_HALO_HIDDEN,
        StorageKeys.CHAT_FONT_SIZE_ENABLED,
        StorageKeys.CHAT_LINE_HEIGHT_ENABLED,
        StorageKeys.CHAT_WIDTH_ENABLED,
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
        StorageKeys.CTRL_ENTER_SEND,
        StorageKeys.AISTUDIO_ENTER_SEND,
        StorageKeys.DRAFT_AUTO_SAVE,
        StorageKeys.SAFARI_ENTER_FIX,
        StorageKeys.CHAT_FONT_SIZE,
        StorageKeys.CHAT_LINE_HEIGHT,
        StorageKeys.CHAT_PARAGRAPH_SPACING,
        StorageKeys.CHAT_WIDTH,
      ].sort(),
    );
    expect(legacyBindingFor(FORMULA_G)?.key).toBe(legacyBindingFor(FORMULA_A)?.key);
  });

  // Production readings: the research pack `=== true`; default model `!== false`, a never-set key on.
  it.each([
    ['missing', undefined, false, true],
    ['false', false, false, false],
    ['true', true, true, true],
    ['"false"', 'false', false, true],
    ['0', 0, false, true],
  ])(
    'read a stored %s for the research pack and default model switches as production does',
    (_l, stored, researchPack, defaultModel) => {
      expect(legacyBindingFor('voyager.gemini-research-pack')?.read(stored)).toBe(researchPack);
      expect(legacyBindingFor('voyager.gemini-default-model')?.read(stored)).toBe(defaultModel);
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
      for (const id of [FONT, SPACING, WIDTH])
        expect(legacyBindingFor(id)?.read(stored)).toBe(appearance);
      for (const id of [LATEX, COLLAPSE, ...DIAGRAMS])
        expect(legacyBindingFor(id)?.read(stored)).toBe(on);
    },
  );

  it('read the code collapse and user LaTeX switches as their native toggles do', () => {
    for (const stored of [undefined, null, true, false, 'false', 0]) {
      expect(legacyBindingFor(COLLAPSE)?.read(stored)).toBe(
        isCodeBlockCollapseEnabledValue(stored),
      );
      expect(legacyBindingFor(LATEX)?.read(stored)).toBe(isUserLatexEnabledValue(stored));
    }
  });

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
      expect(isInputCollapseEnabledValue(stored)).toBe(collapse);
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

describe('resolveEffectiveEnabled', () => {
  const formulaOff = { [StorageKeys.FORMULA_COPY_ENABLED]: false };

  it('does not reuse the Gemini Ctrl+Enter switch on AI Studio', () => {
    const id = OFFICIAL_PLUGIN_IDS.aistudioEnterSend;
    expect(
      resolveEffectiveEnabled(
        { [id]: { enabled: true } },
        {
          [StorageKeys.CTRL_ENTER_SEND]: true,
          [StorageKeys.AISTUDIO_ENTER_SEND]: false,
        },
        id,
      ),
    ).toBe(false);
    expect(
      resolveEffectiveEnabled(
        { [id]: { enabled: false } },
        {
          [StorageKeys.CTRL_ENTER_SEND]: false,
          [StorageKeys.AISTUDIO_ENTER_SEND]: true,
        },
        id,
      ),
    ).toBe(true);
    expect(legacyEnableWrite(id, true)).toEqual({ [StorageKeys.AISTUDIO_ENTER_SEND]: true });
  });

  it('follows the legacy key for a bound id and ignores its plugin-state entry', () => {
    const mapOn = { [FORMULA_G]: { enabled: true } };
    expect(resolveEffectiveEnabled(mapOn, formulaOff, FORMULA_G)).toBe(false);
    const mapOff = { [VIM]: { enabled: false } };
    expect(resolveEffectiveEnabled(mapOff, { [StorageKeys.INPUT_VIM_MODE]: true }, VIM)).toBe(true);
    expect(resolveEffectiveEnabled({ [HALO]: { enabled: true } }, {}, HALO)).toBe(false);
  });

  it('uses the production default when the key is missing or was removed', () => {
    expect(resolveEffectiveEnabled({}, {}, FORMULA_G)).toBe(true);
    expect(
      resolveEffectiveEnabled({}, { [StorageKeys.FORMULA_COPY_ENABLED]: undefined }, FORMULA_A),
    ).toBe(true);
    expect(resolveEffectiveEnabled({}, {}, VIM)).toBe(false);
  });

  it('derives the chat width switch from a customized width only until the page sees a live change', () => {
    const customized = { [StorageKeys.CHAT_WIDTH]: 85 };
    const changed =
      (...keys: string[]) =>
      (key: string) =>
        keys.includes(key);
    expect(resolveEffectiveEnabled({}, customized, WIDTH)).toBe(true);
    expect(resolveEffectiveEnabled({}, { [StorageKeys.CHAT_WIDTH]: 70 }, WIDTH)).toBe(false);
    expect(resolveEffectiveEnabled({}, customized, WIDTH, changed(StorageKeys.CHAT_WIDTH))).toBe(
      false,
    );
    expect(
      resolveEffectiveEnabled({}, customized, WIDTH, changed(StorageKeys.CHAT_WIDTH_ENABLED)),
    ).toBe(false);
    const switchedOff = { ...customized, [StorageKeys.CHAT_WIDTH_ENABLED]: false };
    expect(resolveEffectiveEnabled({ [WIDTH]: { enabled: true } }, switchedOff, WIDTH)).toBe(false);
    // The popup's own reading stays the single stored switch.
    expect(legacyBindingFor(WIDTH)?.read(undefined)).toBe(false);
  });

  it('ignores stored plugin-state settings and enabled flags for the two official ids', () => {
    const state = {
      [LATEX]: { enabled: false, settings: { unit: 'leaf' } },
      [COLLAPSE]: { enabled: false, settings: { defaultCollapsed: true } },
    };
    for (const id of [LATEX, COLLAPSE]) {
      expect(resolveEffectiveEnabled(state, {}, id)).toBe(true);
      expect(resolveEffectiveSettings(manifest(id), state)).toEqual({});
      expect(legacyBoundSettings(id, {})).toEqual({});
    }
  });

  it('leaves unbound ids to the plugin-state map, whatever the legacy keys say', () => {
    expect(resolveEffectiveEnabled({}, formulaOff, 'voyager.chatgpt-folders')).toBe(true);
    expect(resolveEffectiveEnabled({}, {}, 'voyager.chatgpt-export')).toBe(false);
    const local = { 'local.formula': { enabled: true } };
    expect(resolveEffectiveEnabled(local, formulaOff, 'local.formula')).toBe(true);
  });
});

describe('resolveEffectiveSettings', () => {
  it('gives a bound official plugin no settings, whatever the map stores', () => {
    const state = { [FORMULA_G]: { enabled: true, settings: { format: 'mathml', junk: 1 } } };
    expect(resolveEffectiveSettings(manifest(FORMULA_G), state)).toEqual({});
  });

  it('resolves other plugins from their stored settings and schema defaults', () => {
    const schema = {
      size: { type: 'number' as const, label: 'Size', default: 3 },
      mode: { type: 'string' as const, label: 'Mode', default: 'a' },
    };
    const state = { 'local.sizer': { enabled: true, settings: { size: 5 } } };
    expect(resolveEffectiveSettings(manifest('local.sizer', schema), state)).toEqual({
      size: 5,
      mode: 'a',
    });
  });
});

describe('loadLegacySettingSnapshot', () => {
  it('reads only the binding keys and keeps missing keys missing', async () => {
    syncGet().mockResolvedValue({
      [StorageKeys.INPUT_VIM_MODE]: true,
      [StorageKeys.FORMULA_COPY_FORMAT]: 'mathml',
    });
    const snapshot = await loadLegacySettingSnapshot();
    expect(snapshot).toEqual({ [StorageKeys.INPUT_VIM_MODE]: true });
    expect(Object.prototype.hasOwnProperty.call(snapshot, StorageKeys.FORMULA_COPY_ENABLED)).toBe(
      false,
    );
    expect([...syncGet().mock.calls[0][0]].sort()).toEqual([...legacyBindingKeys()].sort());
  });

  it('rejects when the extension context is gone instead of guessing defaults', async () => {
    syncGet().mockRejectedValue(new Error('Extension context invalidated.'));
    await expect(loadLegacySettingSnapshot()).rejects.toThrow(/context invalidated/i);
  });

  it('falls back to the native defaults on any other read failure', async () => {
    syncGet().mockRejectedValue(new Error('QUOTA_BYTES quota exceeded'));
    const snapshot = await loadLegacySettingSnapshot();
    expect(snapshot).toEqual({});
    expect(resolveEffectiveEnabled({}, snapshot, FORMULA_G)).toBe(true);
    expect(resolveEffectiveEnabled({}, snapshot, VIM)).toBe(false);
  });
});

describe('subscribeLegacySettings', () => {
  function subscribe(): { callback: Mock; listener: Listener; stop: () => void } {
    const callback = vi.fn();
    const stop = subscribeLegacySettings(callback);
    const [[listener]] = addListener().mock.calls as [[Listener]];
    return { callback, listener, stop };
  }

  it('reports binding-key changes in the sync area only', () => {
    const { callback, listener } = subscribe();
    listener({ [StorageKeys.INPUT_VIM_MODE]: { newValue: true } }, 'local');
    listener({ [StorageKeys.FORMULA_COPY_FORMAT]: { newValue: 'mathml' } }, 'sync');
    expect(callback).not.toHaveBeenCalled();

    listener(
      {
        [StorageKeys.INPUT_VIM_MODE]: { newValue: true, oldValue: false },
        [StorageKeys.FORMULA_COPY_FORMAT]: { newValue: 'mathml' },
      },
      'sync',
    );
    expect(callback).toHaveBeenCalledWith({ [StorageKeys.INPUT_VIM_MODE]: true });
  });

  it('reports a removed key so merging it restores the default', () => {
    const { callback, listener } = subscribe();
    listener({ [StorageKeys.FORMULA_COPY_ENABLED]: { oldValue: false } }, 'sync');
    const [[changed]] = callback.mock.calls;
    expect(Object.prototype.hasOwnProperty.call(changed, StorageKeys.FORMULA_COPY_ENABLED)).toBe(
      true,
    );
    const merged = { [StorageKeys.FORMULA_COPY_ENABLED]: false, ...changed };
    expect(resolveEffectiveEnabled({}, merged, FORMULA_G)).toBe(true);
  });

  it('removes its listener on stop', () => {
    const { listener, stop } = subscribe();
    stop();
    expect(removeListener()).toHaveBeenCalledWith(listener);
  });
});
