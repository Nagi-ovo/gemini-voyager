import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { PairResponse } from '@/features/bridge/protocol';

import type { BridgeClient, ClientResult } from '../bridgeClient';
import { createBridgePairing } from '../bridgePairing';
import { testArea } from './bridgeTestKit';

const HELLO = {
  serverId: 'srv-a',
  serverVersion: '0.1.0',
  protocol: { min: 1, max: 1, selected: 1 },
  paired: false,
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

/** Each pair request waits until the test answers it with that code's server. */
function setup() {
  const local = testArea();
  const session = testArea();
  const pending = new Map<string, ReturnType<typeof deferred<ClientResult<PairResponse>>>>();
  const unpaired: string[] = [];
  let unpairHangs = false;
  const client = {
    hello: vi.fn(async () => ({ ok: true, status: 200, data: HELLO })),
    pair: vi.fn((_connection, request: { code: string }) => {
      const answer = deferred<ClientResult<PairResponse>>();
      pending.set(request.code, answer);
      return answer.promise;
    }),
    unpair: vi.fn(async (connection: { token?: string }) => {
      unpaired.push(connection.token ?? '');
      if (unpairHangs) return new Promise<never>(() => {});
      return { ok: true, status: 200, data: {} };
    }),
  } as unknown as BridgeClient;
  const onPaired = vi.fn();
  const pairing = createBridgePairing({
    local,
    session,
    client,
    browser: 'chrome',
    hasLoopbackPermission: async () => true,
    onPaired,
  });
  const answer = (code: string, serverId: string, token: string) =>
    pending.get(code)?.resolve({ ok: true, status: 200, data: { serverId, token } });
  const until = async (code: string) => {
    for (let i = 0; i < 50 && !pending.has(code); i += 1) await new Promise((r) => setTimeout(r));
  };
  const stored = () =>
    local.values[StorageKeys.BRIDGE_PAIRING] as { serverId: string; token: string } | undefined;
  const hangUnpair = () => {
    unpairHangs = true;
  };
  return { pairing, answer, until, stored, onPaired, unpaired, hangUnpair };
}

const TOKEN_A = 'A'.repeat(43);
const TOKEN_B = 'B'.repeat(43);

describe('bridge pairing', () => {
  it('keeps the newer pairing when an older pair request answers last', async () => {
    const t = setup();
    const first = t.pairing.pair({ port: 47321, code: '11111111' });
    await t.until('11111111');
    const second = t.pairing.pair({ port: 47322, code: '22222222' });
    await t.until('22222222');
    t.answer('22222222', 'srv-b', TOKEN_B);
    expect((await second).state).toBe('paired');

    t.answer('11111111', 'srv-a', TOKEN_A);
    expect((await first).state).not.toBe('paired');
    expect(t.stored()).toMatchObject({ serverId: 'srv-b', token: TOKEN_B });
    expect(t.onPaired).toHaveBeenCalledTimes(1);
    expect(t.pairing.lastAttempt().state).toBe('paired');
  });

  it('stays unpaired when a pair request still in flight answers after the unpair', async () => {
    const t = setup();
    const attempt = t.pairing.pair({ port: 47321, code: '11111111' });
    await t.until('11111111');
    await t.pairing.unpair();

    t.answer('11111111', 'srv-a', TOKEN_A);
    expect((await attempt).state).not.toBe('paired');
    expect(t.stored()).toBeUndefined();
    expect(t.onPaired).not.toHaveBeenCalled();
    // The token the server handed out late is given back.
    await vi.waitFor(() => expect(t.unpaired).toContain(TOKEN_A));
  });

  it('forgets the pairing here even while the server never answers the unpair', async () => {
    const t = setup();
    const attempt = t.pairing.pair({ port: 47321, code: '11111111' });
    await t.until('11111111');
    t.answer('11111111', 'srv-a', TOKEN_A);
    await attempt;
    t.hangUnpair();

    void t.pairing.unpair();
    await vi.waitFor(() => expect(t.unpaired).toContain(TOKEN_A));
    expect(t.stored()).toBeUndefined();
  });
});
