import { describe, expect, it } from 'vitest';

import { validateManifest, validateStyleCss } from './validate';

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
            style: { options: { dots: '节点', compact: 42, ruler: '', huge: 'x'.repeat(501) } },
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
        settings: {
          width: { label: '阅读宽度', minLabel: '更窄', maxLabel: '更宽' },
          style: { options: { dots: '节点' } },
        },
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

  it('drops first-party-only setting rules from catalog data', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        ...valid.contributes,
        settings: {
          locked: {
            type: 'boolean',
            label: 'Locked',
            default: false,
            requiresChoice: { setting: 'mode', value: 'a' },
          },
        },
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.contributes.settings?.locked).not.toHaveProperty('requiresChoice');
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

  describe('select settings', () => {
    const withSelect = (field: Record<string, unknown>) =>
      validateManifest({
        ...valid,
        contributes: {
          ...valid.contributes,
          settings: { style: { type: 'select', label: 'Style', ...field } },
        },
      });
    const choices = [
      { value: 'dots', label: 'Dots' },
      { value: 'ruler', label: 'Ruler' },
    ];
    const issuePaths = (result: ReturnType<typeof validateManifest>) =>
      result.success ? [] : result.error.map((issue) => issue.path);

    it('a select default outside its choices is rejected', () => {
      expect(issuePaths(withSelect({ default: 'unknown', options: choices }))).toContain(
        'contributes.settings.style.default',
      );
    });

    it('a select without choices is rejected', () => {
      expect(issuePaths(withSelect({ default: 'dots' }))).toContain(
        'contributes.settings.style.options',
      );
      expect(issuePaths(withSelect({ default: 'dots', options: [] }))).toContain(
        'contributes.settings.style.options',
      );
    });

    it('a select offering the same choice twice is rejected', () => {
      const result = withSelect({ default: 'dots', options: [...choices, choices[0]] });
      expect(issuePaths(result)).toContain('contributes.settings.style.options[2].value');
    });

    it('a select with a malformed choice is rejected', () => {
      const result = withSelect({ default: 'dots', options: [...choices, { value: 3 }] });
      expect(issuePaths(result)).toContain('contributes.settings.style.options[2]');
    });

    it('keeps a select whose default is one of its choices', () => {
      const result = withSelect({ default: 'ruler', options: choices });
      expect(result.success && result.data.contributes.settings?.style).toEqual({
        type: 'select',
        label: 'Style',
        default: 'ruler',
        options: choices,
      });
    });
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

  it('rejects external url() values in setStyle operations', () => {
    for (const value of [
      'url(https://evil.example/x.png)',
      "url('http://evil.example/x.png')",
      'linear-gradient(red, blue), url(//evil.example/x.png)',
    ]) {
      const result = validateManifest({
        ...valid,
        contributes: {
          domOps: [{ op: 'setStyle', target: 'body', styles: { background: value } }],
        },
      });
      expect(result.success).toBe(false);
      if (result.success) continue;
      expect(result.error.some((e) => e.path === 'contributes.domOps[0].styles.background')).toBe(
        true,
      );
    }
  });

  it('rejects setAttribute names outside the allowlist', () => {
    for (const name of [
      'href',
      'SRC',
      'srcdoc',
      'formAction',
      'xlink:href',
      'data',
      'class',
      'id',
      'target',
      'Style',
      ' data-gv-x',
    ]) {
      const result = validateManifest({
        ...valid,
        contributes: {
          domOps: [{ op: 'setAttribute', target: 'a', name, value: '#local' }],
        },
      });
      expect(result.success, name).toBe(false);
      if (result.success) continue;
      expect(result.error.some((e) => e.path === 'contributes.domOps[0].name')).toBe(true);
    }
  });

  it('allows inert style URLs and allowlisted attributes', () => {
    const result = validateManifest({
      ...valid,
      contributes: {
        domOps: [
          {
            op: 'setStyle',
            target: 'body',
            styles: { background: 'url(data:image/png;base64,AAAA)', filter: 'url(#gv-blur)' },
          },
          { op: 'setAttribute', target: 'a', name: 'data-gv-section', value: 'local' },
          { op: 'setAttribute', target: 'a', name: 'aria-label', value: 'Section' },
          { op: 'setAttribute', target: 'a', name: 'title', value: 'Section' },
          { op: 'setAttribute', target: 'a', name: 'style', value: '--gv-gap: 4px' },
        ],
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

describe('validateManifest remote-resource checks on rendered values', () => {
  const withSetting = (defaultValue: string, contributes: Record<string, unknown>) => ({
    ...valid,
    contributes: {
      settings: { bg: { type: 'string', label: 'Background', default: defaultValue } },
      ...contributes,
    },
  });

  it('rejects a setting default that renders an external url() into CSS', () => {
    const result = validateManifest(
      withSetting('url(https://tracker.example/p.png)', {
        styles: [{ css: 'body{background:{{bg}}}' }],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.some((e) => e.path === 'contributes.styles[0].css')).toBe(true);
  });

  it('rejects a setting default that renders @import into CSS', () => {
    const result = validateManifest(
      withSetting('@import "https://evil.example/x.css";', { styles: [{ css: '{{bg}}' }] }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a setting default that renders an external url() into setStyle', () => {
    const result = validateManifest(
      withSetting('url(//tracker.example/p.png)', {
        domOps: [{ op: 'setStyle', target: 'body', styles: { background: '{{bg}}' } }],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.some((e) => e.path === 'contributes.domOps[0].styles.background')).toBe(
      true,
    );
  });

  it('rejects a setting default that renders an external URL string into a style attribute', () => {
    const result = validateManifest(
      withSetting('--u:"https://tracker.example/p.png"', {
        domOps: [{ op: 'setAttribute', target: 'body', name: 'style', value: '{{bg}}' }],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.some((e) => e.path === 'contributes.domOps[0].value')).toBe(true);
  });

  it('reports a rendered-default issue at the raw domOps index', () => {
    const result = validateManifest(
      withSetting('url(https://tracker.example/p.png)', {
        domOps: [
          { op: 'bogus', target: 'body' },
          { op: 'setStyle', target: 'body', styles: { background: '{{bg}}' } },
        ],
      }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.some((e) => e.path === 'contributes.domOps[1].styles.background')).toBe(
      true,
    );
  });

  it('keeps accepting self-contained setting defaults', () => {
    const result = validateManifest(
      withSetting('#fafafa', {
        styles: [{ css: 'body{background:{{bg}}}' }],
        domOps: [{ op: 'setStyle', target: 'body', styles: { '--gv-bg': '{{bg}}' } }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it('sees through CSS escapes and comments', () => {
    for (const css of [
      'body{background:\\75 rl(https://t.example/p.gif)}',
      'body{background:u\\rl(https://t.example/p.gif)}',
      '@\\69mport "https://evil.example/x.css";',
      'body{background:url(/**/https://t.example/p.gif)}',
      // An escaped backslash must not swallow the next escape.
      'body{background:url("\\\\\\\\evil.example/p.gif")}',
      // `/*` is plain text inside url(): the URL is //*@evil.example/…
      'body{background:url(//*@evil.example/*/p.gif)}',
      // The URL parser drops tabs and resolves http:host against an https page.
      'body{background:url("ht\\9 tps://t.example/p.gif")}',
      'body{background:url(http:t.example/p.gif)}',
    ]) {
      const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
      expect(result.success, css).toBe(false);
    }
  });

  it('rejects external strings inside image-set()', () => {
    for (const css of [
      'body{background-image:image-set("https://t.example/a.png" 1x)}',
      "body{background-image:-webkit-image-set('//t.example/a.png' 1x)}",
      'body{background-image:image-set(url(data:x) 1x, "https://t.example/a.png" 2x)}',
    ]) {
      const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
      expect(result.success, css).toBe(false);
    }
  });

  it('rejects SVG and every other non-raster data: URL, in any encoding', () => {
    // A filter resource document in Firefox may load <feImage href>, and base64 hides the URL.
    for (const url of [
      'data:image/svg+xml;base64,PHN2Zy8+#f',
      'data:image/svg+xml,%3Csvg/%3E',
      "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'/>",
      'DATA:IMAGE/SVG+XML;charset=utf-8,<svg/>',
      'data: image/svg+xml ;base64,PHN2Zy8+',
      'data:image%2Fsvg+xml,<svg/>',
      'data:text/html,<p>',
      'data:text/css,a{}',
      'data:,hello',
      'data:;base64,AAAA',
      'data:image/png',
    ]) {
      for (const css of [
        `a{filter:url("${url}")}`,
        `a{background:url(${url.replace(/[ '<>]/g, '')})}`,
      ]) {
        const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
        expect(result.success, css).toBe(false);
      }
    }
  });

  it('accepts raster data: URLs', () => {
    for (const type of ['png', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'x-icon', 'PNG']) {
      const css = `a{background:url("data:image/${type};base64,AAAA")}`;
      const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
      expect(result.success, css).toBe(true);
    }
  });

  it('rejects any string that starts with an external URL, wherever it sits', () => {
    for (const css of [
      // The URL string comes first and reaches image-set() through var().
      ':root{--u:"https://t.example/a.png"} body{background-image:image-set(var(--u) 1x)}',
      'body{--w:"//t.example/a.png"}',
      'body{content:"\\68 ttps://t.example/a.png"}',
      '@property --u{syntax:"*";inherits:false;initial-value:" https://t.example/a.png"}',
      // An escaped quote does not end the first string.
      'a{--x:"\\""} b{--u:"https://t.example/a.png"}',
      // A hex escape swallows one newline, so the first string is still open.
      'a{--x:"\\41\n"} b{--u:"https://t.example/a.png"}',
      // A quote inside an unquoted url( is read differently by the browser: fail closed.
      "a{background:url(x'y)} b{background-image:image-set('https://t.example/a.png' 1x)} '",
    ]) {
      const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
      expect(result.success, css).toBe(false);
    }
  });

  it('rejects every same-origin, relative or other fetching URL, not only external ones', () => {
    for (const css of [
      "body{background:url('/probe')}",
      'body{background:url(probe.png)}',
      'body{background:url( "../p.gif" )}',
      'body{background:url(\\2f probe)}',
      'body{cursor:URL(a.cur), auto}',
      'a{mask:url(chrome-extension://abc/x.svg)}',
      'a{filter:url(icons.svg#blur)}',
      '@font-face{font-family:x;src:url(f.woff2)}',
      'body{background-image:image-set("a.png" 1x, "/b.png" 2x)}',
      'body{background-image:-webkit-image-set(url(data:x) 1x)}',
      'body{background-image:im\\61ge-set("a.png" 1x)}',
      'body{background-image:image("a.png")}',
      'body{background-image:cross-fade(url(data:x), "b.png" 50%)}',
      'body{background-image:src("a.png")}',
      '@import "x.css";',
      'body{background:url(a.png)}/* "https://t.example" */',
    ]) {
      const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
      expect(result.success, css).toBe(false);
    }
    for (const value of ["url('/probe')", 'image-set("a.png" 1x)', 'url(x.png) no-repeat']) {
      const result = validateManifest({
        ...valid,
        contributes: {
          domOps: [{ op: 'setStyle', target: 'body', styles: { background: value } }],
        },
      });
      expect(result.success, value).toBe(false);
    }
    const viaStyleAttribute = validateManifest({
      ...valid,
      contributes: {
        domOps: [{ op: 'setAttribute', target: 'a', name: 'style', value: 'background:url(/p)' }],
      },
    });
    expect(viaStyleAttribute.success).toBe(false);
  });

  it('keeps accepting inert URLs and plain strings', () => {
    for (const css of [
      'body{font-family:"Inter", sans-serif}',
      "body::after{content:'http'}",
      "body::after{content:'/probe.png'}",
      'body{background:url(data:image/png;base64,AAAA)}',
      'body{background:url( "data:image/webp;base64,AAAA" )}',
      'svg{filter:url(#gv-blur)}',
      'a{background:url()}',
      '.gv-x-url-image-set{color:red}',
      'a{background-image:linear-gradient(red, blue)}',
    ]) {
      const result = validateManifest({ ...valid, contributes: { styles: [{ css }] } });
      expect(result.success, css).toBe(true);
    }
  });

  it('rejects a setStyle custom property holding an external URL string', () => {
    // A plugin sheet could read it with -webkit-image-set(var(--w) 1x).
    const result = validateManifest({
      ...valid,
      contributes: {
        styles: [{ css: 'body{background-image:-webkit-image-set(var(--w) 1x)}' }],
        domOps: [
          { op: 'setStyle', target: 'body', styles: { '--w': '"https://t.example/a.png"' } },
        ],
      },
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.some((e) => e.path === 'contributes.domOps[0].styles.--w')).toBe(true);
  });

  it('rejects external URLs in style and allowlisted attribute values', () => {
    for (const [name, value] of [
      ['style', 'background:url(https://tracker.example/p.png)'],
      ['style', '--u:"https://tracker.example/p.png"'],
      ['data-src', 'https://tracker.example/p.png'],
      ['aria-label', '\\\\tracker.example/p'],
    ]) {
      const result = validateManifest({
        ...valid,
        contributes: { domOps: [{ op: 'setAttribute', target: 'img', name, value }] },
      });
      expect(result.success, `${name}=${value}`).toBe(false);
      if (result.success) continue;
      expect(result.error.some((e) => e.path === 'contributes.domOps[0].value')).toBe(true);
    }
  });

  it('checks pathological stylesheets in linear time', () => {
    // Just under MAX_STYLE_LENGTH, so the length check does not short-circuit.
    const size = 199_000;
    for (const css of [
      '/*a'.repeat(size / 3),
      'image-set('.repeat(size / 10),
      `url(${' '.repeat(size)}`,
      '\\"'.repeat(size / 2),
      `"${'\t'.repeat(size)}`,
      'h\tt'.repeat(size / 3),
    ]) {
      const started = performance.now();
      const issues = validateStyleCss(css, 'css');
      // Linear takes milliseconds and quadratic takes tens of seconds at this size; the wide bound
      // keeps the check meaningful while parallel suites load the machine.
      expect(performance.now() - started, css.slice(0, 12)).toBeLessThan(2000);
      expect(issues.some((issue) => issue.message.startsWith('exceeds'))).toBe(false);
    }
  });
});
