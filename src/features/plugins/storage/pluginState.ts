/**
 * Per-plugin install/enable state, persisted in `chrome.storage.local`.
 *
 * Stored under `StorageKeys.PLUGINS_STATE` as `Record<pluginId, PluginStateEntry>`.
 * Local (not sync) because the set of installed plugins can be sizeable and sync
 * quota is precious — same reasoning as the gems list cache. Entitlement
 * (purchased/locked) is intentionally NOT stored here; that comes from the
 * `EntitlementProvider` so it can be server-driven later.
 *
 * Content scripts use `chrome.storage` directly per the content-script rules.
 */
import { logger } from '@/core/services/LoggerService';
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import type { PluginSettingValue, PluginSettings } from '../types';

export interface PluginStateEntry {
  readonly enabled: boolean;
  readonly installedAt: number;
  /** User-chosen values for the plugin's declared settings (if any). */
  readonly settings?: PluginSettings;
}
export type PluginStateMap = Readonly<Record<string, PluginStateEntry>>;

const KEY = StorageKeys.PLUGINS_STATE;

function localArea(): chrome.storage.LocalStorageArea | undefined {
  const g = globalThis as { chrome?: typeof chrome };
  return g.chrome?.storage?.local;
}

function isStateMap(value: unknown): value is PluginStateMap {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value as Record<string, unknown>).every(
    (entry) => typeof entry === 'object' && entry !== null && 'enabled' in entry,
  );
}

export async function loadPluginState(): Promise<PluginStateMap> {
  const local = localArea();
  if (!local) return {};
  try {
    const result = await local.get({ [KEY]: {} });
    const raw = result?.[KEY];
    return isStateMap(raw) ? raw : {};
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.warn('loadPluginState failed', { error: String(error) });
    }
    return {};
  }
}

export async function setPluginEnabled(id: string, enabled: boolean): Promise<void> {
  const local = localArea();
  if (!local) return;
  try {
    const current = await loadPluginState();
    const previous = current[id];
    const next: PluginStateMap = {
      ...current,
      [id]: { ...previous, enabled, installedAt: previous?.installedAt ?? Date.now() },
    };
    await local.set({ [KEY]: next });
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.warn('setPluginEnabled failed', { id, error: String(error) });
    }
  }
}

/** Persist a single setting value for a plugin (preserving enabled state + other settings). */
export async function setPluginSetting(
  id: string,
  key: string,
  value: PluginSettingValue,
): Promise<void> {
  const local = localArea();
  if (!local) return;
  try {
    const current = await loadPluginState();
    const previous = current[id];
    const next: PluginStateMap = {
      ...current,
      [id]: {
        enabled: previous?.enabled ?? false,
        installedAt: previous?.installedAt ?? Date.now(),
        settings: { ...(previous?.settings ?? {}), [key]: value },
      },
    };
    await local.set({ [KEY]: next });
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.warn('setPluginSetting failed', { id, key, error: String(error) });
    }
  }
}

/** Subscribe to plugin-state changes (e.g. user toggles a plugin in the store UI). */
export function subscribePluginState(callback: (state: PluginStateMap) => void): () => void {
  const g = globalThis as { chrome?: typeof chrome };
  const onChanged = g.chrome?.storage?.onChanged;
  if (!onChanged) return () => {};

  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (area !== 'local' || !changes[KEY]) return;
    const raw = changes[KEY].newValue;
    callback(isStateMap(raw) ? raw : {});
  };
  onChanged.addListener(listener);
  return () => {
    try {
      onChanged.removeListener(listener);
    } catch {
      // ignore — context may be gone
    }
  };
}
