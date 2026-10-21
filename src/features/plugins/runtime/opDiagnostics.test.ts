import { afterEach, describe, expect, it } from 'vitest';

import type { DomOperation, PluginManifest, SiteAdapter } from '../types';
import { DeclarativeEngine } from './declarativeEngine';
import { diagnoseOps } from './opDiagnostics';

const adapter: SiteAdapter = {
  id: 'claude',
  label: 'Claude',
  matches: ['https://claude.ai/*'],
  // The selector a redesign left behind: nothing on the page matches it any more.
  selectors: { userTurn: '.user-turn', sidebar: 'nav[aria-label]', composer: '.composer' },
  theme: { hostSelector: 'html', lightSelector: 'html.light', darkSelector: 'html.dark' },
  capabilities: new Set(['chat']),
};

function manifest(domOps: DomOperation[]): PluginManifest {
  return {
    id: 'local.blur',
    name: 'Blur',
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*'],
    contributes: { domOps },
  };
}

/** Screenshot Blur's shape: two ops on `body` beside the one that does the work. */
const blur = manifest([
  { op: 'setStyle', target: { kind: 'css', selector: 'body' }, styles: { '--gv-x': '6px' } },
  { op: 'setAttribute', target: { kind: 'css', selector: 'body' }, name: 'data-gv-x', value: '1' },
  { op: 'addClass', target: { kind: 'semantic', key: 'sidebar' }, className: 'gv-plugin-blur' },
]);

afterEach(() => {
  document.body.innerHTML = '';
});

describe('diagnoseOps', () => {
  it('counts each targeted op on its own and marks body targets as page-root', () => {
    document.body.innerHTML = '<div class="composer"></div><div class="composer"></div>';
    const ops = diagnoseOps(
      document,
      adapter,
      manifest([
        { op: 'native', handler: 'formulaCopy', params: {} },
        { op: 'hide', target: { kind: 'semantic', key: 'composer' } },
        { op: 'addClass', target: { kind: 'css', selector: ' html , body ' }, className: 'gv-a' },
        { op: 'addClass', target: { kind: 'css', selector: '.absent' }, className: 'gv-b' },
      ]),
    );

    expect(ops).toEqual([
      { index: 1, op: 'hide', label: 'composer', count: 2, state: 'ok', expect: 'page' },
      {
        index: 2,
        op: 'addClass',
        label: 'html , body',
        count: 2,
        state: 'page-root',
        expect: 'unknown',
      },
      { index: 3, op: 'addClass', label: '.absent', count: 0, state: 'none', expect: 'unknown' },
    ]);
  });

  it('reports a key the adapter lacks and a selector that does not parse instead of throwing', () => {
    const ops = diagnoseOps(
      document,
      adapter,
      manifest([
        { op: 'hide', target: { kind: 'semantic', key: 'sidePanel' } },
        { op: 'hide', target: { kind: 'css', selector: 'div >> p' } },
      ]),
    );

    expect(ops.map((op) => [op.label, op.state])).toEqual([
      ['sidePanel', 'unresolved-key'],
      ['div >> p', 'invalid-selector'],
    ]);
  });

  it('shortens a long raw selector for display', () => {
    const selector = `main   ${'div > '.repeat(20)}p`;
    const [op] = diagnoseOps(
      document,
      adapter,
      manifest([{ op: 'hide', target: { kind: 'css', selector } }]),
    );

    expect(op.label).toHaveLength(40);
    expect(op.label.startsWith('main div > ')).toBe(true);
    expect(op.label.endsWith('…')).toBe(true);
  });
});

describe('DeclarativeEngine per-op health', () => {
  it('reports a sidebar op that matches nothing even while body ops match', () => {
    document.body.innerHTML = '<div class="user-turn">hi</div><nav class="redesigned"></nav>';
    const engine = new DeclarativeEngine({ doc: document, adapter });
    engine.mount(blur);
    engine.evaluateHealthNow();

    // The body ops keep the plugin-wide count above zero, so it is not "no effect"…
    expect(engine.getHealth(blur.id)).toBe(false);
    // …but the op that blurs the sidebar is named as finding nothing.
    expect(engine.getZeroOps(blur.id)).toEqual([2]);
    expect(diagnoseOps(document, adapter, blur).map((op) => [op.label, op.count])).toEqual([
      ['body', 1],
      ['body', 1],
      ['sidebar', 0],
    ]);

    document.body.insertAdjacentHTML('beforeend', '<nav aria-label="Chats"></nav>');
    engine.evaluateHealthNow();
    expect(engine.getZeroOps(blur.id)).toEqual([]);
    engine.unmountAll();
  });
});
