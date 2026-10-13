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

/** Every inline declaration as sorted `prop: value !priority`, independent of write order. */
function declarations(el: HTMLElement): string[] {
  const out: string[] = [];
  for (let i = 0; i < el.style.length; i += 1) {
    const prop = el.style.item(i);
    const priority = el.style.getPropertyPriority(prop);
    out.push(`${prop}: ${el.style.getPropertyValue(prop)}${priority ? ' !' + priority : ''}`);
  }
  return out.sort();
}

const SIDES = ['top', 'right', 'bottom', 'left'] as const;
const borderWidths = (el: HTMLElement): string[] =>
  SIDES.map((side) => el.style.getPropertyValue(`border-${side}-width`));

// jsdom leaves a stale `margin`/`padding`/`flex` shorthand behind when its longhands are
// removed, so these cases use `border-width`, which jsdom expands and collapses correctly.
// jsdom also drops a longhand's own `!important` under a shorthand, so host priorities
// sit on a property without longhands.
const SHORTHAND_WRITERS: Array<[string, (css: string) => DomOperation]> = [
  ['setStyle', (css) => setStyle({ 'border-width': css })],
  ['style attribute', (css) => wholeStyle(`border-width: ${css}`)],
];
const SHORTHAND_CASES = SHORTHAND_WRITERS.flatMap(([kind, write]) =>
  ['shorthand first', 'longhand first'].map((order) => ({ kind, write, order })),
);

/** Mount A (shorthand) and B (`border-top-width` longhand) in the given order. */
function mountShorthandPair(engine: DeclarativeEngine, order: string, a: DomOperation): void {
  const plugins = [
    manifest('plugin.a', a),
    manifest('plugin.b', setStyle({ 'border-top-width': '5px' })),
  ];
  if (order === 'longhand first') plugins.reverse();
  for (const plugin of plugins) engine.mount(plugin);
}

describe('DeclarativeEngine inline style shared by a shorthand and its longhand', () => {
  it.each(SHORTHAND_CASES)(
    "disabling a $kind shorthand plugin keeps another plugin's longhand ($order)",
    ({ write, order }) => {
      const { engine, box } = mountBox('border-width: 1px 3px; color: blue !important;');
      const host = declarations(box);
      mountShorthandPair(engine, order, write('2px'));

      const top = order === 'shorthand first' ? '5px' : '2px';
      expect(borderWidths(box)).toEqual([top, '2px', '2px', '2px']);

      void engine.unmount('plugin.a');
      expect(borderWidths(box)).toEqual(['5px', '3px', '1px', '3px']);
      expect(box.style.getPropertyPriority('color')).toBe('important');

      void engine.unmount('plugin.b');
      expect(declarations(box)).toEqual(host);
    },
  );

  it.each(SHORTHAND_CASES)(
    "disabling a longhand plugin keeps another plugin's $kind shorthand ($order)",
    ({ write, order }) => {
      const { engine, box } = mountBox(
        'border-width: 1px 3px; border-left-width: 6px; color: blue !important;',
      );
      const host = declarations(box);
      mountShorthandPair(engine, order, write('2px'));

      void engine.unmount('plugin.b');
      expect(borderWidths(box)).toEqual(['2px', '2px', '2px', '2px']);

      void engine.unmount('plugin.a');
      expect(borderWidths(box)).toEqual(['1px', '3px', '1px', '6px']);
      expect(declarations(box)).toEqual(host);
    },
  );

  it.each(SHORTHAND_WRITERS)(
    'full teardown of a %s shorthand and a longhand leaves no style attribute on an element that had none',
    (_kind, write) => {
      const { engine, box } = mountBox(null);
      mountShorthandPair(engine, 'shorthand first', write('2px'));

      void engine.unmount('plugin.a');
      void engine.unmount('plugin.b');
      expect(box.hasAttribute('style')).toBe(false);
    },
  );
});

describe('DeclarativeEngine setStyle priority', () => {
  it('applies a setStyle value ending in !important with important priority, then restores the host', () => {
    const { engine, box } = mountBox('color: blue;');
    const host = declarations(box);
    engine.mount(
      manifest('plugin.a', setStyle({ color: 'red !important', 'border-width': '2px !important' })),
    );

    expect(box.style.color).toBe('red');
    expect(box.style.getPropertyPriority('color')).toBe('important');
    expect(borderWidths(box)).toEqual(['2px', '2px', '2px', '2px']);
    expect(box.style.getPropertyPriority('border-top-width')).toBe('important');

    void engine.unmount('plugin.a');
    expect(declarations(box)).toEqual(host);
  });
});
