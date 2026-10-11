import { describe, expect, it, vi } from 'vitest';

import { OFFICIAL_PLUGIN_IDS, type OwnedFeature } from '../sites/featureOwners';
import { CLOSED_ADMISSION, createOfficialAdmission } from './officialAdmission';

const OWNERS: readonly OwnedFeature[] = [
  {
    site: 'gemini',
    feature: 'formulaCopy',
    owner: 'plugin',
    officialPluginId: 'voyager.fake-formula',
    handlers: ['formulaCopy'],
    healthTracking: false,
  },
  {
    site: 'gemini',
    feature: 'hideInputHalo',
    owner: 'plugin',
    officialPluginId: 'voyager.fake-halo',
    handlers: [],
    healthTracking: false,
  },
];

describe('createOfficialAdmission', () => {
  it('starts owner-table ids pending and leaves every other id admitted', () => {
    const admission = createOfficialAdmission(OWNERS);
    expect(admission.stateOf('voyager.fake-formula')).toBe('pending');
    expect(admission.stateOf('local.me.anything')).toBe('admitted');
    expect(admission.stateOf('voyager.chatgpt-folders')).toBe('admitted');
  });

  it('admits one feature, tells subscribers once, and ignores a repeat', () => {
    const admission = createOfficialAdmission(OWNERS);
    const listener = vi.fn();
    admission.subscribe(listener);

    admission.admit('gemini', 'formulaCopy');
    admission.admit('gemini', 'formulaCopy');

    expect(admission.stateOf('voyager.fake-formula')).toBe('admitted');
    expect(admission.stateOf('voyager.fake-halo')).toBe('pending');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('ignores a feature the owner table does not list for that site', () => {
    const admission = createOfficialAdmission(OWNERS);
    const listener = vi.fn();
    admission.subscribe(listener);
    admission.admit('aistudio', 'formulaCopy');
    expect(admission.stateOf('voyager.fake-formula')).toBe('pending');
    expect(listener).not.toHaveBeenCalled();
  });

  it('close denies what is still pending, keeps what was admitted, and is final', () => {
    const admission = createOfficialAdmission(OWNERS);
    const listener = vi.fn();
    admission.subscribe(listener);
    admission.admit('gemini', 'formulaCopy');
    listener.mockClear();

    admission.close();
    expect(admission.stateOf('voyager.fake-formula')).toBe('admitted');
    expect(admission.stateOf('voyager.fake-halo')).toBe('denied');
    expect(listener).toHaveBeenCalledTimes(1);

    // A continuation that resolves after teardown cannot revive a denied id.
    admission.admit('gemini', 'hideInputHalo');
    admission.close();
    expect(admission.stateOf('voyager.fake-halo')).toBe('denied');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('stops notifying a listener after it unsubscribes', () => {
    const admission = createOfficialAdmission(OWNERS);
    const listener = vi.fn();
    const unsubscribe = admission.subscribe(listener);
    unsubscribe();
    admission.admit('gemini', 'formulaCopy');
    expect(listener).not.toHaveBeenCalled();
  });

  it('governs the real owner table by default', () => {
    const admission = createOfficialAdmission();
    for (const id of Object.values(OFFICIAL_PLUGIN_IDS)) {
      expect(admission.stateOf(id)).toBe('pending');
    }
  });
});

describe('CLOSED_ADMISSION', () => {
  it('denies every owner-table id and admits every other id', () => {
    for (const id of Object.values(OFFICIAL_PLUGIN_IDS)) {
      expect(CLOSED_ADMISSION.stateOf(id)).toBe('denied');
    }
    expect(CLOSED_ADMISSION.stateOf('local.me.tweak')).toBe('admitted');
    expect(CLOSED_ADMISSION.stateOf('voyager.formula-copy')).toBe('admitted');
  });
});
