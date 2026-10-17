import { describe, expect, it, vi } from 'vitest';

import { BRIDGE_SESSION_KEYS } from '../bridgeTaskStore';
import { type LeaseProbeOutcome, type PageLease, createPageLeaseArbiter } from '../pageLease';
import { testArea } from './bridgeTestKit';

const request = (taskId: string, tabId = 1, docNonce = `nonce-${tabId}`) => ({
  taskId,
  op: 'composer.send' as const,
  tabId,
  docNonce,
  durationMs: 30_000,
});

function arbiter(options: { probe?: (lease: PageLease) => Promise<LeaseProbeOutcome> } = {}) {
  const area = testArea();
  let clock = 1_000_000;
  let id = 0;
  const probe = vi.fn(options.probe ?? (async () => 'no-answer' as const));
  const lease = createPageLeaseArbiter({
    area,
    ready: async () => {},
    probe,
    now: () => clock,
    randomId: () => `lease-${++id}`,
  });
  return {
    area,
    lease,
    probe,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('page lease', () => {
  it('grants only one of two interleaved acquires', async () => {
    const { lease } = arbiter();
    const results = await Promise.all([
      lease.acquire(request('A', 1)),
      lease.acquire(request('B', 2)),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([{ ok: false, code: 'busy' }]);
  });

  it('answers busy for a live lease instead of waiting for it', async () => {
    const { lease } = arbiter();
    await lease.acquire(request('A'));
    expect(await lease.acquire(request('B', 2))).toEqual({ ok: false, code: 'busy' });
  });

  it('does not let a late release drop a newer lease', async () => {
    const { lease, advance } = arbiter({ probe: async () => 'gone' });
    const first = await lease.acquire(request('A'));
    if (!first.ok) throw new Error('first acquire must succeed');
    advance(31_000);
    const second = await lease.acquire(request('B', 2));
    expect(second.ok).toBe(true);

    expect(await lease.release(first.lease.leaseId)).toBe(false);
    expect((await lease.current())?.taskId).toBe('B');
  });

  it('keeps an expired lease when its page cannot confirm it stopped', async () => {
    const { lease, area, advance, probe } = arbiter({ probe: async () => 'no-answer' });
    await lease.acquire(request('A'));
    advance(31_000);

    expect(await lease.acquire(request('B', 2))).toEqual({ ok: false, code: 'busy-stale' });
    expect(probe).toHaveBeenCalledOnce();
    expect(area.values[BRIDGE_SESSION_KEYS.lease]).toMatchObject({ taskId: 'A', status: 'stale' });
  });

  it('refuses a takeover while the old page says it is still running', async () => {
    const { lease, advance } = arbiter({ probe: async () => 'running' });
    await lease.acquire(request('A'));
    advance(31_000);
    expect(await lease.acquire(request('B', 2))).toEqual({ ok: false, code: 'busy-stale' });
  });

  it('treats a page that never answers the probe as still running', async () => {
    vi.useFakeTimers();
    try {
      const { lease, advance } = arbiter({ probe: () => new Promise(() => {}) });
      const first = lease.acquire(request('A'));
      await vi.advanceTimersByTimeAsync(50);
      expect((await first).ok).toBe(true);
      advance(31_000);
      const pending = lease.acquire(request('B', 2));
      await vi.advanceTimersByTimeAsync(2_500);
      expect(await pending).toEqual({ ok: false, code: 'busy-stale' });
    } finally {
      vi.useRealTimers();
    }
  });

  it.each(['gone', 'stopped'] as const)(
    'hands an expired lease over once the old document is %s',
    async (outcome) => {
      const { lease, advance } = arbiter({ probe: async () => outcome });
      await lease.acquire(request('A'));
      advance(31_000);
      const next = await lease.acquire(request('B', 2));
      expect(next.ok && next.lease.taskId).toBe('B');
    },
  );

  it('grants nothing when the lease cannot be read or written', async () => {
    const { lease, area } = arbiter();
    area.failNextGet = true;
    expect(await lease.acquire(request('A'))).toEqual({ ok: false, code: 'busy' });
    area.failNextSet = true;
    expect(await lease.acquire(request('A'))).toEqual({ ok: false, code: 'busy' });
    expect(await lease.current()).toBeNull();
  });

  it('waits for the session state to be read back before deciding', async () => {
    const area = testArea({
      [BRIDGE_SESSION_KEYS.lease]: {
        leaseId: 'old',
        taskId: 'A',
        op: 'composer.send',
        tabId: 1,
        docNonce: 'n',
        issuedAt: 0,
        deadline: Number.MAX_SAFE_INTEGER,
        status: 'active',
      },
    });
    let hydrated!: () => void;
    const ready = new Promise<void>((resolve) => {
      hydrated = resolve;
    });
    const lease = createPageLeaseArbiter({ area, ready: () => ready, probe: async () => 'gone' });
    const pending = lease.acquire(request('B', 2));
    hydrated();
    expect(await pending).toEqual({ ok: false, code: 'busy' });
  });

  it('ends the lease of a tab that closed', async () => {
    const { lease } = arbiter();
    await lease.acquire(request('A', 7));
    expect(await lease.releaseForTab(8)).toBe(false);
    expect(await lease.releaseForTab(7)).toBe(true);
    expect((await lease.acquire(request('B', 9))).ok).toBe(true);
  });
});
