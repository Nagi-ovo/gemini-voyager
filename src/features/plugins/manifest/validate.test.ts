import { describe, expect, it } from 'vitest';

import { validateManifest } from './validate';

const valid = {
  id: 'voyager.test',
  name: 'Test',
  version: '1.0.0',
  description: 'A test plugin',
  author: 'Me',
  category: 'render-fix',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches: ['https://claude.ai/*'],
  contributes: {
    styles: [{ css: 'body{color:red}' }],
    domOps: [{ op: 'addClass', target: 'body', className: 'gv-plugin-x' }],
  },
};

describe('validateManifest', () => {
  it('accepts a valid manifest and normalizes string selector to css ref', () => {
    const result = validateManifest(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const op = result.data.contributes.domOps?.[0];
    expect(op).toEqual({
      op: 'addClass',
      target: { kind: 'css', selector: 'body' },
      className: 'gv-plugin-x',
    });
  });

  it('rejects a non-object', () => {
    expect(validateManifest(null).success).toBe(false);
    expect(validateManifest('x').success).toBe(false);
  });

  it('collects issues for missing required fields', () => {
    const result = validateManifest({ ...valid, id: '', tier: 'nope', matches: [] });
    expect(result.success).toBe(false);
    if (result.success) return;
    const paths = result.error.map((e) => e.path);
    expect(paths).toContain('id');
    expect(paths).toContain('tier');
    expect(paths).toContain('matches');
  });

  it('requires a non-empty category', () => {
    const result = validateManifest({ ...valid, category: '' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.map((e) => e.path)).toContain('category');
  });

  it('carries through a sanitized i18n map, dropping invalid entries', () => {
    const result = validateManifest({
      ...valid,
      i18n: {
        zh: {
          name: 'Claude · 测试',
          description: '中文描述',
          settings: {
            width: { label: '阅读宽度', minLabel: '更窄', maxLabel: '更宽' },
            ignored: { label: 42 },
          },
        },
        ja: { name: 123, description: '日本語' }, // bad name dropped, description kept
        ko: { name: 'x'.repeat(600) }, // over-length → entry empty → locale dropped
        es: { settings: { width: { minLabel: 'Más estrecho' } } },
        fr: 'not-an-object', // dropped
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.i18n).toEqual({
      zh: {
        name: 'Claude · 测试',
        description: '中文描述',
        settings: { width: { label: '阅读宽度', minLabel: '更窄', maxLabel: '更宽' } },
      },
      ja: { description: '日本語' },
      es: { settings: { width: { minLabel: 'Más estrecho' } } },
    });
  });

  it('omits i18n when absent or when no entry survives sanitization', () => {
    const absent = validateManifest(valid);
    expect(absent.success && absent.data.i18n).toBeUndefined();
    const empty = validateManifest({ ...valid, i18n: { zh: { name: 42 } } });
    expect(empty.success && empty.data.i18n).toBeUndefined();
  });

  it('rejects unknown dom op kinds', () => {
    const result = validateManifest({
      ...valid,
      contributes: { domOps: [{ op: 'evilEval', target: 'body' }] },
    });
    expect(result.success).toBe(false);
  });

  it('normalizes a semantic selector ref', () => {
    const result = validateManifest({
      ...valid,
      contributes: { domOps: [{ op: 'hide', target: { kind: 'semantic', key: 'userTurn' } }] },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contributes.domOps?.[0]).toEqual({
      op: 'hide',
      target: { kind: 'semantic', key: 'userTurn' },
    });
  });

  it('validates setStyle requires string values', () => {
    const bad = validateManifest({
      ...valid,
      contributes: { domOps: [{ op: 'setStyle', target: 'body', styles: { color: 1 } }] },
    });
    expect(bad.success).toBe(false);
  });

  it('passes through a valid settings schema', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        ...valid.contributes,
        settings: {
          width: {
            type: 'number',
            label: 'Width',
            minLabel: 'Narrower',
            maxLabel: 'Wider',
            default: 70,
            min: 40,
            max: 120,
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contributes.settings?.width.default).toBe(70);
    expect(result.data.contributes.settings?.width.minLabel).toBe('Narrower');
    expect(result.data.contributes.settings?.width.maxLabel).toBe('Wider');
    expect(result.data.contributes.settings?.width.max).toBe(120);
  });

  it('rejects invalid setting endpoint labels', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        ...valid.contributes,
        settings: { width: { type: 'number', label: 'Width', default: 70, minLabel: '' } },
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.map((e) => e.path)).toContain('contributes.settings.width.minLabel');
  });

  it('rejects a setting with an invalid type', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        ...valid.contributes,
        settings: { x: { type: 'nope', label: 'X', default: 1 } },
      },
    });
    expect(result.success).toBe(false);
  });

  it('rejects CSS that uses @import', () => {
    const result = validateManifest({
      ...valid,
      contributes: { styles: [{ css: '@import url("https://evil.example/x.css");' }] },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.some((e) => e.path === 'contributes.styles[0].css')).toBe(true);
  });

  it('rejects CSS with an external url() (http/https/protocol-relative)', () => {
    for (const css of [
      'body{background:url(https://t.example/p.gif)}',
      "body{background:url('http://t.example/p.gif')}",
      'body{background:url(//t.example/p.gif)}',
    ]) {
      const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
      expect(result.success).toBe(false);
    }
  });

  it('allows self-contained CSS (data: URIs, relative refs)', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        styles: [{ css: 'body{background:url(data:image/png;base64,AAAA)}.x{color:red}' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects setAttribute on event-handler attributes (on*)', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        domOps: [{ op: 'setAttribute', target: 'body', name: 'onclick', value: 'alert(1)' }],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.some((e) => e.path === 'contributes.domOps[0].name')).toBe(true);
  });

  it('still allows normal setAttribute', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        domOps: [{ op: 'setAttribute', target: 'a', name: 'target', value: '_blank' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an optional theme with a hex brand colour', () => {
    const result = validateManifest({ ...valid, theme: { brand: '#d97757' } });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.theme?.brand).toBe('#d97757');
  });

  it('omits theme when not provided', () => {
    const result = validateManifest(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.theme).toBeUndefined();
  });

  it('rejects a theme whose brand is not a hex colour', () => {
    for (const brand of ['red', 'rgb(1,2,3)', 'd97757', '', '#ggg', 'url(x)']) {
      const result = validateManifest({ ...valid, theme: { brand } });
      expect(result.success).toBe(false);
      if (result.success) continue;
      expect(result.error.some((e) => e.path === 'theme.brand')).toBe(true);
    }
  });
});
