import { describe, expect, it } from 'vitest';

import {
  FEATURE_OWNERS,
  type OwnedFeature,
  PACKAGED_OFFICIAL_PLUGIN_IDS,
  featureOwner,
  isPackagedOfficialPluginId,
  legacyOwnedHandlers,
  ownedFeatureByPluginId,
  pluginOwnedHandlers,
  tracksPluginHealth,
} from './featureOwners';

function entry(overrides: Partial<OwnedFeature>): OwnedFeature {
  return {
    site: 'gemini',
    feature: 'formulaCopy',
    owner: 'legacy',
    officialPluginId: 'voyager.gemini-formula-copy',
    handlers: ['formulaCopy'],
    healthTracking: false,
    ...overrides,
  };
}

describe('feature owners', () => {
  it('names each feature once, with an official id the build reserves', () => {
    const features = FEATURE_OWNERS.map(({ site, feature }) => `${site}/${feature}`);
    expect(new Set(features).size).toBe(features.length);
    const ids = FEATURE_OWNERS.map((owned) => owned.officialPluginId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(isPackagedOfficialPluginId(id)).toBe(true);
      expect(ownedFeatureByPluginId(id)?.officialPluginId).toBe(id);
    }
  });

  it('reserves official ids whoever owns the feature', () => {
    expect(PACKAGED_OFFICIAL_PLUGIN_IDS.has('voyager.gemini-formula-copy')).toBe(true);
    expect(isPackagedOfficialPluginId('voyager.formula-copy')).toBe(false);
    expect(isPackagedOfficialPluginId('local.gemini-formula-copy')).toBe(false);
    expect(ownedFeatureByPluginId('voyager.formula-copy')).toBeNull();
  });

  it('hands formula copy, Vim input and the halo to their official plugins, opening only their primitives', () => {
    expect(featureOwner('gemini', 'formulaCopy')).toBe('plugin');
    expect(featureOwner('aistudio', 'formulaCopy')).toBe('plugin');
    expect(featureOwner('gemini', 'vimInput')).toBe('plugin');
    expect(featureOwner('gemini', 'hideInputHalo')).toBe('plugin');
    expect(pluginOwnedHandlers('gemini')).toEqual(new Set(['formulaCopy', 'vimInput']));
    expect(pluginOwnedHandlers('aistudio')).toEqual(new Set(['formulaCopy']));
  });

  it('keeps the stage 3 features with their native modules and their primitives closed on Gemini', () => {
    const stage3 = [
      'chatFontSize',
      'chatLineHeight',
      'chatWidth',
      'userLatex',
      'codeCollapse',
      'waveDrom',
      'echarts',
      'mermaid',
    ] as const;
    for (const feature of stage3) expect(featureOwner('gemini', feature)).toBe('legacy');
    expect(legacyOwnedHandlers('gemini')).toEqual(
      new Set(['userLatex', 'codeCollapse', 'wavedrom', 'echarts', 'mermaid']),
    );
    for (const id of [
      'voyager.gemini-chat-font-size',
      'voyager.gemini-chat-line-height',
      'voyager.gemini-chat-width',
    ]) {
      expect(ownedFeatureByPluginId(id)?.handlers).toEqual([]);
      expect(tracksPluginHealth(id)).toBe(false);
    }
  });

  it('treats a feature missing from the table as native', () => {
    expect(featureOwner('aistudio', 'vimInput')).toBe('legacy');
  });

  it('exempts only the listed official plugins from the health monitor', () => {
    expect(tracksPluginHealth('voyager.gemini-vim-input')).toBe(false);
    expect(tracksPluginHealth('voyager.chatgpt-folders')).toBe(true);
    expect(tracksPluginHealth('local.my-plugin')).toBe(true);
  });
});

describe('pluginOwnedHandlers', () => {
  it('opens the handlers of plugin-owned features on their own site only', () => {
    const owners = [
      entry({ owner: 'plugin' }),
      entry({
        feature: 'vimInput',
        officialPluginId: 'voyager.gemini-vim-input',
        handlers: ['vimInput'],
      }),
      entry({ site: 'aistudio', officialPluginId: 'voyager.aistudio-formula-copy' }),
    ];
    expect(pluginOwnedHandlers('gemini', owners)).toEqual(new Set(['formulaCopy']));
    expect(pluginOwnedHandlers('aistudio', owners)).toEqual(new Set());
    expect(legacyOwnedHandlers('aistudio', owners)).toEqual(new Set(['formulaCopy']));
  });

  it('keeps a handler closed while any legacy feature on the site still lists it', () => {
    const owners = [
      entry({ owner: 'plugin', handlers: ['formulaCopy', 'shared'] }),
      entry({
        feature: 'hideInputHalo',
        officialPluginId: 'voyager.gemini-hide-input-halo',
        handlers: ['shared'],
      }),
    ];
    expect(pluginOwnedHandlers('gemini', owners)).toEqual(new Set(['formulaCopy']));
  });
});
