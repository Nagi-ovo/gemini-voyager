import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { type FeatureOwner, OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import type { LegacySettingSnapshot } from '../storage/legacySettingBindings';
import type { LegacyReadPhase } from './legacySnapshotFeed';
import type { AdmissionState, OfficialAdmission } from './officialAdmission';
import { wishVerdict } from './reconcileArbitration';

const FORMULA_ID = OFFICIAL_PLUGIN_IDS.geminiFormulaCopy;
const FORMULA_ON = { [StorageKeys.FORMULA_COPY_ENABLED]: true };
const FORMULA_OFF = { [StorageKeys.FORMULA_COPY_ENABLED]: false };

function admission(state: AdmissionState): OfficialAdmission {
  return { stateOf: () => state, subscribe: () => () => {} };
}

const ownedBy =
  (owner: FeatureOwner | null) =>
  (id: string): FeatureOwner | null =>
    id === FORMULA_ID ? owner : null;

function verdict(
  legacy: LegacySettingSnapshot | null,
  state: AdmissionState,
  owner: FeatureOwner | null,
  legacyPhase: LegacyReadPhase = legacy === null ? 'loading' : 'loaded',
): ReturnType<typeof wishVerdict> {
  return wishVerdict(
    { state: {}, legacy, legacyPhase, admission: admission(state), ownerOf: ownedBy(owner) },
    FORMULA_ID,
  );
}

describe('wishVerdict', () => {
  it('reserves a pending official plugin only when every other condition already holds', () => {
    expect(verdict(FORMULA_ON, 'pending', 'plugin')).toBe('reserve');
    // Legacy still owns the feature: the native module runs, the plugin never will.
    expect(verdict(FORMULA_ON, 'pending', 'legacy')).toBe('skip');
    // The legacy switch reads off.
    expect(verdict(FORMULA_OFF, 'pending', 'plugin')).toBe('skip');
  });

  it('reserves nothing for an id the owner table does not hand to a plugin', () => {
    expect(verdict(FORMULA_ON, 'pending', null)).toBe('skip');
    expect(verdict(null, 'pending', null)).toBe('skip');
  });

  it('awaits the legacy read for a plugin-owned official plugin, pending or admitted', () => {
    expect(verdict(null, 'pending', 'plugin')).toBe('await');
    expect(verdict(null, 'admitted', 'plugin')).toBe('await');
    expect(verdict(null, 'admitted', 'legacy')).toBe('skip');
    // Denied for good: nothing to wait for.
    expect(verdict(null, 'denied', 'plugin')).toBe('skip');
  });

  it('neither runs nor awaits once the legacy read has failed', () => {
    expect(verdict(null, 'admitted', 'plugin', 'failed')).toBe('skip');
    expect(verdict(null, 'pending', 'plugin', 'failed')).toBe('skip');
    expect(verdict(null, 'admitted', 'plugin', 'none')).toBe('skip');
  });

  it('never runs a legacy-owned official plugin, even when something admitted it', () => {
    expect(verdict(FORMULA_ON, 'admitted', 'legacy')).toBe('skip');
    expect(verdict({}, 'admitted', 'legacy')).toBe('skip');
  });

  it('runs once admitted and never after the admission is denied', () => {
    expect(verdict(FORMULA_ON, 'admitted', 'plugin')).toBe('run');
    expect(verdict(FORMULA_ON, 'denied', 'plugin')).toBe('skip');
  });

  it('follows the plugin state for every unbound plugin', () => {
    const state = { 'local.me.formula': { enabled: true, installedAt: 1 } };
    const input = {
      legacy: null,
      legacyPhase: 'loading' as const,
      admission: admission('admitted'),
    };
    expect(wishVerdict({ ...input, state }, 'local.me.formula')).toBe('run');
    expect(wishVerdict({ ...input, state: {} }, 'local.me.formula')).toBe('skip');
  });

  it('a shared consumer waits for the native start point but follows its own switch even when the official rail is off', () => {
    const id = 'local.me.shared-rail';
    const admissionId = OFFICIAL_PLUGIN_IDS.geminiTimeline;
    const input = {
      state: { [id]: { enabled: true, installedAt: 1 } },
      legacy: { [StorageKeys.GV_TIMELINE_ENABLED]: false },
      legacyPhase: 'loaded' as const,
      admissionId,
    };
    const gate = (state: AdmissionState): OfficialAdmission => ({
      stateOf: (pluginId) => (pluginId === admissionId ? state : 'admitted'),
      subscribe: () => () => {},
    });
    expect(wishVerdict({ ...input, admission: gate('pending') }, id)).toBe('reserve');
    expect(wishVerdict({ ...input, admission: gate('denied') }, id)).toBe('skip');
    expect(wishVerdict({ ...input, admission: gate('admitted') }, id)).toBe('run');
    expect(wishVerdict({ ...input, state: {}, admission: gate('admitted') }, id)).toBe('skip');
  });
});
