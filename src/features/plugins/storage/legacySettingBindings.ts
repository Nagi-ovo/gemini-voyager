/**
 * The packaged official plugins whose on/off switch is an existing Voyager
 * setting, and how to read and write it.
 *
 * For a bound id the legacy sync key is the only authority: its entry in
 * `gvPluginsState` is ignored, enabled flag and settings alike, so restoring a
 * plugins backup and a settings backup in either order cannot disagree about
 * whether the feature runs. Every other id keeps `isPluginEnabled`.
 *
 * Each `read` is today's production reading of that key, invalid values
 * included, and `read(undefined)` is the production default. Not part of the
 * CLI bundle (it imports `StorageKeys`): `hostPolicy` must not import it.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { resolvePluginSettings } from '../runtime/resolvePluginSettings';
import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import type { PluginManifest, PluginSettings } from '../types';
import { isPluginEnabled } from './pluginDefaults';

export interface LegacyEnableBinding {
  readonly pluginId: string;
  readonly area: 'sync';
  readonly key: string;
  /** The production reading of the stored value; `read(undefined)` is the default. */
  readonly read: (stored: unknown) => boolean;
  /** The value the existing settings UI stores for this switch. */
  readonly write: (enabled: boolean) => unknown;
}

/** Stored values by storage key. An own key holding `undefined` means "removed". */
export type LegacySettingSnapshot = Readonly<Record<string, unknown>>;

type StateEntries = Readonly<
  Record<string, { readonly enabled?: unknown; readonly settings?: PluginSettings } | undefined>
>;

const onUnlessFalse = (stored: unknown): boolean => stored !== false;
const onOnlyIfTrue = (stored: unknown): boolean => stored === true;
const storeBoolean = (enabled: boolean): boolean => enabled;

function binding(
  pluginId: string,
  key: string,
  read: (stored: unknown) => boolean,
): LegacyEnableBinding {
  return { pluginId, area: 'sync', key, read, write: storeBoolean };
}

export const LEGACY_ENABLE_BINDINGS: Readonly<Record<string, LegacyEnableBinding>> = {
  // One switch for both sites, as the popup has always presented it.
  [OFFICIAL_PLUGIN_IDS.geminiFormulaCopy]: binding(
    OFFICIAL_PLUGIN_IDS.geminiFormulaCopy,
    StorageKeys.FORMULA_COPY_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy]: binding(
    OFFICIAL_PLUGIN_IDS.aistudioFormulaCopy,
    StorageKeys.FORMULA_COPY_ENABLED,
    onUnlessFalse,
  ),
  [OFFICIAL_PLUGIN_IDS.geminiVimInput]: binding(
    OFFICIAL_PLUGIN_IDS.geminiVimInput,
    StorageKeys.INPUT_VIM_MODE,
    onOnlyIfTrue,
  ),
  // `true` hides the halo: the feature is on.
  [OFFICIAL_PLUGIN_IDS.geminiHideInputHalo]: binding(
    OFFICIAL_PLUGIN_IDS.geminiHideInputHalo,
    StorageKeys.INPUT_HALO_HIDDEN,
    onOnlyIfTrue,
  ),
};

export function legacyBindingFor(id: string): LegacyEnableBinding | null {
  return Object.prototype.hasOwnProperty.call(LEGACY_ENABLE_BINDINGS, id)
    ? LEGACY_ENABLE_BINDINGS[id]
    : null;
}

/** The storage keys behind every binding, each once. */
export function legacyBindingKeys(): readonly string[] {
  return [...new Set(Object.values(LEGACY_ENABLE_BINDINGS).map((entry) => entry.key))];
}

function snapshotValue(legacy: LegacySettingSnapshot, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(legacy, key) ? legacy[key] : undefined;
}

/** Whether plugin `id` should run: its legacy key when bound, otherwise its plugin-state entry. */
export function resolveEffectiveEnabled(
  state: StateEntries,
  legacy: LegacySettingSnapshot,
  id: string,
): boolean {
  const bound = legacyBindingFor(id);
  if (bound) return bound.read(snapshotValue(legacy, bound.key));
  return isPluginEnabled(state, id);
}

/**
 * The settings a plugin runs with. A bound official plugin always gets `{}`:
 * its manifest declares no settings, its runtime reads its own legacy keys,
 * and stray map values must not restart it.
 */
export function resolveEffectiveSettings(
  manifest: PluginManifest,
  state: StateEntries,
): PluginSettings {
  if (legacyBindingFor(manifest.id)) return {};
  const entry = Object.prototype.hasOwnProperty.call(state, manifest.id)
    ? state[manifest.id]
    : undefined;
  return resolvePluginSettings(manifest, entry?.settings);
}

/** The sync-storage write that switches bound plugin `id` on or off. */
export function legacyEnableWrite(id: string, enabled: boolean): Readonly<Record<string, unknown>> {
  const bound = legacyBindingFor(id);
  if (!bound) throw new Error(`No legacy setting binding for plugin "${id}"`);
  return { [bound.key]: bound.write(enabled) };
}

function syncArea(): chrome.storage.SyncStorageArea | undefined {
  const g = globalThis as { chrome?: typeof chrome };
  return g.chrome?.storage?.sync;
}

/**
 * Read every binding key from sync storage; a missing key stays missing.
 * An invalidated extension context rejects (the caller must not mount on a
 * guessed default). Any other failure is logged and read as "all missing",
 * the defaults the native modules have always fallen back to.
 */
export async function loadLegacySettingSnapshot(): Promise<LegacySettingSnapshot> {
  const sync = syncArea();
  if (!sync) return {};
  const keys = legacyBindingKeys();
  let stored: Record<string, unknown> | undefined;
  try {
    stored = await sync.get<Record<string, unknown>>([...keys]);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) throw error;
    logger.warn('loadLegacySettingSnapshot failed', { error: String(error) });
    return {};
  }
  const snapshot: Record<string, unknown> = {};
  for (const key of keys) {
    if (stored && Object.prototype.hasOwnProperty.call(stored, key)) snapshot[key] = stored[key];
  }
  return snapshot;
}

/**
 * Report changes to binding keys in sync storage. A removed key arrives as an
 * own key holding `undefined`, so merging the change over a snapshot restores
 * that binding's default.
 */
export function subscribeLegacySettings(
  callback: (changed: LegacySettingSnapshot) => void,
): () => void {
  const g = globalThis as { chrome?: typeof chrome };
  const onChanged = g.chrome?.storage?.onChanged;
  if (!onChanged) return () => {};
  const keys = legacyBindingKeys();

  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'sync') return;
    const changed: Record<string, unknown> = {};
    let any = false;
    for (const key of keys) {
      if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
      changed[key] = changes[key]?.newValue;
      any = true;
    }
    if (any) callback(changed);
  };
  try {
    onChanged.addListener(listener);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return () => {};
    throw error;
  }
  return () => {
    try {
      onChanged.removeListener(listener);
    } catch {
      // ignore — context may be gone
    }
  };
}
