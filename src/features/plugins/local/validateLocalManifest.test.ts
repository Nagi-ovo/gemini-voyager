import { describe, expect, it } from 'vitest';

import { validateHostCatalogFile } from '../remote/hostCatalogFile';
import { isLocalPluginId, toLocalPluginId } from './localPluginId';
import { validateLocalManifest } from './validateLocalManifest';

function authored(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'me.wide-chat',
    name: 'Wide chat',
    version: '1.0.0',
    description: 'Widen the Claude chat column',
    author: 'Me',
    category: 'layout',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: {
      styles: [{ css: '.gv-wide{max-width:none}' }],
      domOps: [{ op: 'addClass', target: 'body', className: 'gv-wide' }],
    },
    ...overrides,
  };
}

function paths(input: unknown): string[] {
  const result = validateLocalManifest(input);
  return result.success ? [] : result.error.map((issue) => issue.path);
}

describe('local plugin ids', () => {
  it('forces authored ids into the local.* namespace and keeps one already there', () => {
    expect(toLocalPluginId('me.wide-chat')).toBe('local.me.wide-chat');
    expect(toLocalPluginId('local.me.wide-chat')).toBe('local.me.wide-chat');
    expect(toLocalPluginId('voyager.formula-copy')).toBe('local.voyager.formula-copy');
    expect(isLocalPluginId('local.x')).toBe(true);
    expect(isLocalPluginId('voyager.x')).toBe(false);
  });

  it('rejects ids that are not lowercase reverse-dotted slugs', () => {
    for (const id of ['Me.Tweak', 'me tweak', '.me', 'me.', 'local.', `me.${'x'.repeat(100)}`]) {
      expect(toLocalPluginId(id)).toBeNull();
    }
  });
});

describe('validateLocalManifest', () => {
  it('accepts a declarative manifest and namespaces both the manifest and the stored raw', () => {
    const result = validateLocalManifest(authored());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.manifest.id).toBe('local.me.wide-chat');
    expect(result.data.raw.id).toBe('local.me.wide-chat');
    // An official id cannot be claimed: it is moved into local.* as well.
    const official = validateLocalManifest(authored({ id: 'voyager.formula-copy' }));
    expect(official.success && official.data.manifest.id).toBe('local.voyager.formula-copy');
  });

  it('rejects a scripted tier, since local plugins never carry code', () => {
    expect(paths(authored({ tier: 'scripted' }))).toContain('tier');
  });

  it('rejects an id it cannot namespace', () => {
    expect(paths(authored({ id: 'Bad Id' }))).toContain('id');
  });

  it('keeps matches inside the sites plugins already target', () => {
    expect(paths(authored({ matches: ['https://example.com/*'] }))).toEqual(['matches[0]']);
    expect(paths(authored({ matches: ['<all_urls>'] }))).toEqual(['matches[0]']);
    expect(paths(authored({ matches: ['https://*/*'] }))).toEqual(['matches[0]']);
    expect(paths(authored({ matches: ['https://chat.deepseek.com/a/*'] }))).toEqual([]);
  });

  it('lets local plugins target Gemini and AI Studio, which official plugins never do', () => {
    expect(paths(authored({ matches: ['https://gemini.google.com/*'] }))).toEqual([]);
    expect(paths(authored({ matches: ['https://business.gemini.google/*'] }))).toEqual([]);
    expect(paths(authored({ matches: ['https://aistudio.google.com/prompts/*'] }))).toEqual([]);
    expect(paths(authored({ matches: ['https://*.google.com/*'] }))).toEqual(['matches[0]']);
  });

  it('accepts the Gemini example from the plugin README', () => {
    const example = authored({
      id: 'me.gemini-compact-turns',
      category: 'readability',
      matches: ['https://gemini.google.com/*'],
      contributes: {
        styles: [{ css: '.gv-plugin-compact-turn{margin-block:4px!important}' }],
        domOps: [
          {
            op: 'addClass',
            target: { kind: 'semantic', key: 'userTurn' },
            className: 'gv-plugin-compact-turn',
          },
        ],
      },
    });
    expect(paths(example)).toEqual([]);
  });

  it('keeps Voyager’s own accent on Gemini: a theme there is rejected', () => {
    const theme = { brand: '#ff0000' };
    expect(paths(authored({ matches: ['https://gemini.google.com/*'], theme }))).toEqual(['theme']);
    expect(paths(authored({ theme }))).toEqual([]);
  });

  it('rejects native ops on Gemini and AI Studio, which already run every primitive natively', () => {
    const native = (matches: string[]) =>
      authored({
        engine: '>=1.4.0',
        matches,
        contributes: {
          styles: [{ css: '.gv-x{color:red}' }],
          domOps: [
            { op: 'addClass', target: 'body', className: 'gv-x' },
            { op: 'native', target: 'body', handler: 'turnNavigator', params: {} },
          ],
        },
      });
    expect(paths(native(['https://gemini.google.com/*']))).toEqual(['contributes.domOps[1]']);
    expect(paths(native(['https://aistudio.google.com/*']))).toEqual(['contributes.domOps[1]']);
    expect(paths(native(['https://claude.ai/*']))).toEqual([]);
  });

  it('allows a native op only for a shipped primitive with params that fit its contract', () => {
    const native = (handler: string, params: Record<string, unknown>, engine = '>=1.4.0') =>
      authored({
        engine,
        contributes: { domOps: [{ op: 'native', target: 'body', handler, params }] },
      });

    expect(paths(native('vimInput', {}))).toEqual([]);
    expect(paths(native('vimInput', { composer: '#prompt' }))).toEqual([]);
    expect(paths(native('runMyScript', {}))).toContain('requires.handlers');
    expect(paths(native('vimInput', { evil: 'x' }))).toEqual(['contributes.domOps[0].params.evil']);
    expect(paths(native('vimInput', { composer: 42 }))).toEqual([
      'contributes.domOps[0].params.composer',
    ]);
    expect(
      paths(
        native(
          'turnNavigator',
          { accountIdAttributes: ['data-user-id', 'data-workspace-id'] },
          '>=1.5.0',
        ),
      ),
    ).toEqual([]);
    expect(
      paths(native('turnNavigator', { accountIdAttributes: 'data-user-id' }, '>=1.5.0')),
    ).toEqual(['contributes.domOps[0].params.accountIdAttributes']);
    expect(
      paths(native('turnNavigator', { accountIdAttributes: ['data-user-id', 42] }, '>=1.5.0')),
    ).toEqual(['contributes.domOps[0].params.accountIdAttributes']);
    // engine must exclude builds that predate the primitive.
    expect(paths(native('vimInput', {}, '>=1.0.0'))).toEqual(['engine']);
  });
});

describe('validation parity with the remote catalog', () => {
  // Every entry here is rejected by the remote path; the local gate must
  // reject it too (it may reject more, never less).
  const rejectedRemotely: Record<string, Record<string, unknown>> = {
    'external url() in CSS': authored({
      contributes: { styles: [{ css: 'body{background:url(https://t.example/p.gif)}' }] },
    }),
    'a same-origin url() in CSS': authored({
      contributes: { styles: [{ css: "body{background:url('/probe')}" }] },
    }),
    '@import in CSS': authored({
      contributes: { styles: [{ css: '@import url("https://evil.example/x.css");' }] },
    }),
    'a setting default that renders an external url()': authored({
      contributes: {
        settings: { bg: { type: 'string', label: 'Background', default: 'url(https://t.x/p)' } },
        styles: [{ css: 'body{background:{{bg}}}' }],
      },
    }),
    'an unknown op': authored({
      contributes: { domOps: [{ op: 'eval', target: 'body', code: 'alert(1)' }] },
    }),
    'a missing version': authored({ version: undefined }),
  };

  for (const [name, manifest] of Object.entries(rejectedRemotely)) {
    it(`rejects ${name} both remotely and locally`, () => {
      const remote = validateHostCatalogFile(
        { format: 1, host: 'claude.ai', plugins: [manifest] },
        'claude.ai',
      );
      expect(remote?.manifests).toEqual([]);
      expect(remote?.issues.length).toBeGreaterThan(0);
      expect(validateLocalManifest(manifest).success).toBe(false);
    });
  }
});
