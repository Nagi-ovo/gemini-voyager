/**
 * Stands in for `src/features/plugins/catalog/sites/index.ts` in the CLI
 * bundle (see `build.ts`). The extension finds each `site.json` with Vite's
 * `import.meta.glob`; Node has no glob, so the build inlines the same files as
 * `voyager:site-entries` and this module runs them through the same
 * `loadBundledSiteAdapters`. An invalid site.json fails the CLI build's
 * self-check instead of silently dropping a site.
 */
import siteEntries from 'voyager:site-entries';

import {
  type BundledSiteEntry,
  loadBundledSiteAdapters,
} from '../../../src/features/plugins/catalog/sites/loadBundledSites';
import type { SiteAdapter } from '../../../src/features/plugins/types';

export type { BundledSiteEntry };

export function listBundledSiteEntries(): readonly BundledSiteEntry[] {
  return siteEntries;
}

export const BUNDLED_SITE_ADAPTERS: readonly SiteAdapter[] = loadBundledSiteAdapters(siteEntries, {
  catalogRevision: 0,
  onInvalid: (message, details) => {
    throw new Error(`${message} ${JSON.stringify(details)}`);
  },
});

export function requireBundledSiteAdapter(id: string): SiteAdapter {
  const adapter = BUNDLED_SITE_ADAPTERS.find((entry) => entry.id === id);
  if (!adapter) throw new Error(`Bundled site adapter "${id}" is missing or invalid`);
  return adapter;
}
