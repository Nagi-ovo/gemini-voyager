import { afterEach, describe, expect, it, vi } from 'vitest';

import { createBridgeClient } from '../bridgeClient';

const CONNECTION = { port: 47321, token: 'A'.repeat(43), protocol: 1 };
const POLL = { capabilities: { ops: [] }, inflight: [], policy: { revision: 0, state: 'allowed' } };

/**
 * A server that sends its headers and half a JSON body, then never ends it.
 * `honoursSignal`: the body errors once the request's signal aborts, as real fetch does.
 */
function stalledBody(honoursSignal: boolean) {
  const seen: { signal?: AbortSignal } = {};
  const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
    seen.signal = init?.signal ?? undefined;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"ok":true,"data":{"kind":'));
        if (honoursSignal) {
          seen.signal?.addEventListener('abort', () =>
            controller.error(new DOMException('aborted', 'AbortError')),
          );
        }
      },
    });
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  });
  return { seen, client: createBridgeClient(fetchImpl as unknown as typeof fetch) };
}

const settledWithin = async <T>(promise: Promise<T>, ms: number): Promise<T | 'hung'> =>
  Promise.race([promise, new Promise<'hung'>((resolve) => setTimeout(() => resolve('hung'), ms))]);

afterEach(() => {
  vi.useRealTimers();
});

describe('bridge client', () => {
  it('stops a poll whose body never ends when the caller aborts it', async () => {
    const { seen, client } = stalledBody(true);
    const stop = new AbortController();
    const reply = client.poll(CONNECTION, POLL as never, stop.signal);
    await new Promise((resolve) => setTimeout(resolve, 10));
    stop.abort();

    const result = await settledWithin(reply, 500);
    expect(result).not.toBe('hung');
    expect(seen.signal?.aborted).toBe(true);
    expect(result !== 'hung' && !result.ok && result.error.code).toBe('cancelled');
  });

  it('ends a request whose body never ends once its timeout runs out', async () => {
    vi.useFakeTimers();
    const { client } = stalledBody(false);
    let result: Awaited<ReturnType<typeof client.unpair>> | undefined;
    void client.unpair(CONNECTION).then((value) => (result = value));
    await vi.advanceTimersByTimeAsync(3_100);

    expect(result?.ok).toBe(false);
    expect(result && !result.ok && result.error.code).toBe('server-unreachable');
  });
});
