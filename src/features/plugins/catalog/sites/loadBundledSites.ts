/**
 * Bundled site adapters from their `site.json` text, with no file system and
 * no bundler API. `index.ts` feeds it what `import.meta.glob` found (Vite and
 * Vitest); the `create-voyager-plugin` CLI build feeds it the same files read
 * from disk. Both therefore validate and order the sites the same way.
 */
import { readSiteAdapterData } from '../../sites/siteAdapterData';
import type { SiteAdapter } from '../../types';

export interface BundledSiteEntry {
  /** Directory name under `sites/`; must equal `site.json`'s `id`. */
  readonly siteDir: string;
  /** Catalog-relative path, e.g. `sites/claude/site.json`. */
  readonly path: string;
  readonly siteJson: string;
}

export interface LoadBundledSitesOptions {
  /** Source revision stamped on every adapter (0 for dev builds and tests). */
  readonly catalogRevision: number;
  /** A site that cannot be used: it is skipped and reported here. */
  readonly onInvalid: (message: string, details: Record<string, unknown>) => void;
}

function byPath(a: BundledSiteEntry, b: BundledSiteEntry): number {
  if (a.path === b.path) return 0;
  return a.path < b.path ? -1 : 1;
}

/** Validated adapters in `path` order; an invalid entry is reported and skipped. */
export function loadBundledSiteAdapters(
  entries: readonly BundledSiteEntry[],
  options: LoadBundledSitesOptions,
): readonly SiteAdapter[] {
  const adapters: SiteAdapter[] = [];
  for (const entry of [...entries].sort(byPath)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(entry.siteJson) as unknown;
    } catch (error) {
      options.onInvalid('Failed to parse bundled site.json', {
        path: entry.path,
        error: String(error),
      });
      continue;
    }
    // Runtime read, like the remote one; `catalog:build` and `plugin:check` hold the
    // authored file to the strict verdict.
    const { result } = readSiteAdapterData(parsed);
    if (!result.success) {
      options.onInvalid('Invalid bundled site.json', { path: entry.path, issues: result.error });
      continue;
    }
    if (result.data.id !== entry.siteDir) {
      options.onInvalid('Bundled site.json id must match its directory', {
        path: entry.path,
        id: result.data.id,
      });
      continue;
    }
    adapters.push({ ...result.data, catalogRevision: options.catalogRevision });
  }
  return adapters;
}
