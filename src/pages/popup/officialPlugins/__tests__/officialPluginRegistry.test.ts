import { describe, expect, it } from 'vitest';

import { BACKUPABLE_SYNC_SETTINGS_DEFAULTS } from '@/core/services/SettingsBackupService';
import { isPackagedOfficialPluginId } from '@/features/plugins/sites/featureOwners';
import { BuiltinPluginSource } from '@/features/plugins/sources/BuiltinPluginSource';
import { BundledCatalogPluginSource } from '@/features/plugins/sources/BundledCatalogPluginSource';
import { legacyBindingFor } from '@/features/plugins/storage/legacySettingBindings';
import { legacyValueBindingsFor } from '@/features/plugins/storage/legacyValueBindings';
import { TRANSLATIONS } from '@/utils/translations';

import { OFFICIAL_PLUGIN_ENTRIES, OFFICIAL_PLUGIN_GROUPS } from '../officialPluginRegistry';

async function packagedManifests() {
  const lists = await Promise.all([
    new BuiltinPluginSource().list(),
    new BundledCatalogPluginSource().list(),
  ]);
  return new Map(lists.flat().map((manifest) => [manifest.id, manifest]));
}

describe('the official plugin list registry', () => {
  it('lists each packaged official plugin at most once, in a known group', () => {
    const ids = OFFICIAL_PLUGIN_ENTRIES.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    const groups = new Set(OFFICIAL_PLUGIN_GROUPS.map((group) => group.id));
    for (const entry of OFFICIAL_PLUGIN_ENTRIES) {
      expect(isPackagedOfficialPluginId(entry.id), entry.id).toBe(true);
      expect(groups.has(entry.group), entry.id).toBe(true);
    }
  });

  it('lists only plugins whose switch is their old setting, so a row never writes plugin state', () => {
    for (const entry of OFFICIAL_PLUGIN_ENTRIES) {
      expect(legacyBindingFor(entry.id), entry.id).not.toBeNull();
    }
  });

  it('lists only plugins whose every setting is filled from an old setting', async () => {
    const manifests = await packagedManifests();
    for (const entry of OFFICIAL_PLUGIN_ENTRIES) {
      const manifest = manifests.get(entry.id);
      expect(manifest, entry.id).toBeDefined();
      // A row has no settings panel yet, so a setting nothing fills could never be changed.
      const declared = Object.keys(manifest!.contributes.settings ?? {}).sort();
      const bound = legacyValueBindingsFor(entry.id)
        .map((binding) => binding.settingKey)
        .sort();
      expect(declared, entry.id).toEqual(bound);
    }
  });

  it('a restored settings backup keeps a never-touched switch the way it was', () => {
    // Export fills a missing key with its backup default and restore writes it back.
    const defaults: Readonly<Record<string, unknown>> = BACKUPABLE_SYNC_SETTINGS_DEFAULTS;
    for (const entry of OFFICIAL_PLUGIN_ENTRIES) {
      const binding = legacyBindingFor(entry.id)!;
      expect(Object.hasOwn(defaults, binding.key), binding.key).toBe(true);
      expect(binding.read(defaults[binding.key]), entry.id).toBe(binding.read(undefined));
    }
  });

  it('names every group and every old search word in English', () => {
    for (const group of OFFICIAL_PLUGIN_GROUPS) expect(TRANSLATIONS.en[group.label]).toBeTruthy();
    for (const entry of OFFICIAL_PLUGIN_ENTRIES) {
      for (const key of entry.searchKeys) expect(TRANSLATIONS.en[key], key).toBeTruthy();
    }
  });
});
