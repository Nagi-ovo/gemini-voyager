import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { VISUAL_EFFECTS_MANIFEST } from '../builtin/visualEffectsManifest';
import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import {
  legacyEnableWrite,
  resolveEffectiveEnabled,
  resolveEffectiveSettings,
} from './legacySettingBindings';
import { acceptsLegacyLiveChange, deriveLegacyValueSettings } from './legacyValueBindings';

const id = OFFICIAL_PLUGIN_IDS.visualEffects;
const key = StorageKeys.GV_VISUAL_EFFECT;
const oldKey = StorageKeys.GV_SNOW_EFFECT;

describe('shared visual effect bindings', () => {
  it.each([
    [undefined, undefined, 'off'],
    [undefined, true, 'snow'],
    [null, true, 'snow'],
    [false, true, 'snow'],
    ['off', true, 'off'],
    ['snow', false, 'snow'],
    ['sakura', true, 'sakura'],
    ['rain', false, 'rain'],
    ['unknown', true, 'off'],
    ['', true, 'off'],
  ])('resolves %s with legacy %s to %s without plugin-state authority', (stored, old, effect) => {
    const snapshot = { [key]: stored, [oldKey]: old };
    expect(deriveLegacyValueSettings(id, snapshot)).toEqual({ effect });
    const stale = { [id]: { enabled: effect === 'off', settings: { effect: 'rain' } } };
    expect(resolveEffectiveEnabled(stale, snapshot, id)).toBe(effect !== 'off');
    expect(resolveEffectiveSettings(VISUAL_EFFECTS_MANIFEST, stale)).toEqual({});
    expect(acceptsLegacyLiveChange(key, stored)).toBe(true);
    expect(acceptsLegacyLiveChange(oldKey, old)).toBe(true);
  });

  it('enables snow or disables effects and clears the legacy boolean', () => {
    expect(legacyEnableWrite(id, true)).toEqual({ [key]: 'snow', [oldKey]: false });
    expect(legacyEnableWrite(id, false)).toEqual({ [key]: 'off', [oldKey]: false });
  });
});
