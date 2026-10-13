import { describe, expect, it } from 'vitest';

import { OFFICIAL_PLUGIN_IDS } from '../sites/featureOwners';
import type { DomOperation, PluginManifest } from '../types';
import { arbitrate } from './resourceArbiter';
import { claimedResources, duplicateResourceClaims, opResourceClaims } from './resourceClaims';

function plugin(id: string, handlers: readonly string[] = []): PluginManifest {
  const domOps: DomOperation[] = handlers.map((handler) => ({ op: 'native', handler, params: {} }));
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
    matches: ['https://claude.ai/*'],
    contributes: {
      styles: [{ css: '.gv-x{color:red}' }],
      domOps: [
        { op: 'addClass', target: { kind: 'css', selector: 'body' }, className: 'gv-x' },
        ...domOps,
      ],
    },
  };
}

const NONE: ReadonlySet<string> = new Set();

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

describe('resource claims', () => {
  it('derives claims from the handler only; every other primitive composes', () => {
    expect(claimedResources(plugin('a', ['formulaCopy']))).toEqual(['formula-copy-service']);
    expect(claimedResources(plugin('a', ['vimInput']))).toEqual(['vim-input-runtime']);
    expect(claimedResources(plugin('a', ['counterBadge', 'copyButton', 'collapse']))).toEqual([]);
    expect(claimedResources(plugin('a', ['turnNavigator']))).toEqual(['timeline-rail']);
    expect(claimedResources(plugin('a'))).toEqual([]);
  });

  it('keeps each op claim, so a manifest starting one runtime twice is caught', () => {
    const twice = plugin('local.me.vim-twice', ['vimInput', 'formulaCopy', 'vimInput']);
    expect(opResourceClaims(twice).map((claim) => [claim.resource, claim.opIndex])).toEqual([
      ['vim-input-runtime', 1],
      ['formula-copy-service', 2],
      ['vim-input-runtime', 3],
    ]);
    expect(duplicateResourceClaims(twice)).toEqual(['vim-input-runtime']);
    expect(claimedResources(twice)).toEqual(['vim-input-runtime', 'formula-copy-service']);
    expect(duplicateResourceClaims(plugin('a', ['vimInput', 'formulaCopy']))).toEqual([]);
  });

  it('lets no manifest field add, rename or drop a claim', () => {
    const declared = {
      ...plugin('local.me.f', ['formulaCopy']),
      requires: { handlers: ['vimInput'] },
      resources: [],
      claims: ['nothing'],
    } as PluginManifest;
    expect(claimedResources(declared)).toEqual(['formula-copy-service']);
  });

  it('a fixed Gemini rail and a public rail exclude each other, including duplicate activation', () => {
    const official = plugin(OFFICIAL_PLUGIN_IDS.geminiTimeline);
    const local = plugin('local.me.shared-rail', ['turnNavigator']);
    expect(claimedResources(official)).toEqual(claimedResources(local));
    expect(duplicateResourceClaims(plugin(official.id, ['turnNavigator']))).toEqual([
      'timeline-rail',
    ]);
    expect(arbitrate([local, official], [], NONE).blocked.get(local.id)?.by).toBe(official.id);
    expect(arbitrate([local, official], [], new Set([local.id])).blocked.get(official.id)?.by).toBe(
      local.id,
    );
    expect(
      arbitrate([local], [], NONE, {
        releasingBy: (resource) => (resource === 'timeline-rail' ? official.id : null),
      }).blocked.get(local.id),
    ).toEqual({ reason: 'releasing', by: official.id, resources: ['timeline-rail'] });
  });
});

describe('arbitrate', () => {
  const official = plugin('voyager.formula-copy', ['formulaCopy']);
  const localA = plugin('local.alice.formula', ['formulaCopy']);
  const localB = plugin('local.bob.formula', ['formulaCopy']);
  const unrelated = plugin('local.me.tweak');

  it('reports the second send shortcut as a conflict while preserving a running holder on every site', () => {
    const first = plugin('local.first.send', ['sendShortcut']);
    const second = plugin('local.second.send', ['sendShortcut']);
    const official = plugin('voyager.gemini-ctrl-enter-send', ['sendShortcut']);
    expect(claimedResources(first)).toEqual(['composer-send-key-mode']);
    expect(
      duplicateResourceClaims(plugin('local.twice', ['sendShortcut', 'sendShortcut'])),
    ).toEqual(['composer-send-key-mode']);
    const live = arbitrate([first, second], [], new Set([first.id]));
    expect([...live.granted]).toEqual([first.id]);
    expect(live.blocked.get(second.id)).toEqual({
      reason: 'conflict',
      by: first.id,
      resources: ['composer-send-key-mode'],
    });
    expect(arbitrate([first], [official], NONE).blocked.get(first.id)?.by).toBe(official.id);
  });

  it('gives a free resource to the official plugin, then to the lowest local id, in any input order', () => {
    for (const order of permutations([localB, official, unrelated, localA])) {
      const result = arbitrate(order, [], NONE);
      expect([...result.granted].sort()).toEqual(['local.me.tweak', 'voyager.formula-copy']);
      expect(Object.fromEntries(result.blocked)).toEqual({
        'local.alice.formula': {
          reason: 'conflict',
          by: 'voyager.formula-copy',
          resources: ['formula-copy-service'],
        },
        'local.bob.formula': {
          reason: 'conflict',
          by: 'voyager.formula-copy',
          resources: ['formula-copy-service'],
        },
      });
    }
    const locals = arbitrate([localB, localA], [], NONE);
    expect([...locals.granted]).toEqual(['local.alice.formula']);
    expect(locals.blocked.get('local.bob.formula')?.by).toBe('local.alice.formula');
  });

  it('keeps a running local holder when the official plugin is turned on later', () => {
    for (const order of permutations([official, localA, unrelated])) {
      const result = arbitrate(order, [], new Set(['local.alice.formula']));
      expect([...result.granted].sort()).toEqual(['local.alice.formula', 'local.me.tweak']);
      expect(result.blocked.get('voyager.formula-copy')).toEqual({
        reason: 'conflict',
        by: 'local.alice.formula',
        resources: ['formula-copy-service'],
      });
    }
  });

  it('frees the resource once the holder is no longer wanted', () => {
    const result = arbitrate([official, localA], [], new Set(['local.bob.formula']));
    expect([...result.granted]).toEqual(['voyager.formula-copy']);
  });

  it('blocks a composite plugin whole when one of its runtimes is taken', () => {
    const composite = plugin('local.me.composite', ['vimInput', 'formulaCopy']);
    const result = arbitrate([composite, official], [], NONE);
    expect(result.granted.has('local.me.composite')).toBe(false);
    expect(result.blocked.get('local.me.composite')).toEqual({
      reason: 'conflict',
      by: 'voyager.formula-copy',
      resources: ['formula-copy-service'],
    });
    // It holds nothing either: a Vim-only plugin is free to run.
    const vim = plugin('local.me.vim', ['vimInput']);
    expect(arbitrate([composite, official, vim], [], NONE).granted.has('local.me.vim')).toBe(true);
  });

  it('lets a reservation hold a resource against a local plugin without granting it', () => {
    const pendingOfficial = plugin('voyager.gemini-formula-copy', ['formulaCopy']);
    const result = arbitrate([localA, unrelated], [pendingOfficial], NONE);
    expect([...result.granted]).toEqual(['local.me.tweak']);
    expect(result.blocked.get('local.alice.formula')?.by).toBe('voyager.gemini-formula-copy');
    // Once the admission closes the reservation is gone and the local plugin runs.
    expect(arbitrate([localA, unrelated], [], NONE).granted.has('local.alice.formula')).toBe(true);
  });

  it('never lets a reservation displace a running holder', () => {
    const pendingOfficial = plugin('voyager.gemini-formula-copy', ['formulaCopy']);
    const result = arbitrate([localA], [pendingOfficial], new Set(['local.alice.formula']));
    expect([...result.granted]).toEqual(['local.alice.formula']);
  });
});

describe('arbitrate around runtimes still shutting down', () => {
  const vimOnly = plugin('local.a.vim', ['vimInput']);
  const composite = plugin('local.b.vim-formula', ['vimInput', 'formulaCopy']);
  const formulaOnly = plugin('local.c.formula', ['formulaCopy']);
  const vimReleasedByA = (resource: string): string | null =>
    resource === 'vim-input-runtime' ? vimOnly.id : null;

  it('lets a waiting composite plugin hold only the busy runtime, so a plugin needing its free one starts', () => {
    for (const order of permutations([composite, formulaOnly])) {
      const result = arbitrate(order, [], NONE, { releasingBy: vimReleasedByA });
      expect([...result.granted]).toEqual(['local.c.formula']);
      expect(result.blocked.get(composite.id)).toEqual({
        reason: 'releasing',
        by: vimOnly.id,
        resources: ['vim-input-runtime'],
      });
    }
  });

  it('keeps the waiting order for the busy runtime itself', () => {
    const otherVim = plugin('local.d.vim', ['vimInput']);
    const result = arbitrate([otherVim, composite], [], NONE, { releasingBy: vimReleasedByA });
    expect(result.granted.size).toBe(0);
    expect(result.blocked.get(composite.id)?.reason).toBe('releasing');
    expect(result.blocked.get(otherVim.id)).toEqual({
      reason: 'conflict',
      by: composite.id,
      resources: ['vim-input-runtime'],
    });
  });

  it('lets a holder waiting on its own release keep every resource it held', () => {
    const result = arbitrate([composite, formulaOnly], [], new Set([composite.id]), {
      releasingBy: (resource) => (resource === 'vim-input-runtime' ? composite.id : null),
    });
    expect(result.granted.size).toBe(0);
    expect(result.blocked.get(composite.id)).toMatchObject({
      reason: 'releasing',
      by: composite.id,
    });
    expect(result.blocked.get(formulaOnly.id)).toMatchObject({
      reason: 'conflict',
      by: composite.id,
    });
  });
});

describe('arbitrate while an official plugin awaits its switch', () => {
  const awaitingOfficial = plugin('voyager.gemini-formula-copy', ['formulaCopy']);
  const localFormula = plugin('local.alice.formula', ['formulaCopy']);
  const localVim = plugin('local.alice.vim', ['vimInput']);
  const localTweak = plugin('local.me.tweak');

  it('keeps off only the plugins needing its runtime, reported as pending', () => {
    for (const order of permutations([localFormula, localVim, localTweak])) {
      const result = arbitrate(order, [], NONE, { awaiting: [awaitingOfficial] });
      expect([...result.granted].sort()).toEqual(['local.alice.vim', 'local.me.tweak']);
      expect(result.blocked.get(localFormula.id)).toEqual({
        reason: 'pending',
        by: awaitingOfficial.id,
        resources: ['formula-copy-service'],
      });
      expect(result.granted.has(awaitingOfficial.id)).toBe(false);
    }
  });

  it('never displaces a running holder', () => {
    const result = arbitrate([localFormula], [], new Set([localFormula.id]), {
      awaiting: [awaitingOfficial],
    });
    expect([...result.granted]).toEqual([localFormula.id]);
  });
});
