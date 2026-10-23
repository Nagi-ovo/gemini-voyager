import { useCallback, useMemo } from 'react';

import type { FormFactor } from '@/core/types/formFactor';
import { runsOnFormFactor } from '@/features/plugins/runtime/pluginStatus';
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

import { writePopupSyncChangesChecked } from '../utils/popupStorage';
import {
  POPUP_LEGACY_SNAPSHOT_KEYS,
  OFFICIAL_PLUGIN_ENTRIES,
  UNAVAILABLE_ON_THIS_DEVICE,
  type OfficialPluginContext,
  type OfficialPluginEntry,
  type OfficialPluginTopicId,
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
  /** Why the feature is unavailable, or the native setting it needs while off. */
  readonly unmetRequirement: NonNullable<OfficialPluginEntry['requires']> | null;
}

/** Change events for the bound keys and the panels' own keys, which the overlay settles. */
const subscribeShownKeys = (callback: (changed: LegacySettingSnapshot) => void) =>
  subscribeLegacySettings(callback, POPUP_LEGACY_SNAPSHOT_KEYS);

/** A switch flip's sync write, and how to put back what it replaced. */
export interface OfficialPluginFlipWrite {
  readonly written: Readonly<Record<string, unknown>>;
  readonly restore: () => void;
}

export interface OfficialPluginListOptions {
  /** Manifests whose matches cover the active tab. */
  readonly manifests: readonly PluginManifest[];
  readonly pluginState: PluginStateMap;
  /** The popup's live snapshot of the legacy keys, and whether its first read landed. */
  readonly legacy: LegacySettingSnapshot;
  readonly legacyLoaded: boolean;
  readonly context: OfficialPluginContext;
  /** The device the popup runs on; a plugin it does not support is greyed with why. Null while read. */
  readonly formFactor?: FormFactor | null;
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
  formFactor = null,
  write = writePopupSyncChangesChecked,
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
        const requires = plugin.entry.requires;
        // Worked out here too: on Firefox for Android the page may report nothing.
        const unmetRequirement =
          formFactor && !runsOnFormFactor(plugin.manifest, formFactor)
            ? UNAVAILABLE_ON_THIS_DEVICE
            : requires && !requires.met(preferences.legacy)
              ? requires
              : null;
        return {
          ...plugin,
          enabled: view.enabled,
          settings: view.settings,
          usageHint,
          unmetRequirement,
        };
      }),
    [listed, pluginState, preferences.legacy, isSafariBrowser, formFactor],
  );
  const searchItems = useMemo(() => officialPluginSearchItems(listed), [listed]);
  // Rows wait for the first read: a default must not flash over a stored choice.
  const available = legacyLoaded && rows.length > 0;
  const topics = useMemo<ReadonlySet<OfficialPluginTopicId>>(
    () => new Set(available ? listed.map(({ entry }) => entry.topic) : []),
    [available, listed],
  );
  const { writePreference } = preferences;
  // Every listed plugin is legacy-bound (the registry contract test holds it), so its switch
  // is its old sync key and its plugin-state entry is never written.
  const enablePayload = useCallback(
    (pluginId: string, enabled: boolean): Record<string, unknown> => {
      const write = listed.find((plugin) => plugin.manifest.id === pluginId)?.entry.enableWrite;
      return {
        ...(write ? write(enabled, preferences.legacy) : legacyEnableWrite(pluginId, enabled)),
      };
    },
    [listed, preferences.legacy],
  );
  const setEnabled = useCallback(
    (pluginId: string, enabled: boolean) => writePreference(enablePayload(pluginId, enabled)),
    [writePreference, enablePayload],
  );
  /**
   * Flip a switch and keep what it replaced: every key the flip writes, as the
   * popup showed it, so putting it back restores an effect choice, a legacy
   * key or an unstored key exactly (undefined removes the key).
   */
  const flipEnabled = useCallback(
    (pluginId: string, enabled: boolean): OfficialPluginFlipWrite => {
      const written = enablePayload(pluginId, enabled);
      const replaced = Object.fromEntries(
        Object.keys(written).map((key) => [key, preferences.legacy[key]]),
      );
      writePreference(written);
      return { written, restore: () => writePreference(replaced) };
    },
    [writePreference, enablePayload, preferences.legacy],
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
      // A setting is offered only while the row is on, so a never-stored derived switch is stored
      // as shown unless an open page, seeing this write arrive live, would still read it on.
      // Gemini's width switches read off once their width changes live, so they are stored with
      // the width; AI Studio's sidebar switch follows the folders switch, so its width goes alone.
      if (
        binding?.derive &&
        Object.keys(payload).length > 0 &&
        shownLegacy[binding.key] === undefined &&
        !binding.derive({ ...shownLegacy, ...payload }, (key) => Object.hasOwn(payload, key))
      ) {
        Object.assign(payload, legacyEnableWrite(pluginId, true));
      }
      writePreference(payload);
    },
    [writePreference, shownLegacy],
  );

  return {
    available,
    /** The topic cards that have a row on this tab. */
    topics,
    rows,
    searchItems,
    setEnabled,
    flipEnabled,
    setSettings,
    // What the option panels show and write: their keys, through the same overlay.
    panelValues: preferences.legacy,
    writePanel: writePreference,
  };
}
