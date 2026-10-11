import { describe, expect, it, vi } from 'vitest';

import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import type {
  FeatureOwner,
  OwnedFeature,
  OwnedFeatureId,
  PackagedSiteId,
} from '@/features/plugins/sites/featureOwners';

import { admitPluginOwnedFeature, startOwnedFeature } from '../featureOwnerStartup';

function ownersWith(owner: FeatureOwner): readonly OwnedFeature[] {
  return [
    {
      site: 'aistudio',
      feature: 'formulaCopy',
      owner,
      officialPluginId: 'voyager.fake-aistudio-formula',
      handlers: ['formulaCopy'],
      healthTracking: false,
    },
  ];
}

function ownerOf(owners: readonly OwnedFeature[]) {
  return (site: PackagedSiteId, feature: OwnedFeatureId): FeatureOwner =>
    owners.find((entry) => entry.site === site && entry.feature === feature)?.owner ?? 'legacy';
}

describe('startOwnedFeature', () => {
  it('runs the native module once and leaves the official plugin to be denied when legacy owns it', async () => {
    const owners = ownersWith('legacy');
    const admission = createOfficialAdmission(owners);
    const startLegacy = vi.fn(async () => {});

    await startOwnedFeature(admission, 'aistudio', 'formulaCopy', startLegacy, ownerOf(owners));
    expect(startLegacy).toHaveBeenCalledTimes(1);
    expect(admission.stateOf('voyager.fake-aistudio-formula')).toBe('pending');

    admission.close();
    expect(admission.stateOf('voyager.fake-aistudio-formula')).toBe('denied');
  });

  it('admits the official plugin instead of starting the native module when the plugin owns it', async () => {
    const owners = ownersWith('plugin');
    const admission = createOfficialAdmission(owners);
    const startLegacy = vi.fn(async () => {});

    await startOwnedFeature(admission, 'aistudio', 'formulaCopy', startLegacy, ownerOf(owners));
    expect(startLegacy).not.toHaveBeenCalled();
    expect(admission.stateOf('voyager.fake-aistudio-formula')).toBe('admitted');

    admission.close();
    expect(admission.stateOf('voyager.fake-aistudio-formula')).toBe('admitted');
  });

  it('passes a native start failure on to the caller', async () => {
    const owners = ownersWith('legacy');
    const failure = new Error('Extension context invalidated.');
    await expect(
      startOwnedFeature(
        createOfficialAdmission(owners),
        'aistudio',
        'formulaCopy',
        async () => {
          throw failure;
        },
        ownerOf(owners),
      ),
    ).rejects.toBe(failure);
  });
});

describe('admitPluginOwnedFeature (AI Studio with its master switch off)', () => {
  it('admits a plugin-owned feature so the master switch alone decides whether it runs', () => {
    const owners = ownersWith('plugin');
    const admission = createOfficialAdmission(owners);
    admitPluginOwnedFeature(admission, 'aistudio', 'formulaCopy', ownerOf(owners));
    expect(admission.stateOf('voyager.fake-aistudio-formula')).toBe('admitted');
  });

  it('starts nothing and admits nothing while legacy owns the feature', () => {
    const owners = ownersWith('legacy');
    const admission = createOfficialAdmission(owners);
    admitPluginOwnedFeature(admission, 'aistudio', 'formulaCopy', ownerOf(owners));
    admission.close();
    expect(admission.stateOf('voyager.fake-aistudio-formula')).toBe('denied');
  });
});
