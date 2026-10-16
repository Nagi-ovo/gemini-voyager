import { useCallback, useMemo } from 'react';

import { effectivePluginView } from '@/features/plugins/storage/effectivePluginView';
import {
  type LegacySettingSnapshot,
  legacyBindingFor,
  legacyEnableWrite,
  subscribeLegacySettings,
} from '@/features/plugins/storage/legacySettingBindings';
import { legacyValueWrite } from '@/features/plugins/storage/legacyValueBindings';
import type { PluginStateMap } from '@/features/plugins/storage/pluginState';
import type { PluginManifest, PluginSettingValue, PluginSettings } from '@/features/plugins/types';
import { type TranslationKey } from '@/utils/translations';

import { writePopupSyncStorageChecked } from '../utils/popupStorage';
import {
  POPUP_LEGACY_SNAPSHOT_KEYS,
  OFFICIAL_PLUGIN_ENTRIES,
  type OfficialPluginContext,
} from './officialPluginRegistry';
import { type ListedOfficialPlugin, officialPluginSearchItems } from './officialPluginSearch';
import { useLegacyPreferenceWrites } from './useLegacyPreferenceWrites';

export interface OfficialPluginRow extends ListedOfficialPlugin {
  /** The stored preference, not what the page decided (see effectivePluginView). */
  readonly enabled: boolean;
  /** The manifest settings, read from their old keys the way the page reads them. */
  readonly settings: PluginSettings;
  /** How to use it once on, for this browser. */
  readonly usageHint: TranslationKey | null;
}

/** Change events for the bound keys and the panels' own keys, which the overlay settles. */
const subscribeShownKeys = (callback: (changed: LegacySettingSnapshot) => void) =>
  subscribeLegacySettings(callback, POPUP_LEGACY_SNAPSHOT_KEYS);

export interface OfficialPluginListOptions {
  /** Manifests whose matches cover the active tab. */
  readonly manifests: readonly PluginManifest[];
  readonly pluginState: PluginStateMap;
  /** The popup's live snapshot of the legacy keys, and whether its first read landed. */
  readonly legacy: LegacySettingSnapshot;
  readonly legacyLoaded: boolean;
  readonly context: OfficialPluginContext;
  /** Test seam; the popup writes sync storage and checks the result. */
  readonly write?: (payload: Record<string, unknown>) => Promise<boolean>;
}

/** The official plugin list's rows, search targets and switch, for the active tab. */
export function useOfficialPluginList({
  manifests,
  pluginState,
  legacy,
  legacyLoaded,
  context,
  write = writePopupSyncStorageChecked,
}: OfficialPluginListOptions) {
  const { isSafariBrowser } = context;
  const preferences = useLegacyPreferenceWrites({ legacy, write, subscribe: subscribeShownKeys });
  const listed = useMemo<readonly ListedOfficialPlugin[]>(() => {
    const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
    return OFFICIAL_PLUGIN_ENTRIES.flatMap((entry) => {
      const manifest = byId.get(entry.id);
      if (!manifest || (entry.eligible && !entry.eligible({ isSafariBrowser }))) return [];
      return [{ entry, manifest }];
    });
  }, [manifests, isSafariBrowser]);
  const rows = useMemo<readonly OfficialPluginRow[]>(
    () =>
      listed.map((plugin) => {
        const view = effectivePluginView(plugin.manifest, pluginState, preferences.legacy);
        const hint = plugin.entry.usageHint;
        const usageHint = typeof hint === 'function' ? hint({ isSafariBrowser }) : (hint ?? null);
        return { ...plugin, enabled: view.enabled, settings: view.settings, usageHint };
      }),
    [listed, pluginState, preferences.legacy, isSafariBrowser],
  );
  const searchItems = useMemo(() => officialPluginSearchItems(listed), [listed]);
  const { writePreference } = preferences;
  // Every listed plugin is legacy-bound (the registry contract test holds it), so its switch
  // is its old sync key and its plugin-state entry is never written.
  const setEnabled = useCallback(
    (pluginId: string, enabled: boolean) => writePreference(legacyEnableWrite(pluginId, enabled)),
    [writePreference],
  );
  const shownLegacy = preferences.legacy;
  // A boolean writes when flipped, a slider when released (OfficialPluginSliders).
  const setSettings = useCallback(
    (pluginId: string, values: Readonly<Record<string, PluginSettingValue>>) => {
      const payload = Object.assign(
        {},
        ...Object.entries(values).map(([key, value]) => legacyValueWrite(pluginId, key, value)),
      ) as Record<string, unknown>;
      const binding = legacyBindingFor(pluginId);
      // A never-stored Gemini width switch reads on only while the width is customized, so moving
      // the width back to its default would turn the row, and the page, off under the user's hand.
      // A setting is offered only while the row is on: store that switch as shown, but only when
      // this write would flip it (AI Studio's follows the folders switch, not its width).
      if (
        binding?.derive &&
        Object.keys(payload).length > 0 &&
        shownLegacy[binding.key] === undefined &&
        // The popup has no page lifetime: nothing here was changed live.
        !binding.derive({ ...shownLegacy, ...payload }, () => false)
      ) {
        Object.assign(payload, legacyEnableWrite(pluginId, true));
      }
      writePreference(payload);
    },
    [writePreference, shownLegacy],
  );

  return {
    // Rows wait for the first read: a default must not flash over a stored choice.
    available: legacyLoaded && rows.length > 0,
    rows,
    searchItems,
    setEnabled,
    setSettings,
    // What the option panels show and write: their keys, through the same overlay.
    panelValues: preferences.legacy,
    writePanel: writePreference,
  };
}
