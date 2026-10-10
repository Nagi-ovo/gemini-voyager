import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { PluginHost } from '../runtime/PluginHost';
import { SiteRegistry } from '../sites/registry';
import { type SiteAdapterData, validateSiteAdapterData } from '../sites/siteAdapterData';
import type { PluginManifest } from '../types';
import { HostCatalogSource } from './HostCatalogSource';
import { type HostCatalogCacheEntry, hostCatalogStorageKey } from './hostCatalogCache';
import { resolveSiteAdapterForUrl } from './siteOverride';

const HOST = 'chat.deepseek.com';
const URL = `https://${HOST}/a/chat`;
const VERSION = '1.9.0';
const KEY = hostCatalogStorageKey(HOST);
const SELECTED = 'voyager.selected-turns';
const MISSING = 'voyager.missing-target';

function site(selector: string, revision?: number): SiteAdapterData {
  return {
    id: 'deepseek',
    label: 'DeepSeek',
    matches: [`https://${HOST}/*`],
    selectors: { userTurn: selector },
    theme: { hostSelector: 'body', lightSelector: 'body.light', darkSelector: 'body.dark' },
    capabilities: ['chat'],
    ...(revision === undefined ? {} : { catalogRevision: revision }),
  };
}

function plugin(id: string, semantic: boolean): PluginManifest {
  return {
    id,
    name: id,
    description: 'Observe selected site knowledge',
    version: '1.0.0',
    author: 'Voyager',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: [`https://${HOST}/*`],
    contributes: {
      domOps: [
        {
          op: 'addClass',
          target: semantic
            ? { kind: 'semantic', key: 'userTurn' }
            : { kind: 'css', selector: '.absent-target' },
          className: 'gv-selected',
        },
      ],
    },
  };
}

function entry(published: SiteAdapterData): HostCatalogCacheEntry {
  return {
    host: HOST,
    status: 'ok',
    manifests: [plugin(SELECTED, true), plugin(MISSING, false)],
    site: published,
    fetchedAt: 10,
    lastAttemptAt: 10,
    failureCount: 0,
    extensionVersion: VERSION,
  };
}

/** Only the extension storage boundary is fake; source, validators, engine and health run normally. */
function storage(initial: HostCatalogCacheEntry) {
  const values: Record<string, unknown> = {
    [KEY]: structuredClone(initial),
    [StorageKeys.PLUGINS_STATE]: {
      [SELECTED]: { enabled: true, installedAt: 1 },
      [MISSING]: { enabled: true, installedAt: 1 },
    },
  };
  type Listener = Parameters<typeof chrome.storage.onChanged.addListener>[0];
  const listeners = new Set<Listener>();
  const set = vi.fn(async (items: Record<string, unknown>) => {
    const changes: Record<string, chrome.storage.StorageChange> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: structuredClone(values[key]), newValue: structuredClone(value) };
      values[key] = structuredClone(value);
    }
    for (const listener of Array.from(listeners)) listener(changes, 'local');
  });
  vi.stubGlobal('chrome', {
    ...chrome,
    storage: {
      ...chrome.storage,
      local: {
        get: async (keys: Record<string, unknown> | string) =>
          typeof keys === 'string'
            ? { [keys]: values[keys] }
            : { ...keys, ...structuredClone(values) },
        set,
      },
      onChanged: {
        addListener: (listener: Listener) => listeners.add(listener),
        removeListener: (listener: Listener) => listeners.delete(listener),
      },
    },
  });
  return { values, set };
}

function registry(bundled: SiteAdapterData): SiteRegistry {
  const result = validateSiteAdapterData(bundled);
  if (!result.success) throw new Error(JSON.stringify(result.error));
  const registered = new SiteRegistry();
  registered.register(result.data);
  return registered;
}

const hosts: PluginHost[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
});
afterEach(() => {
  for (const host of hosts.splice(0)) host.stop();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function startHost(registered: SiteRegistry, source: HostCatalogSource): PluginHost {
  const host = new PluginHost({
    url: URL,
    registry: registered,
    sources: [source],
    doc: document,
    isTopFrame: false,
  });
  hosts.push(host);
  return host;
}

const source = () => new HostCatalogSource({ extensionVersion: VERSION, enabled: true });

describe('catalog freshness preserves current site knowledge', () => {
  it.each([
    ['older published', 9, 10],
    ['equally recent published', 10, 10],
    ['unstamped published', undefined, 10],
    ['both unstamped', undefined, undefined],
  ] as const)(
    '%s selectors cannot hide turns recognized by the bundled adapter',
    async (_label, revision, bundledRevision) => {
      const cached = entry(site('.retired-turn', revision));
      const boundary = storage(cached);
      const registered = registry(site('.current-turn', bundledRevision));
      const remote = await source().siteOverride({ host: HOST });
      expect(remote).not.toBeNull();
      expect(resolveSiteAdapterForUrl(URL, registered, remote)?.selectors.userTurn).toBe(
        '.current-turn',
      );
      document.body.innerHTML = '<div class="current-turn"></div><div class="current-turn"></div>';
      const host = startHost(registered, source());
      await host.start();
      await vi.advanceTimersByTimeAsync(2000);

      expect(document.querySelectorAll('.current-turn.gv-selected')).toHaveLength(2);
      expect(host.getStatuses().find((status) => status.id === SELECTED)?.kind).toBe('mounted');
      expect(host.getStatuses().find((status) => status.id === MISSING)?.kind).toBe('no-effect');
      expect(boundary.values[KEY]).toEqual(cached);
      expect(boundary.set).not.toHaveBeenCalled();
    },
  );

  it('a newer published selector fix wins only on a URL it covers', async () => {
    storage(entry(site('.published-turn', 11)));
    const registered = registry(site('.bundled-turn', 10));
    const remote = await source().siteOverride({ host: HOST });
    expect(resolveSiteAdapterForUrl(URL, registered, remote)?.selectors.userTurn).toBe(
      '.published-turn',
    );
    expect(resolveSiteAdapterForUrl('https://claude.ai/new', registered, remote)).toBeNull();
    document.body.innerHTML =
      '<div class="published-turn"></div><div class="published-turn"></div><div class="published-turn"></div>';
    const host = startHost(registered, source());
    await host.start();
    await vi.advanceTimersByTimeAsync(2000);
    expect(document.querySelectorAll('.published-turn.gv-selected')).toHaveLength(3);
    expect(host.getStatuses().find((status) => status.id === MISSING)?.kind).toBe('no-effect');
  });

  it('an unstamped dev bundle still accepts a stamped remote selector fix', async () => {
    storage(entry(site('.published-turn', 1)));
    const registered = SiteRegistry.createDefault();
    document.body.innerHTML = '<div class="bundled-turn"></div><div class="published-turn"></div>';
    const host = startHost(registered, source());
    await host.start();
    expect(document.querySelector('.published-turn')?.classList.contains('gv-selected')).toBe(true);
    expect(document.querySelector('.bundled-turn')?.classList.contains('gv-selected')).toBe(false);
  });

  it('a stamp-only cache update activates the newly fresher selectors without reloading the page', async () => {
    const original = entry(site('.published-turn', 10));
    const boundary = storage(original);
    document.body.innerHTML = '<div class="bundled-turn"></div><div class="published-turn"></div>';
    const host = startHost(registry(site('.bundled-turn', 10)), source());
    await host.start();
    expect(document.querySelector('.bundled-turn')?.classList.contains('gv-selected')).toBe(true);
    expect(document.querySelector('.published-turn')?.classList.contains('gv-selected')).toBe(
      false,
    );

    await chrome.storage.local.set({ [KEY]: entry(site('.published-turn', 11)) });
    await vi.advanceTimersByTimeAsync(2000);

    expect(document.querySelector('.bundled-turn')?.classList.contains('gv-selected')).toBe(false);
    expect(document.querySelector('.published-turn')?.classList.contains('gv-selected')).toBe(true);
    expect(host.getStatuses().find((status) => status.id === MISSING)?.kind).toBe('no-effect');
    expect(boundary.set).toHaveBeenCalledTimes(1);
    expect(boundary.values[KEY]).toEqual(entry(site('.published-turn', 11)));
  });
});
