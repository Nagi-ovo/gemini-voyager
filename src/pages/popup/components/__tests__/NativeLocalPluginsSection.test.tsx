import React, { act } from 'react';
import { type Root, createRoot } from 'react-dom/client';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PluginManifest } from '@/features/plugins/types';

import { NativeLocalPluginsSection } from '../NativeLocalPluginsSection';

vi.mock('../PluginManager', () => ({
  PluginManager: ({ manifests }: { manifests: readonly PluginManifest[] }) => (
    <div data-testid="plugin-manager">{manifests.map((plugin) => plugin.id).join(',')}</div>
  ),
}));
vi.mock('../LocalPluginsPanel', () => ({
  LocalPluginsPanel: () => <div data-testid="local-plugins-panel" />,
}));

const t = (key: string) => key;

function plugin(id: string): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://gemini.google.com/*'],
    contributes: {},
  };
}

describe('NativeLocalPluginsSection', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const render = async (manifests: readonly PluginManifest[]) =>
    act(async () =>
      root.render(
        <NativeLocalPluginsSection
          plugins={{ manifests, activeUrl: 'https://gemini.google.com/app' }}
          t={t}
        />,
      ),
    );

  it('stays one collapsed entry on Gemini until opened, then shows the import card', async () => {
    await render([]);
    expect(container.textContent).toContain('localPluginsTitle');
    expect(container.querySelector('[data-testid="local-plugins-panel"]')).toBeNull();

    await act(async () => (container.querySelector('button') as HTMLButtonElement).click());
    expect(container.querySelector('[data-testid="local-plugins-panel"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="plugin-manager"]')).toBeNull();
  });

  it('opens with toggles for the local plugins that target this page, and only those', async () => {
    await render([plugin('local.me.tweak'), plugin('voyager.not-local')]);
    expect(container.querySelector('[data-testid="plugin-manager"]')?.textContent).toBe(
      'local.me.tweak',
    );
    expect(container.querySelector('[data-testid="local-plugins-panel"]')).not.toBeNull();
  });
});
