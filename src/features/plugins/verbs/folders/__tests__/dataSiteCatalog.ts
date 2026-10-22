/**
 * A bundled catalog with one more site in it, Nimbus, defined only by data:
 * `fixtures/dataSite/site.json` and its folders `plugin.json`, with no
 * TypeScript of its own. A test that mocks the catalog module with
 * `catalogWithDataSite` runs the real registry, plugin host, folder table and
 * sync code as a build that shipped those two files would.
 *
 *   vi.mock('@/features/plugins/catalog/sites', async (importOriginal) =>
 *     (await import('<path>/dataSiteCatalog')).catalogWithDataSite(await importOriginal()),
 *   );
 */
import type * as Catalog from '@/features/plugins/catalog/sites';
import { loadBundledSiteAdapters } from '@/features/plugins/catalog/sites/loadBundledSites';

import pluginJson from './fixtures/dataSite/plugins/folders/plugin.json?raw';
import siteJson from './fixtures/dataSite/site.json?raw';

export const DATA_SITE = {
  id: 'nimbus',
  host: 'chat.nimbus.test',
  origin: 'https://chat.nimbus.test',
  pluginId: 'voyager.nimbus-folders',
  storageKey: 'gvFolderData:nimbus',
  backupNamespace: 'nimbus-folders',
  driveFile: 'gemini-voyager-nimbus-folders.json',
} as const;

type CatalogModule = typeof Catalog;

export function catalogWithDataSite(actual: CatalogModule): CatalogModule {
  const sites = [
    ...actual.listBundledSiteEntries(),
    { siteDir: DATA_SITE.id, path: `sites/${DATA_SITE.id}/site.json`, siteJson },
  ];
  const plugins = [
    ...actual.listBundledPluginEntries(),
    {
      siteDir: DATA_SITE.id,
      pluginDir: 'folders',
      path: `sites/${DATA_SITE.id}/plugins/folders/plugin.json`,
      manifestJson: pluginJson,
      styles: {},
    },
  ];
  const adapters = loadBundledSiteAdapters(sites, {
    catalogRevision: 0,
    onInvalid: (message) => {
      throw new Error(message);
    },
  });
  return {
    ...actual,
    BUNDLED_SITE_ADAPTERS: adapters,
    listBundledSiteEntries: () => sites,
    listBundledPluginEntries: () => plugins,
    requireBundledSiteAdapter: (id: string) => {
      const adapter = adapters.find((entry) => entry.id === id);
      if (!adapter) throw new Error(`Bundled site adapter "${id}" is missing or invalid`);
      return adapter;
    },
  };
}
