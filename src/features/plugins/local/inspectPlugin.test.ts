import { describe, expect, it } from 'vitest';

import { inspectPlugin } from './inspectPlugin';
import { validateLocalManifest } from './validateLocalManifest';

describe('inspectPlugin', () => {
  it('lists sites, CSS size, page changes, primitives and settings', () => {
    const result = validateLocalManifest({
      id: 'me.vim',
      name: 'Vim',
      version: '1.2.0',
      description: 'd',
      author: 'Me',
      category: 'input',
      license: 'MIT',
      engine: '>=1.4.0',
      tier: 'declarative',
      matches: ['https://claude.ai/*'],
      contributes: {
        settings: { wide: { type: 'boolean', label: 'Wide', default: true } },
        styles: [{ css: '.gv-a{color:red}' }, { css: '.gv-b{}' }],
        domOps: [
          { op: 'addClass', target: 'body', className: 'gv-vim' },
          { op: 'native', target: 'body', handler: 'vimInput', params: { composer: '#p' } },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const inspection = inspectPlugin(result.data.manifest);
    expect(inspection.id).toBe('local.me.vim');
    expect(inspection.sites).toEqual([
      { pattern: 'https://claude.ai/*', site: expect.any(String) },
    ]);
    expect(inspection.styleSheets).toBe(2);
    expect(inspection.cssChars).toBe('.gv-a{color:red}'.length + '.gv-b{}'.length);
    expect(inspection.domOps).toEqual(['addClass gv-vim → body']);
    expect(inspection.primitives).toEqual([{ handler: 'vimInput', params: '{"composer":"#p"}' }]);
    expect(inspection.settings).toEqual([
      { key: 'wide', type: 'boolean', label: 'Wide', defaultValue: 'true' },
    ]);
  });

  it('shows inline style values in full and clips only the target', () => {
    const pad = '0 '.repeat(150).trim();
    const selector = `.x${'-y'.repeat(120)}`;
    const result = validateLocalManifest({
      id: 'me.pad',
      name: 'Pad',
      version: '1.0.0',
      description: 'd',
      author: 'Me',
      category: 'layout',
      license: 'MIT',
      engine: '>=1.0.0',
      tier: 'declarative',
      matches: ['https://claude.ai/*'],
      contributes: {
        domOps: [
          {
            op: 'setAttribute',
            target: 'main',
            name: 'style',
            value: `--gv-plugin-pad:${pad};display:none`,
          },
          { op: 'setStyle', target: 'main', styles: { '--gv-plugin-pad': pad, display: 'none' } },
          { op: 'setStyle', target: selector, styles: { color: 'red' } },
        ],
      },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const [attribute, style, longTarget] = inspectPlugin(result.data.manifest).domOps;
    expect(attribute).toBe(`setAttribute style="--gv-plugin-pad:${pad};display:none" → main`);
    expect(style).toBe(`setStyle --gv-plugin-pad: ${pad}; display: none → main`);
    expect(longTarget.startsWith('setStyle color: red → .x-y')).toBe(true);
    expect(longTarget.endsWith('…')).toBe(true);
    expect(longTarget.length).toBeLessThan(selector.length);
  });
});
