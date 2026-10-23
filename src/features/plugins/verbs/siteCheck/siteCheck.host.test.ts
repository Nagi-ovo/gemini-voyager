import { type Mock, afterEach, describe, expect, it, vi } from 'vitest';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import { PluginHost } from '../../runtime/PluginHost';
import type { PluginManifest, PluginSource } from '../../types';

vi.mock('@/features/formulaCopy', () => ({
  activateFormulaCopy: vi.fn((scope: { effect(setup: () => () => void, label: string): void }) => {
    scope.effect(() => () => {}, 'formula-copy');
  }),
}));

const URL = 'https://chat.deepseek.com/a/chat/s/1';
const CATALOG_KEY = 'gvPluginHostCatalog:chat.deepseek.com';
const deepseek = requireBundledSiteAdapter('deepseek');

function manifest(id: string, domOps: PluginManifest['contributes']['domOps']): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=next',
    tier: 'declarative',
    matches: ['https://chat.deepseek.com/*'],
    contributes: { domOps },
  };
}

const source = (
  manifests: readonly PluginManifest[] | { current: readonly PluginManifest[] },
): PluginSource => ({
  id: 'host-catalog',
  kind: 'remote',
  list: async () => ('current' in manifests ? manifests.current : manifests),
  isAuthoritative: async () => true,
  siteOverride: async () => deepseek,
});

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

function fireCatalogChange(): void {
  const listeners = (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls;
  const entry = { status: 'ok', extensionVersion: 'x' };
  for (const [listener] of listeners) {
    listener(
      {
        [CATALOG_KEY]: {
          oldValue: { ...entry, manifests: [] },
          newValue: { ...entry, manifests: [{ id: 'changed' }] },
        },
      },
      'local',
    );
  }
}

const previewText = (): string => {
  document.querySelector('.gv-site-check-launcher')?.shadowRoot?.querySelector('button')!.click();
  return document.querySelector('.gv-site-check-panel')!.shadowRoot!.querySelector('details pre')!
    .textContent!;
};

afterEach(() => {
  document.body.innerHTML = '';
});

describe('site check under the plugin host', () => {
  it('lists what the other running plugins rely on, read from the host at the moment of the check', async () => {
    document.body.innerHTML =
      '<div class="legacy-banner"></div><textarea class="ds-scroll-area"></textarea>';
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginsState: {
        'voyager.deepseek-site-check': { enabled: true, installedAt: 1 },
        'test.banner': { enabled: true, installedAt: 1 },
      },
    });
    const host = new PluginHost({
      url: URL,
      sources: [
        source([
          manifest('voyager.deepseek-site-check', [
            { op: 'native', handler: 'siteCheck', params: {} },
          ]),
          manifest('test.banner', [
            { op: 'hide', target: { kind: 'css', selector: '.legacy-banner' } },
          ]),
          manifest('test.off', [
            { op: 'hide', target: { kind: 'css', selector: '.never-listed' } },
          ]),
        ]),
      ],
      doc: document,
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
    try {
      await host.start();
      await flush();
      const launcher = document
        .querySelector('.gv-site-check-launcher')
        ?.shadowRoot?.querySelector('button');
      launcher!.click();
      const panel = document.querySelector('.gv-site-check-panel')!.shadowRoot!;
      const preview = panel.querySelector('details pre')!.textContent!;
      expect(preview).toContain('| test.banner | domOps[0] hide | 1 |');
      expect(preview).not.toContain('.never-listed');
      expect(preview).toContain('| test.off | 1.0.0 | ready |');
      expect(preview).toContain('| voyager.deepseek-site-check | 1.0.0 | mounted |');
    } finally {
      host.stop();
    }
    await flush();
    expect(document.querySelector('.gv-site-check-launcher')).toBeNull();
  });

  it('checks a plugin frozen on its mounted version against that version’s selectors, not the pending update’s', async () => {
    document.body.innerHTML = '<div class="old-banner"></div><div class="new-banner"></div>';
    (chrome.storage.local.get as unknown as Mock).mockResolvedValue({
      gvPluginsState: {
        'voyager.deepseek-site-check': { enabled: true, installedAt: 1 },
        'test.formula': { enabled: true, installedAt: 1 },
      },
    });
    const formula = (version: string, banner: string): PluginManifest => ({
      ...manifest('test.formula', [
        { op: 'native', handler: 'formulaCopy', params: {} },
        { op: 'hide', target: { kind: 'css', selector: banner } },
      ]),
      version,
    });
    const siteCheck = manifest('voyager.deepseek-site-check', [
      { op: 'native', handler: 'siteCheck', params: {} },
    ]);
    const listed = { current: [siteCheck, formula('1.0.0', '.old-banner')] };
    const host = new PluginHost({
      url: URL,
      sources: [source(listed)],
      doc: document,
      requestCatalogRefresh: () => {},
      isTopFrame: true,
    });
    try {
      await host.start();
      await flush();
      // A primitive-backed plugin keeps 1.0.0 running until the next page load (plan D7).
      listed.current = [siteCheck, formula('1.1.0', '.new-banner')];
      fireCatalogChange();
      await flush();
      expect(host.getStatuses().find((status) => status.id === 'test.formula')).toEqual(
        expect.objectContaining({ version: '1.0.0', pendingVersion: '1.1.0' }),
      );
      const preview = previewText();
      expect(preview).toContain('.old-banner');
      expect(preview).not.toContain('.new-banner');
    } finally {
      host.stop();
    }
  });
});
