import { logger } from '@/core/services/LoggerService';

import type { PluginManifest, PluginSource } from '../types';
import { BuiltinPluginSource } from './BuiltinPluginSource';
import { BundledCatalogPluginSource } from './BundledCatalogPluginSource';
import { MarketplacePluginSource } from './MarketplacePluginSource';

export function createDefaultPluginSources(): readonly PluginSource[] {
  return [
    new BuiltinPluginSource(),
    new BundledCatalogPluginSource(),
    new MarketplacePluginSource(),
  ];
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
  const marketplace = new MarketplacePluginSource();
  return listPluginManifests([
    new BuiltinPluginSource(),
    new BundledCatalogPluginSource(),
    {
      id: marketplace.id,
      list: () => marketplace.forceRefresh(),
    },
  ]);
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
