import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';

import { MarketplacePluginSource } from './MarketplacePluginSource';

const CATALOG = {
  plugins: [
    { name: 'a', source: 'plugins/a/plugin.json' },
    { name: 'file', source: 'plugins/file/plugin.json' },
    { name: 'bad', source: 'plugins/bad/plugin.json' },
    { name: 'abs', source: 'https://other.example/p.json' },
  ],
};

const VALID = {
  id: 'voyager.a',
  name: 'A',
  version: '1.0.0',
  description: 'd',
  author: 'x',
  category: 'render-fix',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: ['https://claude.ai/*'],
  contributes: { styles: [{ css: 'body{}' }] },
};
const VALID_ABS = { ...VALID, id: 'voyager.abs' };
const VALID_FILE = {
  ...VALID,
  id: 'voyager.file',
  contributes: { styles: [{ file: 'style.css' }] },
};
const INVALID = { id: '', name: '' };

function makeFetch(map: Record<string, unknown>) {
  return vi.fn(async (url: string) => {
    if (!(url in map)) return { ok: false, status: 404, json: async () => ({}) };
    const body = map[url];
    return {
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    };
  });
}

afterEach(() => {
  (chrome.storage.local.get as unknown as Mock).mockReset?.();
  (chrome.storage.local.set as unknown as Mock).mockReset?.();
});

describe('MarketplacePluginSource', () => {
  it('fetches the catalog, validates manifests, resolves relative + absolute sources, and skips invalid', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({});
    const fetchImpl = makeFetch({
      'https://ex.com/marketplace.json': CATALOG,
      'https://ex.com/plugins/a/plugin.json': VALID,
      'https://ex.com/plugins/file/plugin.json': VALID_FILE,
      'https://ex.com/plugins/file/style.css': '.from-file{color:red}',
      'https://ex.com/plugins/bad/plugin.json': INVALID,
      'https://other.example/p.json': VALID_ABS,
    });
    const source = new MarketplacePluginSource({
      catalogUrl: 'https://ex.com/marketplace.json',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 0,
      now: () => 1000,
    });

    const result = await source.list();
    expect(result.map((p) => p.id)).toEqual(['voyager.a', 'voyager.file', 'voyager.abs']);
    expect(result.find((p) => p.id === 'voyager.file')?.contributes.styles?.[0]).toEqual({
      css: '.from-file{color:red}',
      source: 'style.css',
    });
    // cache was written
    expect(chrome.storage.local.set as unknown as Mock).toHaveBeenCalled();
  });

  it('skips a plugin whose referenced CSS file fails validation', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({});
    const fetchImpl = makeFetch({
      'https://ex.com/marketplace.json': {
        plugins: [{ name: 'file', source: 'plugins/file/plugin.json' }],
      },
      'https://ex.com/plugins/file/plugin.json': VALID_FILE,
      'https://ex.com/plugins/file/style.css': '@import url("https://evil.example/x.css");',
    });
    const source = new MarketplacePluginSource({
      catalogUrl: 'https://ex.com/marketplace.json',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 0,
      now: () => 1000,
    });

    await expect(source.list()).resolves.toEqual([]);
  });

  it('serves a fresh cache with zero network traffic (no background refresh)', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginCatalogCache: { manifests: [VALID], fetchedAt: 1000 },
    });
    const fetchImpl = makeFetch({});
    const source = new MarketplacePluginSource({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 100000,
      now: () => 1500,
    });

    const result = await source.list();
    expect(result.map((p) => p.id)).toEqual(['voyager.a']);

    // The TTL must actually gate the network: repeated list() calls while
    // fresh (the PluginHost reload path) may not fetch anything.
    await source.list();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('serves a stale cache immediately and revalidates in the background', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginCatalogCache: { manifests: [VALID], fetchedAt: 0 },
    });
    const fetchImpl = makeFetch({
      'https://ex.com/marketplace.json': {
        plugins: [{ name: 'abs', source: 'https://other.example/p.json' }],
      },
      'https://other.example/p.json': VALID_ABS,
    });
    const source = new MarketplacePluginSource({
      catalogUrl: 'https://ex.com/marketplace.json',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 1000,
      now: () => 999999,
    });

    // Stale data served synchronously…
    const result = await source.list();
    expect(result.map((p) => p.id)).toEqual(['voyager.a']);

    // …while the background refresh updates the cache.
    await vi.waitFor(() => {
      expect(chrome.storage.local.set as unknown as Mock).toHaveBeenCalled();
    });
    const saved = (chrome.storage.local.set as unknown as Mock).mock.calls.at(-1)?.[0]
      ?.gvPluginCatalogCache;
    expect(saved.manifests.map((p: { id: string }) => p.id)).toEqual(['voyager.abs']);
    expect(saved.sources).toEqual({ 'https://other.example/p.json': 'voyager.abs' });
  });

  it('falls back to stale cache when the network fails', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginCatalogCache: { manifests: [VALID], fetchedAt: 0 },
    });
    const fetchImpl = makeFetch({}); // everything 404s
    const source = new MarketplacePluginSource({
      catalogUrl: 'https://ex.com/marketplace.json',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 0,
      now: () => 999999,
    });

    const result = await source.list();
    expect(result.map((p) => p.id)).toEqual(['voyager.a']);
  });

  it('keeps the last-known-good manifest when a single plugin fetch fails', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginCatalogCache: {
        manifests: [VALID, VALID_ABS],
        fetchedAt: 0,
        sources: {
          'https://ex.com/plugins/a/plugin.json': 'voyager.a',
          'https://other.example/p.json': 'voyager.abs',
        },
      },
    });
    // Catalog + plugin "a" fetch fine; the absolute-URL plugin 404s.
    const fetchImpl = makeFetch({
      'https://ex.com/marketplace.json': {
        plugins: [
          { name: 'a', source: 'plugins/a/plugin.json' },
          { name: 'abs', source: 'https://other.example/p.json' },
        ],
      },
      'https://ex.com/plugins/a/plugin.json': VALID,
    });
    const source = new MarketplacePluginSource({
      catalogUrl: 'https://ex.com/marketplace.json',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 0,
      now: () => 999999,
    });

    const result = await source.forceRefresh();
    expect(result.map((p) => p.id)).toEqual(['voyager.a', 'voyager.abs']);

    // The fallback keeps its url→id mapping so consecutive failures still
    // resolve, and the unchanged manifest set keeps the catalog signature
    // stable (no subscriber remount storm).
    const saved = (chrome.storage.local.set as unknown as Mock).mock.calls.at(-1)?.[0]
      ?.gvPluginCatalogCache;
    expect(saved.sources['https://other.example/p.json']).toBe('voyager.abs');
  });

  it('dedupes concurrent refreshes into a single network pass', async () => {
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({});
    const fetchImpl = makeFetch({
      'https://ex.com/marketplace.json': {
        plugins: [{ name: 'a', source: 'plugins/a/plugin.json' }],
      },
      'https://ex.com/plugins/a/plugin.json': VALID,
    });
    const source = new MarketplacePluginSource({
      catalogUrl: 'https://ex.com/marketplace.json',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      ttlMs: 0,
      now: () => 1000,
    });

    const [first, second] = await Promise.all([source.list(), source.list()]);
    expect(first.map((p) => p.id)).toEqual(['voyager.a']);
    expect(second.map((p) => p.id)).toEqual(['voyager.a']);

    const catalogFetches = (fetchImpl.mock.calls as Array<[string]>).filter(
      ([url]) => url === 'https://ex.com/marketplace.json',
    );
    expect(catalogFetches).toHaveLength(1);
  });
});
