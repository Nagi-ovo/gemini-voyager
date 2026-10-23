import { describe, expect, it, vi } from 'vitest';

import { SHADOW_KEY_GUARD_PLUGIN_IDS } from '@/pages/background/shadowKeyGuardRegistration';

import type { PluginManifest } from '../types';
import { BundledCatalogPluginSource } from './BundledCatalogPluginSource';
import { FOLDERS_PLUGIN_IDS, isBuildOnlyPluginId, mergePluginRecords } from './defaultSources';

vi.mock('../catalog/sites', async (importOriginal) => {
  const original = await importOriginal<typeof import('../catalog/sites')>();
  const entry = (id: string, contributes: PluginManifest['contributes']) => ({
    siteDir: 'kimi',
    pluginDir: id,
    path: `sites/kimi/plugins/${id}/plugin.json`,
    styles: {},
    manifestJson: JSON.stringify({
      id,
      name: id,
      description: 'Kimi fixture',
      version: '1.0.0',
      author: 'test',
      category: 'productivity',
      license: 'MIT',
      engine: '>=1.0.0',
      tier: 'declarative',
      matches: ['https://www.kimi.com/*'],
      requires: { handlers: ['folders'] },
      contributes,
    }),
  });
  return {
    ...original,
    listBundledPluginEntries: () => [
      ...original.listBundledPluginEntries(),
      entry('voyager.kimi-folders', { domOps: [{ op: 'native', handler: 'folders', params: {} }] }),
      entry('voyager.kimi-requirement-only', {}),
      entry('voyager.kimi-other-primitive', {
        domOps: [{ op: 'native', handler: 'turnNavigator', params: {} }],
      }),
    ],
  };
});

async function kimiFolders(): Promise<PluginManifest> {
  const plugin = (await new BundledCatalogPluginSource().list()).find(
    (candidate) => candidate.id === 'voyager.kimi-folders',
  );
  if (!plugin) throw new Error('missing fixture');
  return plugin;
}

const record = (manifest: PluginManifest, sourceId: string) => ({ manifest, sourceId });

describe('folders on a newly bundled site', () => {
  it('protects a new folders caller without promoting plugins that merely require folders', () => {
    expect(FOLDERS_PLUGIN_IDS.has('voyager.kimi-folders')).toBe(true);
    expect(SHADOW_KEY_GUARD_PLUGIN_IDS.has('voyager.gemini-folders')).toBe(false);
    expect(SHADOW_KEY_GUARD_PLUGIN_IDS.has('voyager.kimi-folders')).toBe(true);
    for (const id of ['voyager.kimi-requirement-only', 'voyager.kimi-other-primitive']) {
      expect(isBuildOnlyPluginId(id), id).toBe(false);
      expect(SHADOW_KEY_GUARD_PLUGIN_IDS.has(id), id).toBe(false);
    }
  });

  it("drops a remote-only record that claims a new site's folders id", async () => {
    const remote = record(
      { ...(await kimiFolders()), matches: ['https://elsewhere.example/*'] },
      'host-catalog',
    );
    expect(
      mergePluginRecords({
        builtin: [],
        snapshot: [],
        remote: [remote],
        remoteAuthoritative: true,
      }),
    ).toEqual([]);
  });
});
