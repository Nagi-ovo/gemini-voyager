import { describe, expect, it } from 'vitest';

import { BACKUPABLE_SYNC_SETTINGS_DEFAULTS } from '@/core/services/SettingsBackupService';
import {
  OFFICIAL_PLUGIN_IDS,
  isPackagedOfficialPluginId,
} from '@/features/plugins/sites/featureOwners';
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

  it('gives every packaged Gemini and AI Studio plugin a row, or names it as still on a card', () => {
    // Migrated at runtime, their popup rows come in the next batch; until then their cards stay.
    const stillOnACard: readonly string[] = [
      OFFICIAL_PLUGIN_IDS.geminiBatchDelete,
      OFFICIAL_PLUGIN_IDS.aistudioBatchDelete,
      OFFICIAL_PLUGIN_IDS.geminiWatermarkDownload,
      OFFICIAL_PLUGIN_IDS.geminiWatermarkPreview,
    ];
    const listed = new Set(OFFICIAL_PLUGIN_ENTRIES.map((entry) => entry.id));
    expect(Object.values(OFFICIAL_PLUGIN_IDS).filter((id) => !listed.has(id))).toEqual(
      stillOnACard,
    );
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
      // A row's settings write to their old keys; a setting nothing binds would never be saved.
      const declared = Object.keys(manifest!.contributes.settings ?? {}).sort();
      const bound = legacyValueBindingsFor(entry.id)
        .map((binding) => binding.settingKey)
        .sort();
      expect(declared, entry.id).toEqual(bound);
    }
  });

  it('gives every number setting a slider, which writes on release', async () => {
    // The generic settings panel writes a number on every step, a sync write each.
    const manifests = await packagedManifests();
    for (const entry of OFFICIAL_PLUGIN_ENTRIES) {
      const fields = Object.entries(manifests.get(entry.id)!.contributes.settings ?? {});
      const numbers = fields.filter(([, field]) => field.type === 'number').map(([key]) => key);
      expect(Object.keys(entry.sliders ?? {}).sort(), entry.id).toEqual(numbers.sort());
      // A row with its own inline control shows that instead of the generic settings.
      if (entry.inlinePanel) continue;
      for (const [key, field] of fields) {
        expect(['boolean', 'number'], `${entry.id}.${key}`).toContain(field.type);
      }
    }
  });

  it('a restored settings backup keeps a never-touched switch the way it was', () => {
    // Export fills a missing key with its backup default and restore writes it back.
    // Known gap: a width switch that was never stored reads on from a customized width
    // (`derive`); a restore stores false over it and turns that width off. Fixing it is
    // a SettingsBackupService change, outside the popup.
    const defaults: Readonly<Record<string, unknown>> = BACKUPABLE_SYNC_SETTINGS_DEFAULTS;
    // The background stores the highlight switch on first run (migrateOptionalHighlightSetting),
    // so its key is never missing for long; its backup default (on) never meets a missing key.
    const storedOnFirstRun = new Set<string>([OFFICIAL_PLUGIN_IDS.geminiHighlight]);
    for (const entry of OFFICIAL_PLUGIN_ENTRIES) {
      if (storedOnFirstRun.has(entry.id)) continue;
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
