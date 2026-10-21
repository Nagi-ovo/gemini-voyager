import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type HealthSample, HealthMonitor } from './healthMonitor';
import type { OpDiagnostic } from './opDiagnostics';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function sample(targets: number, ops: readonly OpDiagnostic[] = []): HealthSample {
  return { targets, ops };
}

function op(index: number, overrides: Partial<OpDiagnostic>): OpDiagnostic {
  return {
    index,
    op: 'addClass',
    label: 'sidebar',
    count: 0,
    state: 'none',
    expect: 'page',
    ...overrides,
  };
}

function monitor(userTurns: () => number, onChange = vi.fn()) {
  const instance = new HealthMonitor({
    countUserTurns: userTurns,
    onChange,
    quietMs: 100,
    maxWaitMs: 1_000,
  });
  return { instance, onChange };
}

describe('HealthMonitor (plan D12)', () => {
  it('flags a plugin with zero targets once the DOM has been quiet, on a page with user turns', () => {
    const { instance, onChange } = monitor(() => 3);
    instance.track('p', () => sample(0));
    expect(instance.get('p')).toBeUndefined();

    vi.advanceTimersByTime(99);
    expect(instance.get('p')).toBeUndefined();
    vi.advanceTimersByTime(1);
    expect(instance.get('p')).toBe(true);
    expect(onChange).toHaveBeenCalledWith('p', true, []);
  });

  it('never flags an empty conversation', () => {
    const { instance, onChange } = monitor(() => 0);
    instance.track('p', () => sample(0));
    vi.advanceTimersByTime(2_000);
    expect(instance.get('p')).toBe(false);
    expect(onChange).toHaveBeenCalledWith('p', false, []);
  });

  it('waits while the DOM keeps changing and falls back to the deadline', () => {
    const { instance } = monitor(() => 1);
    instance.track('p', () => sample(0));
    // Keep the page busy: a mutation every 50 ms defeats the 100 ms quiet window.
    for (let elapsed = 0; elapsed < 900; elapsed += 50) {
      vi.advanceTimersByTime(50);
      instance.noteMutation();
    }
    expect(instance.get('p')).toBeUndefined();
    // The 1 s deadline still delivers a first verdict.
    vi.advanceTimersByTime(150);
    expect(instance.get('p')).toBe(true);
  });

  it('clears the flag as soon as targets appear on a later quiet period', () => {
    let targets = 0;
    const { instance, onChange } = monitor(() => 1);
    instance.track('p', () => sample(targets));
    vi.advanceTimersByTime(100);
    expect(instance.get('p')).toBe(true);

    targets = 2;
    instance.noteMutation();
    vi.advanceTimersByTime(100);
    expect(instance.get('p')).toBe(false);
    expect(onChange).toHaveBeenLastCalledWith('p', false, []);
  });

  it('stops evaluating a forgotten plugin and reports nothing after dispose', () => {
    const { instance, onChange } = monitor(() => 1);
    instance.track('p', () => sample(0));
    instance.forget('p');
    vi.advanceTimersByTime(2_000);
    expect(onChange).not.toHaveBeenCalled();
    expect(instance.hasTracked()).toBe(false);

    instance.track('q', () => sample(0));
    instance.dispose();
    vi.advanceTimersByTime(2_000);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('treats a throwing sample as zero targets', () => {
    const { instance } = monitor(() => 1);
    instance.track('p', () => {
      throw new Error('boom');
    });
    instance.evaluateNow();
    expect(instance.get('p')).toBe(true);
  });

  it('flags a sidebar op that finds nothing while body ops keep the plugin count up', () => {
    const { instance, onChange } = monitor(() => 2);
    const body = op(0, {
      op: 'setStyle',
      label: 'body',
      count: 1,
      state: 'page-root',
      expect: 'unknown',
    });
    let sidebar = op(1, {});
    instance.track('p', () => sample(1, [body, sidebar]));
    vi.advanceTimersByTime(100);
    expect(instance.get('p')).toBe(false);
    expect(instance.zeroOps('p')).toEqual([1]);
    expect(onChange).toHaveBeenLastCalledWith('p', false, [1]);

    sidebar = op(1, { count: 1, state: 'ok' });
    instance.noteMutation();
    vi.advanceTimersByTime(100);
    expect(instance.zeroOps('p')).toEqual([]);
    expect(onChange).toHaveBeenLastCalledWith('p', false, []);
  });

  it('judges page keys on an empty chat, conversation keys only once it has turns', () => {
    let turns = 0;
    const { instance } = monitor(() => turns);
    const ops = [
      op(0, {}),
      op(1, { label: 'userTurn', expect: 'conversation' }),
      op(2, { label: 'codeBlock', expect: 'transient' }),
      op(3, { label: '.custom', expect: 'unknown' }),
      op(4, { label: 'sidePanel', state: 'unresolved-key', expect: 'transient' }),
    ];
    instance.track('p', () => sample(0, ops));
    instance.evaluateNow();
    expect(instance.get('p')).toBe(false);
    expect(instance.zeroOps('p')).toEqual([0, 4]);

    turns = 3;
    instance.evaluateNow();
    expect(instance.get('p')).toBe(true);
    expect(instance.zeroOps('p')).toEqual([0, 1, 4]);
  });
});
