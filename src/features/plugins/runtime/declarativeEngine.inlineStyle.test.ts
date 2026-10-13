import { afterEach, describe, expect, it } from 'vitest';

import { type DomOperation, type PluginManifest, cssRef } from '../types';
import { DeclarativeEngine } from './declarativeEngine';

function manifest(id: string, op: DomOperation): PluginManifest {
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
    matches: ['*://*/*'],
    contributes: { domOps: [op] },
  };
}

const wholeStyle = (value: string): DomOperation => ({
  op: 'setAttribute',
  target: cssRef('.box'),
  name: 'style',
  value,
});
const setStyle = (styles: Record<string, string>): DomOperation => ({
  op: 'setStyle',
  target: cssRef('.box'),
  styles,
});

function mountBox(hostStyle: string | null): { engine: DeclarativeEngine; box: HTMLElement } {
  const attr = hostStyle === null ? '' : ` style="${hostStyle}"`;
  document.body.innerHTML = `<div class="box"${attr}></div>`;
  return {
    engine: new DeclarativeEngine({ doc: document }),
    box: document.querySelector<HTMLElement>('.box')!,
  };
}

/** Mount A (whole `style` attribute) and B (`setStyle`) in the given order. */
function mountBoth(engine: DeclarativeEngine, order: string, a: DomOperation, b: DomOperation) {
  const plugins = [manifest('plugin.a', a), manifest('plugin.b', b)];
  if (order === 'setStyle first') plugins.reverse();
  for (const plugin of plugins) engine.mount(plugin);
}

const ORDERS = ['whole style first', 'setStyle first'];

afterEach(() => {
  document.body.innerHTML = '';
});

describe('DeclarativeEngine inline style shared by a style attribute and setStyle', () => {
  it.each(ORDERS)(
    "disabling a whole-style plugin keeps another plugin's setStyle property (%s)",
    (order) => {
      const { engine, box } = mountBox('color: blue;');
      const host = box.getAttribute('style');
      mountBoth(
        engine,
        order,
        wholeStyle('color: red !important; margin-top: 4px'),
        setStyle({ '--gv-x': '5px' }),
      );

      expect(box.style.color).toBe('red');
      expect(box.style.getPropertyPriority('color')).toBe('important');
      expect(box.style.marginTop).toBe('4px');
      expect(box.style.getPropertyValue('--gv-x')).toBe('5px');

      void engine.unmount('plugin.a');
      expect(box.style.getPropertyValue('--gv-x')).toBe('5px');
      expect(box.style.color).toBe('blue');
      expect(box.style.getPropertyPriority('color')).toBe('');
      expect(box.style.marginTop).toBe('');

      void engine.unmount('plugin.b');
      expect(box.getAttribute('style')).toBe(host);
    },
  );

  it.each(ORDERS)(
    "disabling a setStyle plugin keeps another plugin's whole style attribute (%s)",
    (order) => {
      const { engine, box } = mountBox('color: blue !important;');
      const host = box.getAttribute('style');
      mountBoth(
        engine,
        order,
        wholeStyle('color: red; margin-top: 4px'),
        setStyle({ '--gv-x': '5px' }),
      );

      void engine.unmount('plugin.b');
      expect(box.style.getPropertyValue('--gv-x')).toBe('');
      expect(box.style.color).toBe('red');
      expect(box.style.marginTop).toBe('4px');

      void engine.unmount('plugin.a');
      expect(box.getAttribute('style')).toBe(host);
    },
  );

  it.each(['plugin.b', 'plugin.a'])(
    'a property set by both a style attribute and setStyle reveals the remaining writer, then the host value (disable %s first)',
    (first) => {
      const { engine, box } = mountBox('color: blue;');
      const host = box.getAttribute('style');
      mountBoth(
        engine,
        'whole style first',
        wholeStyle('color: red'),
        setStyle({ color: 'green' }),
      );
      expect(box.style.color).toBe('green');

      void engine.unmount(first);
      expect(box.style.color).toBe(first === 'plugin.b' ? 'red' : 'green');

      void engine.unmount(first === 'plugin.b' ? 'plugin.a' : 'plugin.b');
      expect(box.getAttribute('style')).toBe(host);
    },
  );

  it('full teardown leaves no style attribute on an element that had none', () => {
    const { engine, box } = mountBox(null);
    mountBoth(engine, 'setStyle first', wholeStyle('color: red'), setStyle({ '--gv-x': '5px' }));
    expect(box.style.color).toBe('red');

    void engine.unmount('plugin.a');
    void engine.unmount('plugin.b');
    expect(box.hasAttribute('style')).toBe(false);
  });
});
