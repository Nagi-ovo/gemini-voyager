// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { throttleChainedTimers } from './__tests__/throttledTimers';
import {
  type PageWakeSubscribe,
  type Waker,
  createChannelDefer,
  createWaker,
  timerDefer,
} from './wake';

let waker: Waker;
let controller: AbortController;
let report: (reason: 'pageData' | 'route') => void;

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="target" data-v="start"></div>';
  controller = new AbortController();
  const subscribe: PageWakeSubscribe = (listener) => {
    report = listener;
    return () => {
      report = () => {};
    };
  };
  waker = createWaker({ now: Date.now, defer: timerDefer, signal: controller.signal, subscribe });
});

afterEach(() => {
  waker.dispose();
  vi.useRealTimers();
});

const target = (): HTMLElement => document.getElementById('target')!;

/** Past the least gap after the first look, and the deferred look (1 ms on the fake clock). */
async function afterGap(): Promise<void> {
  await vi.advanceTimersByTimeAsync(300);
}

describe('op waits', () => {
  it('does not lose the last change of a burst', async () => {
    const looks: string[] = [];
    let answer: string | null | undefined;
    void waker
      .wait(
        () => {
          looks.push(target().dataset.v ?? '');
          return target().dataset.v === 'final' ? 'final' : null;
        },
        { timeoutMs: 5_000, minGapMs: 250 },
      )
      .then((value) => (answer = value));
    await vi.advanceTimersByTimeAsync(100);
    target().dataset.v = 'middle';
    await vi.advanceTimersByTimeAsync(50);
    // Still inside the gap after the look the first change caused: nothing else will wake it.
    target().dataset.v = 'final';
    await vi.advanceTimersByTimeAsync(150);

    expect(answer).toBe('final');
    expect(looks).toEqual(['start', 'final']);
  });

  it('still judges a late deadline only after one more look', async () => {
    let ready = false;
    let answer: string | null | undefined;
    void waker
      .wait(() => (ready ? 'ready' : null), { timeoutMs: 1_000 })
      .then((value) => (answer = value));
    // What the probe reads changes with no page change, and the deadline's wake comes late.
    ready = true;
    vi.setSystemTime(Date.now() + 5_000);
    await vi.advanceTimersByTimeAsync(1_005);

    expect(answer).toBe('ready');
  });

  it('wakes on a route the page reports, with no page change at all', async () => {
    let answer: string | null | undefined;
    void waker
      .wait(() => (location.pathname === '/c/next' ? 'moved' : null), { timeoutMs: 5_000 })
      .then((value) => (answer = value));
    window.history.pushState(null, '', '/c/next');
    report('route');
    await afterGap();

    expect(answer).toBe('moved');
    expect(waker.counts().route).toBe(1);
  });

  it('looks again on its recheck for what no wake reports', async () => {
    const startedAt = Date.now();
    let answer: boolean | null | undefined;
    void waker
      .wait(() => Date.now() - startedAt >= 1_500, { timeoutMs: 5_000, recheckMs: 250 })
      .then((value) => (answer = value));
    await vi.advanceTimersByTimeAsync(1_250);
    expect(answer).toBeUndefined();
    await vi.advanceTimersByTimeAsync(350);

    expect(answer).toBe(true);
  });

  it('keeps its recheck on time when the wait starts inside a throttled timer chain', async () => {
    const clock = throttleChainedTimers();
    try {
      const throttledWaker = createWaker({
        now: Date.now,
        defer: clock.defer,
        signal: controller.signal,
      });
      const startedAt = Date.now();
      let answer: boolean | null | undefined;
      // The op got here from a timer's task: a hidden tab runs what that task arms once a minute.
      setTimeout(() => {
        void throttledWaker
          .wait(() => Date.now() - startedAt >= 1_500, { timeoutMs: 20_000, recheckMs: 250 })
          .then((value) => (answer = value));
      }, 0);
      await clock.advance(2_500);

      expect(answer).toBe(true);
      throttledWaker.dispose();
    } finally {
      clock.restore();
    }
  });

  it('stops watching the page and leaves no timer once its wait is answered', async () => {
    const answered = waker.wait(() => target().dataset.v === 'done', {
      timeoutMs: 60_000,
      recheckMs: 1_000,
    });
    target().dataset.v = 'done';
    await afterGap();
    await expect(answered).resolves.toBe(true);
    const seen = waker.counts().mutation;

    target().dataset.v = 'again';
    await afterGap();
    expect(waker.counts().mutation).toBe(seen);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runs each deferred look once, in a message task, and none that was cancelled', async () => {
    vi.useRealTimers();
    const defer = createChannelDefer();
    const ran: string[] = [];
    defer(() => ran.push('first'));
    const cancel = defer(() => ran.push('cancelled'));
    defer(() => ran.push('second'));
    cancel();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(ran).toEqual(['first', 'second']);
  });

  it('rejects at once when the op is stopped', async () => {
    const waiting = waker.wait(() => null, { timeoutMs: 60_000 });
    controller.abort(new Error('stopped'));
    await expect(waiting).rejects.toThrow('stopped');
    expect(vi.getTimerCount()).toBe(0);
  });
});
