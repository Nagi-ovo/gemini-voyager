import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

import { patternWithinAny } from '../../sites/matchPattern';
import { SEMANTIC_SELECTOR_KEYS } from '../../sites/semanticKeys';
import { BundledCatalogPluginSource } from '../../sources/BundledCatalogPluginSource';
import type { PluginManifest } from '../../types';
import {
  BUNDLED_SITE_ADAPTERS,
  listBundledPluginEntries,
  listBundledSiteEntries,
  requireBundledSiteAdapter,
} from './index';

const catalogDir = resolve(process.cwd(), 'src/features/plugins/catalog');
// Read disk independently so a discovery omission cannot remove its own expectation.
const pluginPaths = readdirSync(resolve(catalogDir, 'sites'), { recursive: true, encoding: 'utf8' })
  .map((path) => path.split(sep).join('/'))
  .filter((path) => /^[^/]+\/plugins\/[^/]+\/plugin\.json$/.test(path))
  .sort()
  .map((path) => `sites/${path}`);

function readManifest(path: string): PluginManifest {
  return JSON.parse(readFileSync(resolve(catalogDir, path), 'utf8')) as PluginManifest;
}

describe('bundled catalog discovery', () => {
  it('finds one site.json per plugin platform, with ids equal to their directories', () => {
    const entries = listBundledSiteEntries();
    expect(entries.map((entry) => entry.siteDir)).toEqual(['chatgpt', 'claude', 'deepseek']);
    expect(BUNDLED_SITE_ADAPTERS.map((adapter) => adapter.id)).toEqual([
      'chatgpt',
      'claude',
      'deepseek',
    ]);
    for (const adapter of BUNDLED_SITE_ADAPTERS) {
      expect(requireBundledSiteAdapter(adapter.id)).toBe(adapter);
      expect(adapter.capabilities).toBeInstanceOf(Set);
      expect(adapter.brandColor).toMatch(/^#[0-9a-f]{6}$/i);
      for (const key of Object.keys(adapter.selectors)) {
        expect(SEMANTIC_SELECTOR_KEYS).toContain(key);
      }
    }
    expect(() => requireBundledSiteAdapter('nope')).toThrow(/missing or invalid/);
  });

  it('finds every plugin under its site and pairs it with its CSS files', () => {
    const entries = listBundledPluginEntries();
    expect(pluginPaths.length).toBeGreaterThan(0);
    expect(entries.map((entry) => entry.path)).toEqual(pluginPaths);
    const ids = pluginPaths.map((path) => readManifest(path).id);
    expect(new Set(ids).size, 'bundled plugin ids must be unique').toBe(ids.length);
    for (const entry of entries) {
      const manifest = readManifest(entry.path);
      expect(JSON.parse(entry.manifestJson), entry.path).toEqual(manifest);
      expect(entry.path).toBe(`sites/${entry.siteDir}/plugins/${entry.pluginDir}/plugin.json`);
      expect(manifest.id, entry.path).toBe(`voyager.${entry.siteDir}-${entry.pluginDir}`);
      const pluginDir = dirname(resolve(catalogDir, entry.path));
      const diskStyles = Object.fromEntries(
        readdirSync(pluginDir)
          .filter((file) => file.endsWith('.css'))
          .map((file) => [file, readFileSync(resolve(pluginDir, file), 'utf8')]),
      );
      expect(entry.styles, entry.path).toEqual(diskStyles);
      // A primitive-only plugin ships no CSS; every CSS file found is real content.
      for (const [file, css] of Object.entries(entry.styles)) {
        expect(file).toMatch(/\.css$/);
        expect(css.length).toBeGreaterThan(0);
      }
      // A CSS file the manifest never declares would ship but never apply.
      const declares = (manifest.contributes?.styles?.length ?? 0) > 0;
      expect(Object.keys(entry.styles).length > 0, entry.path).toBe(declares);
    }
  });

  it('keeps every plugin inside the match scope of its site (plan D18)', async () => {
    const manifests = await new BundledCatalogPluginSource().list();
    expect(manifests).toHaveLength(pluginPaths.length);
    for (const path of pluginPaths) {
      const manifest = manifests.find((m) => readManifest(path).id === m.id);
      const site = requireBundledSiteAdapter(path.split('/')[1]);
      expect(manifest, `${path}: plugin was not loaded`).toBeDefined();
      for (const pattern of manifest!.matches) {
        expect(patternWithinAny(pattern, site.matches), `${path}: ${pattern}`).toBe(true);
      }
    }
  });

  it('keeps marketplace.json (the docs plugin-store index) in sync with discovery', () => {
    const index = JSON.parse(readFileSync(resolve(catalogDir, 'marketplace.json'), 'utf8')) as {
      plugins: { name: string; source: string }[];
    };
    const listed = index.plugins.map((plugin) => plugin.source);
    for (const path of pluginPaths) {
      const name = readManifest(path).id.replace(/^voyager\./, '');
      expect(
        listed,
        `Add ${JSON.stringify({ name, source: path, official: true })} to src/features/plugins/catalog/marketplace.json so the docs plugin store lists it.`,
      ).toContain(path);
    }
    expect(new Set(index.plugins.map((plugin) => plugin.name)).size).toBe(index.plugins.length);
    expect(
      [...listed].sort(),
      'marketplace entries must be unique and point to existing plugins',
    ).toEqual(pluginPaths);
  });
});
