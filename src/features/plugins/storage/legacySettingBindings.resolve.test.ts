import { afterEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { legacyBoundSettings } from '../runtime/legacySnapshotFeed';
import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import {
  legacyBindingFor,
  legacyEnableWrite,
  resolveEffectiveEnabled,
  resolveEffectiveSettings,
} from './legacySettingBindings';
import { testManifest as manifest } from './legacySettingBindings.fixtures';

const FORMULA_G = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;
const FORMULA_A = OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy;
const VIM = OFFICIAL_PLUGIN_IDS.geminiVimInput;
const HALO = OFFICIAL_PLUGIN_IDS.geminiHideInputHalo;
const WIDTH = OFFICIAL_PLUGIN_IDS.geminiChatWidth;
const EDIT_WIDTH = OFFICIAL_PLUGIN_IDS.geminiEditInputWidth;
const LATEX = OFFICIAL_PLUGIN_IDS.geminiUserLatex;
const COLLAPSE = OFFICIAL_PLUGIN_IDS.geminiCodeCollapse;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('resolveEffectiveEnabled', () => {
  const formulaOff = { [StorageKeys.FORMULA_COPY_ENABLED]: false };

  it('follows the legacy key for a bound id and ignores its plugin-state entry', () => {
    const mapOn = { [FORMULA_G]: { enabled: true } };
    expect(resolveEffectiveEnabled(mapOn, formulaOff, FORMULA_G)).toBe(false);
    const mapOff = { [VIM]: { enabled: false } };
    expect(resolveEffectiveEnabled(mapOff, { [StorageKeys.INPUT_VIM_MODE]: true }, VIM)).toBe(true);
    expect(resolveEffectiveEnabled({ [HALO]: { enabled: true } }, {}, HALO)).toBe(false);
  });

  it.each([
    ['missing', {}, true],
    ['off', { [StorageKeys.CANVAS_COPY_ENABLED]: false }, false],
    ['on', { [StorageKeys.CANVAS_COPY_ENABLED]: true }, true],
    ['removed', { [StorageKeys.CANVAS_COPY_ENABLED]: undefined }, true],
  ] as const)('keeps Canvas copy %s authoritative over plugin state', (_label, snapshot, on) => {
    const id = OFFICIAL_PLUGIN_IDS.geminiCanvasCopy;
    expect(resolveEffectiveEnabled({ [id]: { enabled: !on } }, snapshot, id)).toBe(on);
    expect(legacyEnableWrite(id, on)).toEqual({ [StorageKeys.CANVAS_COPY_ENABLED]: on });
    expect(resolveEffectiveSettings(manifest(id), { [id]: { settings: { stray: true } } })).toEqual(
      {},
    );
  });

  it.each([
    ['missing', {}, true],
    ['off', { [StorageKeys.DEEP_RESEARCH_EXPORT_ENABLED]: false }, false],
    ['on', { [StorageKeys.DEEP_RESEARCH_EXPORT_ENABLED]: true }, true],
    ['removed', { [StorageKeys.DEEP_RESEARCH_EXPORT_ENABLED]: undefined }, true],
  ] as const)(
    'keeps Deep Research export %s authoritative over plugin state',
    (_label, snapshot, on) => {
      const id = OFFICIAL_PLUGIN_IDS.geminiDeepResearchExport;
      expect(resolveEffectiveEnabled({ [id]: { enabled: !on } }, snapshot, id)).toBe(on);
      expect(legacyEnableWrite(id, on)).toEqual({ [StorageKeys.DEEP_RESEARCH_EXPORT_ENABLED]: on });
      expect(
        resolveEffectiveSettings(manifest(id), { [id]: { settings: { stray: true } } }),
      ).toEqual({});
    },
  );

  // Export never had a switch: a key that was never written keeps it on for everyone.
  it.each([
    ['missing', {}, true],
    ['off', { [StorageKeys.GEMINI_EXPORT_ENABLED]: false }, false],
    ['on', { [StorageKeys.GEMINI_EXPORT_ENABLED]: true }, true],
    ['removed', { [StorageKeys.GEMINI_EXPORT_ENABLED]: undefined }, true],
  ] as const)('keeps Gemini export %s authoritative over plugin state', (_label, snapshot, on) => {
    const id = OFFICIAL_PLUGIN_IDS.geminiExport;
    expect(resolveEffectiveEnabled({ [id]: { enabled: !on } }, snapshot, id)).toBe(on);
    expect(legacyEnableWrite(id, on)).toEqual({ [StorageKeys.GEMINI_EXPORT_ENABLED]: on });
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

  // The native edit input width module read its switch once: stored wins, else a customized width.
  it.each([
    ['never touched', {}, false],
    ['a width left at the default', { [StorageKeys.EDIT_INPUT_WIDTH]: 60 }, false],
    ['a customized width and no switch', { [StorageKeys.EDIT_INPUT_WIDTH]: 85 }, true],
    // 720 px of the old 1200 px baseline is the 60 % default: not customized.
    ['an old px width that reads as the default', { [StorageKeys.EDIT_INPUT_WIDTH]: 720 }, false],
    ['an old px width that reads as customized', { [StorageKeys.EDIT_INPUT_WIDTH]: 960 }, true],
    ['a non-number width', { [StorageKeys.EDIT_INPUT_WIDTH]: '85' }, false],
    [
      'an explicit off beside a customized width',
      { [StorageKeys.EDIT_INPUT_WIDTH]: 85, [StorageKeys.EDIT_INPUT_WIDTH_ENABLED]: false },
      false,
    ],
    ['an explicit on', { [StorageKeys.EDIT_INPUT_WIDTH_ENABLED]: true }, true],
    ['a non-boolean switch', { [StorageKeys.EDIT_INPUT_WIDTH_ENABLED]: 'true' }, false],
  ])('keeps the edit input width %s as the native module decided', (_label, stored, on) => {
    // A stale plugins-state entry never overrides the native keys.
    expect(resolveEffectiveEnabled({ [EDIT_WIDTH]: { enabled: !on } }, stored, EDIT_WIDTH)).toBe(
      on,
    );
  });

  it('stops deriving the edit input width switch from the width once the page sees a live change', () => {
    const customized = { [StorageKeys.EDIT_INPUT_WIDTH]: 85 };
    const changed = (key: string) => (seen: string) => seen === key;
    expect(
      resolveEffectiveEnabled({}, customized, EDIT_WIDTH, changed(StorageKeys.EDIT_INPUT_WIDTH)),
    ).toBe(false);
    expect(
      resolveEffectiveEnabled(
        {},
        customized,
        EDIT_WIDTH,
        changed(StorageKeys.EDIT_INPUT_WIDTH_ENABLED),
      ),
    ).toBe(false);
    // The popup's own reading and write stay the single stored switch.
    expect(legacyBindingFor(EDIT_WIDTH)?.read(undefined)).toBe(false);
    expect(legacyEnableWrite(EDIT_WIDTH, false)).toEqual({
      [StorageKeys.EDIT_INPUT_WIDTH_ENABLED]: false,
    });
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
