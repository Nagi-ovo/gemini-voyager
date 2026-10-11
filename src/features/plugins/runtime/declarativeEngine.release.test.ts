import { afterEach, describe, expect, it, vi } from 'vitest';

import type { PluginManifest, SiteAdapter } from '../types';
import { DeclarativeEngine } from './declarativeEngine';
import type { PluginScope } from './pluginScope';

const startup = vi.hoisted(() => ({
  finish: null as null | (() => void),
  disposed: 0,
}));

// A formula-copy startup that stays pending until the test finishes it.
vi.mock('@/features/formulaCopy', () => ({
  activateFormulaCopy: vi.fn((scope: PluginScope) => {
    scope.effect(
      () =>
        new Promise<() => void>((resolve) => {
          startup.finish = () =>
            resolve(() => {
              startup.disposed += 1;
            });
        }),
      'formula-copy',
    );
  }),
}));

const adapter: SiteAdapter = {
  id: 'deepseek',
  label: 'DeepSeek',
  matches: ['https://chat.deepseek.com/*'],
  selectors: { userTurn: '.user-turn' },
  theme: { hostSelector: 'body', lightSelector: 'body.light', darkSelector: 'body.dark' },
  capabilities: new Set(['chat']),
};

function manifest(id: string, domOps: PluginManifest['contributes']['domOps']): PluginManifest {
  return {
    id,
    name: id,
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'other',
    license: 'MIT',
    engine: '>=1.3.0',
    tier: 'declarative',
    matches: ['https://chat.deepseek.com/*'],
    contributes: { domOps },
  };
}

const formula = manifest('x.formula', [{ op: 'native', handler: 'formulaCopy', params: {} }]);

afterEach(() => {
  startup.finish = null;
  startup.disposed = 0;
  document.body.innerHTML = '';
});

describe('DeclarativeEngine releases', () => {
  it('settles an unmount only after a late async startup has been paid back', async () => {
    const released = vi.fn();
    const engine = new DeclarativeEngine({
      doc: document,
      adapter,
      onRelease: (mounted, done) => {
        released(mounted.id);
        void done.then(() => released(`${mounted.id}:settled`));
      },
    });
    engine.mount(formula);

    let settled = false;
    const release = engine.unmount(formula.id).then(() => {
      settled = true;
    });
    expect(engine.isActive(formula.id)).toBe(false);
    expect(released.mock.calls).toEqual([['x.formula']]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(settled).toBe(false);

    startup.finish?.();
    await release;
    expect(startup.disposed).toBe(1);
    expect(released.mock.calls).toEqual([['x.formula'], ['x.formula:settled']]);
  });

  it('reports a release for every plugin unmountAll removes', () => {
    const released: string[] = [];
    const engine = new DeclarativeEngine({
      doc: document,
      adapter,
      onRelease: (mounted) => released.push(mounted.id),
    });
    engine.mount(formula);
    engine.mount(
      manifest('x.tweak', [
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-x' },
      ]),
    );
    engine.unmountAll();
    expect(released.sort()).toEqual(['x.formula', 'x.tweak']);
  });

  it('leaves a plugin out of the health monitor when told to', () => {
    document.body.innerHTML = '<div class="user-turn"></div>';
    const engine = new DeclarativeEngine({
      doc: document,
      adapter,
      shouldTrackHealth: (mounted) => mounted.id !== 'x.formula',
    });
    const tracked = manifest('x.tracked', [
      { op: 'addClass', target: { kind: 'css', selector: '.missing' }, className: 'gv-x' },
    ]);
    engine.mount(formula);
    engine.mount(tracked);
    engine.evaluateHealthNow();
    expect(engine.getHealth('x.formula')).toBeUndefined();
    expect(engine.getHealth('x.tracked')).toBe(true);
    engine.unmountAll();
  });
});
