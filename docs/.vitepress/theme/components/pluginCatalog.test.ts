import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { CATALOG_DIR, readCatalog } from './pluginCatalog';
import {
  NATIVE_PLUGINS,
  displayName,
  groupPluginsByFeature,
  platformsFromMatches,
} from './pluginStore';

const marketplace = JSON.parse(readFileSync(resolve(CATALOG_DIR, 'marketplace.json'), 'utf8')) as {
  plugins: { source: string }[];
};

describe('readCatalog', () => {
  const catalog = readCatalog();

  it('reads every plugin listed in marketplace.json', () => {
    expect(catalog).toHaveLength(marketplace.plugins.length);
    for (const plugin of catalog) {
      expect(plugin.id).toMatch(/^voyager\./);
      expect(plugin.matches.length).toBeGreaterThan(0);
    }
  });

  it('keeps only the fields the store renders', () => {
    for (const plugin of catalog) {
      expect(Object.keys(plugin).sort()).toEqual(
        [
          'category',
          'description',
          'homepage',
          'i18n',
          'id',
          'matches',
          'name',
          'official',
          'theme',
          'version',
        ].filter((key) => key in plugin),
      );
    }
  });

  it('gives every catalog plugin a known platform', () => {
    for (const plugin of catalog) {
      expect(platformsFromMatches(plugin.matches), plugin.id).not.toHaveLength(0);
    }
  });

  it.each(['Formula Copy', 'Vim Input'])('folds every platform of %s into one card', (feature) => {
    const groups = groupPluginsByFeature([...NATIVE_PLUGINS, ...catalog]);
    const group = groups.find((g) => displayName(g[0].name) === feature);
    const keys = group?.flatMap((p) => platformsFromMatches(p.matches).map((pl) => pl.key));
    expect(keys).toEqual(expect.arrayContaining(['claude', 'chatgpt', 'deepseek']));
  });
});
