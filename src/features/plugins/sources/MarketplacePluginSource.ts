/**
 * MarketplacePluginSource — fetches the plugin catalog from a remote git-based
 * marketplace at runtime, validates each plugin manifest, and caches the result.
 *
 * The marketplace is plain data: a `marketplace.json` catalog listing plugins,
 * each pointing at a `plugin.json` (relative path resolved against the catalog,
 * or an absolute URL for third-party repos). A manifest may reference adjacent
 * CSS files via `contributes.styles[].file`; those are fetched, validated, and
 * normalized into CSS text before the runtime sees them. Only data/CSS is
 * fetched — never executable code — so this is Chrome MV3 "remotely-hosted code"
 * compliant.
 *
 * `list()` is cache-aware: returns a fresh cache immediately (refreshing in the
 * background), otherwise fetches; on network failure it falls back to a stale
 * cache. raw.githubusercontent.com returns `access-control-allow-origin: *`, so
 * the fetch works from popup, background and content contexts without any extra
 * host permission.
 */
import { logger } from '@/core/services/LoggerService';

import { validateManifest, validateStyleCss } from '../manifest/validate';
import { CATALOG_TTL_MS, loadCachedCatalog, saveCachedCatalog } from '../storage/catalogCache';
import type { PluginManifest, PluginSource } from '../types';

/** Official Voyager marketplace (nagi-studio). */
export const DEFAULT_MARKETPLACE_URL =
  'https://raw.githubusercontent.com/nagi-studio/voyager-plugins/main/marketplace.json';

interface CatalogEntry {
  readonly name?: string;
  readonly source?: string;
}

export interface MarketplacePluginSourceOptions {
  readonly catalogUrl?: string;
  readonly ttlMs?: number;
  /** Injectable for tests; defaults to global fetch. */
  readonly fetchImpl?: typeof fetch;
  /** Injectable for tests; defaults to Date.now. */
  readonly now?: () => number;
}

export class MarketplacePluginSource implements PluginSource {
  readonly id = 'marketplace';
  private readonly catalogUrl: string;
  private readonly ttlMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(options: MarketplacePluginSourceOptions = {}) {
    this.catalogUrl = options.catalogUrl ?? DEFAULT_MARKETPLACE_URL;
    this.ttlMs = options.ttlMs ?? CATALOG_TTL_MS;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
    this.now = options.now ?? (() => Date.now());
  }

  async list(): Promise<readonly PluginManifest[]> {
    const cached = await loadCachedCatalog();
    if (cached && this.now() - cached.fetchedAt < this.ttlMs) {
      // Fresh enough — serve cache, refresh in the background for next time.
      void this.refresh().catch(() => undefined);
      return cached.manifests;
    }
    try {
      return await this.refresh();
    } catch (error) {
      logger.warn('Marketplace fetch failed; using cached catalog', { error: String(error) });
      return cached?.manifests ?? [];
    }
  }

  /** Bypass the cache and fetch the catalog now (used by the "refresh" button). */
  async forceRefresh(): Promise<readonly PluginManifest[]> {
    try {
      return await this.refresh();
    } catch (error) {
      logger.warn('Marketplace forceRefresh failed', { error: String(error) });
      const cached = await loadCachedCatalog();
      return cached?.manifests ?? [];
    }
  }

  private async refresh(): Promise<PluginManifest[]> {
    const catalog = await this.fetchJson(this.catalogUrl);
    const entries: CatalogEntry[] =
      catalog &&
      typeof catalog === 'object' &&
      Array.isArray((catalog as { plugins?: unknown }).plugins)
        ? ((catalog as { plugins: CatalogEntry[] }).plugins ?? [])
        : [];

    const base = this.catalogUrl.replace(/\/[^/]*$/, '/');
    const manifests: PluginManifest[] = [];

    for (const entry of entries) {
      if (!entry?.source) continue;
      const url = /^https?:\/\//i.test(entry.source) ? entry.source : base + entry.source;
      try {
        const raw = await this.resolveStyleFiles(await this.fetchJson(url), url);
        const result = validateManifest(raw);
        if (result.success) {
          manifests.push(result.data);
        } else {
          logger.warn('Skipping invalid marketplace plugin', {
            name: entry.name ?? url,
            issues: result.error,
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch marketplace plugin', {
          name: entry.name ?? url,
          error: String(error),
        });
      }
    }

    await saveCachedCatalog(manifests, this.now());
    return manifests;
  }

  private async fetchJson(url: string): Promise<unknown> {
    const response = await this.fetchImpl(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.json();
  }

  private async fetchText(url: string): Promise<string> {
    const response = await this.fetchImpl(url, { cache: 'no-cache' });
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  }

  private async resolveStyleFiles(raw: unknown, manifestUrl: string): Promise<unknown> {
    if (!isRecord(raw) || !isRecord(raw.contributes) || !Array.isArray(raw.contributes.styles)) {
      return raw;
    }

    let changed = false;
    const styles = await Promise.all(
      raw.contributes.styles.map(async (entry, index): Promise<unknown> => {
        if (!isRecord(entry) || typeof entry.file !== 'string' || entry.css !== undefined) {
          return entry;
        }

        const file = normalizeStyleFilePath(entry.file);
        if (!file) {
          throw new Error(`Invalid CSS file path at contributes.styles[${index}].file`);
        }

        const cssUrl = new URL(file, manifestUrl).toString();
        const css = await this.fetchText(cssUrl);
        const issues = validateStyleCss(css, `contributes.styles[${index}].file`);
        if (issues.length > 0) {
          throw new Error(
            `Invalid CSS file ${file}: ${issues.map((issue) => issue.message).join('; ')}`,
          );
        }

        changed = true;
        return { css, source: file };
      }),
    );

    if (!changed) return raw;
    return {
      ...raw,
      contributes: {
        ...raw.contributes,
        styles,
      },
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStyleFilePath(file: string): string | null {
  const trimmed = file.trim().replace(/^\.\//, '');
  if (!trimmed || trimmed.startsWith('/') || trimmed.includes('\\')) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  if (trimmed.includes('?') || trimmed.includes('#')) return null;
  if (trimmed.split('/').some((segment) => segment === '..' || segment === '')) return null;
  if (!trimmed.toLowerCase().endsWith('.css')) return null;
  return trimmed;
}
