import './pluginManagerHarness';
import React from 'react';

import { describe, expect, it, vi } from 'vitest';

import { listBundledPluginEntries } from '@/features/plugins/catalog/sites';
import type { PluginManifest } from '@/features/plugins/types';

import { container, pluginState, renderManager } from './pluginManagerHarness';

vi.mock('@/features/plugins/catalog/sites', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/plugins/catalog/sites')>();
  const entries = actual.listBundledPluginEntries();
  const template = entries.find(
    (entry) => entry.siteDir === 'deepseek' && entry.pluginDir === 'timeline',
  );
  if (!template) throw new Error('Missing timeline fixture');
  const manifest = JSON.parse(template.manifestJson) as PluginManifest;
  return {
    ...actual,
    listBundledPluginEntries: () => [
      ...entries,
      {
        ...template,
        siteDir: 'kimi',
        pluginDir: 'timeline',
        manifestJson: JSON.stringify({
          ...manifest,
          id: 'voyager.kimi-timeline',
          name: 'Kimi · Timeline',
          matches: ['https://www.kimi.com/*'],
          requires: { handlers: ['turnNavigator'] },
          contributes: {
            ...manifest.contributes,
            settings: {
              ...manifest.contributes.settings,
              markerLevel: { type: 'boolean', label: 'Marker levels', default: true },
            },
            domOps: [{ op: 'native', handler: 'turnNavigator', params: {} }],
          },
        }),
      },
    ],
  };
});

const kimi = JSON.parse(
  listBundledPluginEntries().find(
    (entry) => entry.siteDir === 'kimi' && entry.pluginDir === 'timeline',
  )!.manifestJson,
) as PluginManifest;

async function renderRail(plugin: PluginManifest, source: string) {
  pluginState.current[plugin.id] = { enabled: true, installedAt: 0 };
  await renderManager({
    manifests: [plugin],
    sourceIds: { [plugin.id]: source },
    activeUrl: 'https://www.kimi.com/a/current',
    timelineRail: {
      pluginId: plugin.id,
      settingKeys: ['timelineStyle', 'markerLevel'],
      render: (keys) => (
        <div data-testid="dedicated-rail" data-owned={keys.join(',')}>
          <select aria-label="Dedicated style" />
        </div>
      ),
    },
  });
}

describe('PluginManager derived timeline controls', () => {
  it.each(['bundled-catalog', 'host-catalog'])(
    'does not duplicate timeline controls for a bundled new site from %s',
    async (source) => {
      await renderRail(kimi, source);
      expect(container.querySelectorAll('select')).toHaveLength(1);
      expect(
        container.querySelector('[data-testid="dedicated-rail"]')?.getAttribute('data-owned'),
      ).toBe('timelineStyle,markerLevel');
    },
  );
});
