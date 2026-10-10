// Build-time reader for the bundled official catalog. Node-only: the store page
// imports the result through `pluginCatalog.data.ts`, so visitors get the cards
// in the prerendered HTML instead of fetching manifests from GitHub.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { type PluginManifest, type StorePlugin, toStorePlugin } from './pluginStore';

export type CatalogPlugin = StorePlugin;

export const CATALOG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../src/features/plugins/catalog',
);

interface MarketplaceEntry {
  name: string;
  source: string;
  official?: boolean;
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Read every plugin listed in `marketplace.json`. A missing manifest fails the
 * build rather than silently dropping a card.
 */
export function readCatalog(catalogDir: string = CATALOG_DIR): CatalogPlugin[] {
  const market = readJson(resolve(catalogDir, 'marketplace.json')) as {
    plugins?: MarketplaceEntry[];
  };
  return (market.plugins ?? []).map((entry) => {
    const m = readJson(resolve(catalogDir, entry.source)) as PluginManifest;
    return toStorePlugin(m, entry.official === true);
  });
}
