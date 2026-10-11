import { describe, expect, it, vi } from 'vitest';

import { ReleaseLedger } from './releaseLedger';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('ReleaseLedger', () => {
  it('a settled release clears only its own token', async () => {
    const ledger = new ReleaseLedger();
    const first = deferred();
    const second = deferred();
    ledger.record('voyager.formula-copy', ['formula-copy-service'], first.promise);
    ledger.record('local.me.formula', ['formula-copy-service'], second.promise);

    second.resolve();
    await flush();
    expect(ledger.releasing('formula-copy-service')?.pluginId).toBe('voyager.formula-copy');

    first.reject(new Error('disposer threw'));
    await flush();
    expect(ledger.releasing('formula-copy-service')).toBeNull();
  });

  it('a release that never settles keeps only its own resource busy', async () => {
    const ledger = new ReleaseLedger();
    ledger.record('local.me.vim', ['vim-input-runtime'], new Promise(() => {}));
    const formula = deferred();
    ledger.record('local.me.formula', ['formula-copy-service'], formula.promise);
    const onVimFree = vi.fn();
    const onFormulaFree = vi.fn();
    ledger.whenFree('vim-input-runtime', 'gen-1', onVimFree);
    ledger.whenFree('formula-copy-service', 'gen-1', onFormulaFree);

    formula.resolve();
    await flush();
    expect(onFormulaFree).toHaveBeenCalledTimes(1);
    expect(onVimFree).not.toHaveBeenCalled();
    expect(ledger.releasing('vim-input-runtime')?.pluginId).toBe('local.me.vim');
  });

  it('wakes each waiter key once, after the last release of the resource', async () => {
    const ledger = new ReleaseLedger();
    const first = deferred();
    const second = deferred();
    ledger.record('a', ['formula-copy-service'], first.promise);
    ledger.record('b', ['formula-copy-service'], second.promise);
    const sameGeneration = vi.fn();
    const otherGeneration = vi.fn();
    ledger.whenFree('formula-copy-service', 'gen-1', sameGeneration);
    ledger.whenFree('formula-copy-service', 'gen-1', sameGeneration);
    ledger.whenFree('formula-copy-service', 'gen-2', otherGeneration);

    first.resolve();
    await flush();
    expect(sameGeneration).not.toHaveBeenCalled();
    second.resolve();
    await flush();
    expect(sameGeneration).toHaveBeenCalledTimes(1);
    expect(otherGeneration).toHaveBeenCalledTimes(1);
  });

  it('tracks nothing for a plugin without exclusive resources', () => {
    const ledger = new ReleaseLedger();
    ledger.record('local.me.tweak', [], new Promise(() => {}));
    const callback = vi.fn();
    ledger.whenFree('formula-copy-service', 'gen-1', callback);
    expect(callback).toHaveBeenCalledTimes(1);
  });
});
