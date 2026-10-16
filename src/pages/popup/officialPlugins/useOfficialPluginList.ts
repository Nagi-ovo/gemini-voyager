import { useCallback, useMemo } from 'react';

import { effectivePluginView } from '@/features/plugins/storage/effectivePluginView';
import {
  type LegacySettingSnapshot,
  legacyEnableWrite,
} from '@/features/plugins/storage/legacySettingBindings';
import type { PluginStateMap } from '@/features/plugins/storage/pluginState';
import type { PluginManifest } from '@/features/plugins/types';

import { writePopupSyncStorageChecked } from '../utils/popupStorage';
import { OFFICIAL_PLUGIN_ENTRIES } from './officialPluginRegistry';
import { type ListedOfficialPlugin, officialPluginSearchItems } from './officialPluginSearch';
import { useLegacyPreferenceWrites } from './useLegacyPreferenceWrites';

export interface OfficialPluginRow extends ListedOfficialPlugin {
  /** The stored preference, not what the page decided (see effectivePluginView). */
  readonly enabled: boolean;
}

export interface OfficialPluginListOptions {
  /** Manifests whose matches cover the active tab. */
  readonly manifests: readonly PluginManifest[];
  readonly pluginState: PluginStateMap;
  /** The popup's live snapshot of the legacy keys, and whether its first read landed. */
  readonly legacy: LegacySettingSnapshot;
  readonly legacyLoaded: boolean;
  /** Test seam; the popup writes sync storage and checks the result. */
  readonly write?: (payload: Record<string, unknown>) => Promise<boolean>;
}

/** The official plugin list's rows, search targets and switch, for the active tab. */
export function useOfficialPluginList({
  manifests,
  pluginState,
  legacy,
  legacyLoaded,
  write = writePopupSyncStorageChecked,
}: OfficialPluginListOptions) {
  const preferences = useLegacyPreferenceWrites({ legacy, write });
  const listed = useMemo<readonly ListedOfficialPlugin[]>(() => {
    const byId = new Map(manifests.map((manifest) => [manifest.id, manifest]));
    return OFFICIAL_PLUGIN_ENTRIES.flatMap((entry) => {
      const manifest = byId.get(entry.id);
      return manifest ? [{ entry, manifest }] : [];
    });
  }, [manifests]);
  const rows = useMemo<readonly OfficialPluginRow[]>(
    () =>
      listed.map((plugin) => ({
        ...plugin,
        enabled: effectivePluginView(plugin.manifest, pluginState, preferences.legacy).enabled,
      })),
    [listed, pluginState, preferences.legacy],
  );
  const searchItems = useMemo(() => officialPluginSearchItems(listed), [listed]);
  const { writePreference } = preferences;
  // Every listed plugin is legacy-bound (the registry contract test holds it), so its switch
  // is its old sync key and its plugin-state entry is never written.
  const setEnabled = useCallback(
    (pluginId: string, enabled: boolean) => writePreference(legacyEnableWrite(pluginId, enabled)),
    [writePreference],
  );

  return {
    // Rows wait for the first read: a default must not flash over a stored choice.
    available: legacyLoaded && rows.length > 0,
    rows,
    searchItems,
    setEnabled,
  };
}
