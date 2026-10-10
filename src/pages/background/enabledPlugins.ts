import { StorageKeys } from '@/core/types/common';
import { isPluginEnabled } from '@/features/plugins/storage/pluginDefaults';
import type { PluginManifest } from '@/features/plugins/types';

/**
 * The plugins that are on, from the catalog `loadCatalog` returns: the ones the
 * user turned on, plus default-on builtins the user has not turned off.
 * Plugin enable state (storage.local) is the single source of truth; content
 * script registrations and permissions are derived from it.
 */
export async function loadEnabledPlugins(
  loadCatalog: () => Promise<readonly PluginManifest[]>,
): Promise<PluginManifest[]> {
  let state: unknown = {};
  try {
    const stored = await chrome.storage.local.get({ [StorageKeys.PLUGINS_STATE]: {} });
    state = stored?.[StorageKeys.PLUGINS_STATE];
  } catch {
    return [];
  }
  const entries =
    state && typeof state === 'object' && !Array.isArray(state)
      ? (state as Record<string, { enabled?: unknown } | undefined>)
      : {};
  const catalog = await loadCatalog();
  return catalog.filter((plugin) => isPluginEnabled(entries, plugin.id));
}
