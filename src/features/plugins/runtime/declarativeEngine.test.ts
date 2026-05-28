import { afterEach, describe, expect, it } from 'vitest';

import { PLUGIN_BASE_STYLE_ID, PLUGIN_HIDDEN_CLASS } from '../constants';
import { type PluginManifest, type SiteAdapter, cssRef, semanticRef } from '../types';
import { DeclarativeEngine } from './declarativeEngine';

function makeManifest(
  contributes: PluginManifest['contributes'],
  id = 'test.plugin',
): PluginManifest {
  return {
    id,
    name: 'Test',
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['*://*/*'],
    contributes,
  };
}

const adapter: SiteAdapter = {
  id: 'claude',
  label: 'Claude',
  matches: ['https://claude.ai/*'],
  selectors: { userTurn: '.user-msg' },
  theme: { hostSelector: ':root', lightSelector: ':root', darkSelector: ':root.dark' },
  capabilities: new Set(['chat']),
};

afterEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('DeclarativeEngine', () => {
  it('injects styles on mount and removes them on unmount', () => {
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(makeManifest({ styles: [{ css: '.x{color:red}' }] }));

    const styleEl = document.getElementById('gv-plugin-style-test.plugin');
    expect(styleEl?.textContent).toContain('.x{color:red}');

    engine.unmount('test.plugin');
    expect(document.getElementById('gv-plugin-style-test.plugin')).toBeNull();
  });

  it('addClass is reversible', () => {
    document.body.innerHTML = '<div class="target"></div>';
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(
      makeManifest({
        domOps: [{ op: 'addClass', target: cssRef('.target'), className: 'gv-plugin-on' }],
      }),
    );

    expect(document.querySelector('.target')?.classList.contains('gv-plugin-on')).toBe(true);
    engine.unmount('test.plugin');
    expect(document.querySelector('.target')?.classList.contains('gv-plugin-on')).toBe(false);
  });

  it('hide adds the base hidden class + stylesheet, and reverts on unmount', () => {
    document.body.innerHTML = '<div class="ad"></div>';
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(makeManifest({ domOps: [{ op: 'hide', target: cssRef('.ad') }] }));

    expect(document.getElementById(PLUGIN_BASE_STYLE_ID)).not.toBeNull();
    expect(document.querySelector('.ad')?.classList.contains(PLUGIN_HIDDEN_CLASS)).toBe(true);

    engine.unmount('test.plugin');
    expect(document.querySelector('.ad')?.classList.contains(PLUGIN_HIDDEN_CLASS)).toBe(false);
  });

  it('setAttribute restores the original (removing when previously absent)', () => {
    document.body.innerHTML = '<a class="lnk" href="#a">x</a><a class="lnk2">y</a>';
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(
      makeManifest({
        domOps: [
          { op: 'setAttribute', target: cssRef('.lnk'), name: 'href', value: '#changed' },
          { op: 'setAttribute', target: cssRef('.lnk2'), name: 'target', value: '_blank' },
        ],
      }),
    );

    expect(document.querySelector('.lnk')?.getAttribute('href')).toBe('#changed');
    expect(document.querySelector('.lnk2')?.getAttribute('target')).toBe('_blank');

    engine.unmount('test.plugin');
    expect(document.querySelector('.lnk')?.getAttribute('href')).toBe('#a');
    expect(document.querySelector('.lnk2')?.hasAttribute('target')).toBe(false);
  });

  it('setStyle restores the original inline value', () => {
    document.body.innerHTML = '<div class="box" style="color: blue;"></div>';
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(
      makeManifest({
        domOps: [
          { op: 'setStyle', target: cssRef('.box'), styles: { color: 'red', 'max-width': '60ch' } },
        ],
      }),
    );

    const box = document.querySelector<HTMLElement>('.box');
    expect(box?.style.color).toBe('red');
    expect(box?.style.getPropertyValue('max-width')).toBe('60ch');

    engine.unmount('test.plugin');
    expect(box?.style.color).toBe('blue');
    expect(box?.style.getPropertyValue('max-width')).toBe('');
  });

  it('resolves semantic selectors via the adapter and ignores unknown keys', () => {
    document.body.innerHTML = '<div class="user-msg"></div>';
    const engine = new DeclarativeEngine({ doc: document, adapter });
    engine.mount(
      makeManifest({
        domOps: [
          { op: 'addClass', target: semanticRef('userTurn'), className: 'gv-plugin-u' },
          { op: 'addClass', target: semanticRef('doesNotExist'), className: 'gv-plugin-z' },
        ],
      }),
    );

    expect(document.querySelector('.user-msg')?.classList.contains('gv-plugin-u')).toBe(true);
    // unknown key is a no-op, not a throw
    expect(document.querySelector('.gv-plugin-z')).toBeNull();
  });

  it('reapplyNow applies ops to elements added after mount (SPA re-render)', () => {
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(
      makeManifest({
        domOps: [{ op: 'addClass', target: cssRef('.late'), className: 'gv-plugin-late' }],
      }),
    );

    const late = document.createElement('div');
    late.className = 'late';
    document.body.appendChild(late);
    expect(late.classList.contains('gv-plugin-late')).toBe(false);

    engine.reapplyNow();
    expect(late.classList.contains('gv-plugin-late')).toBe(true);
  });

  it('substitutes {{setting}} tokens in CSS and updates them live', () => {
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(
      makeManifest({
        settings: { width: { type: 'number', label: 'Width', default: 70, min: 40, max: 120 } },
        styles: [{ css: '.x{max-width:{{width}}ch}' }],
      }),
      { width: 80 },
    );
    const styleEl = document.getElementById('gv-plugin-style-test.plugin');
    expect(styleEl?.textContent).toContain('max-width:80ch');

    engine.updateSettings('test.plugin', { width: 95 });
    expect(styleEl?.textContent).toContain('max-width:95ch');
  });

  it('falls back to the schema default when a setting value is absent', () => {
    const engine = new DeclarativeEngine({ doc: document });
    engine.mount(
      makeManifest({
        settings: { width: { type: 'number', label: 'Width', default: 70 } },
        styles: [{ css: '.y{max-width:{{width}}ch}' }],
      }),
    );
    expect(document.getElementById('gv-plugin-style-test.plugin')?.textContent).toContain(
      'max-width:70ch',
    );
  });
});
