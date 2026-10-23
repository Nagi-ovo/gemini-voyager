import { type Mock, afterEach, describe, expect, it } from 'vitest';

import { requireBundledSiteAdapter } from '../../catalog/sites';
import { PluginHost } from '../../runtime/PluginHost';
import type { PluginManifest, PluginSource } from '../../types';

const URL = 'https://chat.deepseek.com/a/chat/s/1';
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

const source = (manifests: readonly PluginManifest[]): PluginSource => ({
  id: 'host-catalog',
  kind: 'remote',
  list: async () => manifests,
  isAuthoritative: async () => true,
  siteOverride: async () => deepseek,
});

async function flush(): Promise<void> {
  for (let i = 0; i < 4; i += 1) await new Promise((resolve) => setTimeout(resolve, 0));
}

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
});
