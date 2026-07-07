import { logger } from '@/core/services/LoggerService';

import type { PluginManifest, PluginSource } from '../types';
import { BuiltinPluginSource } from './BuiltinPluginSource';
import { BundledCatalogPluginSource } from './BundledCatalogPluginSource';

// The remote third-party marketplace (MarketplacePluginSource →
// nagi-studio/voyager-plugins) is temporarily disabled: official plugins now
// ship in the bundled catalog, and no third-party channel is being promoted.
// Re-add `new MarketplacePluginSource()` here (and in refreshPluginManifests)
// to reopen it.
export function createDefaultPluginSources(): readonly PluginSource[] {
  return [new BuiltinPluginSource(), new BundledCatalogPluginSource()];
}

export async function listPluginManifests(
  sources: readonly PluginSource[] = createDefaultPluginSources(),
): Promise<readonly PluginManifest[]> {
  const lists: Array<readonly PluginManifest[]> = [];
  for (const source of sources) {
    try {
      lists.push(await source.list());
    } catch (error) {
      logger.warn('Plugin source failed to list', { source: source.id, error: String(error) });
    }
  }
  return dedupeManifestsById(lists);
}

export async function refreshPluginManifests(): Promise<readonly PluginManifest[]> {
  return listPluginManifests([new BuiltinPluginSource(), new BundledCatalogPluginSource()]);
}

/** Merge manifest lists from multiple sources; first occurrence of an id wins. */
export function dedupeManifestsById(
  lists: readonly (readonly PluginManifest[])[],
): PluginManifest[] {
  const seen = new Set<string>();
  const merged: PluginManifest[] = [];
  for (const list of lists) {
    for (const manifest of list) {
      if (seen.has(manifest.id)) continue;
      seen.add(manifest.id);
      merged.push(manifest);
    }
  }
  return merged;
}
