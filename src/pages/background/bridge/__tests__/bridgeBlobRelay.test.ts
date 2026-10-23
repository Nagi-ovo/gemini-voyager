import { describe, expect, it, vi } from 'vitest';

import type { BlobChunk, ValidatedBridgeTask } from '@/features/bridge/protocol';

import { createBlobRelay } from '../bridgeBlobRelay';
import type { ClientResult } from '../bridgeClient';
import { createBridgeDispatcher } from '../bridgeDispatcher';
import { createBridgeTabs } from '../bridgeTabs';
import { BRIDGE_SESSION_KEYS, createBridgeTaskStore } from '../bridgeTaskStore';
import { ATTACH_LEASE_MAX_MS, createPageLeaseArbiter } from '../pageLease';
import { contentSender, fakeServer, fakeTabs, testArea } from './bridgeTestKit';

const BLOB = {
  blobId: 'b1',
  name: 'proj.zip',
  size: 3_000_000,
  sha256: 'a'.repeat(64),
  mime: 'application/zip',
};

function attachTask(taskId = 'T1', deadlineMs = 300_000): ValidatedBridgeTask {
  return {
    taskId,
    jobId: 'J1',
    op: 'composer.attach',
    opVersion: 1,
    params: { blobs: [BLOB] },
    deadlineMs,
    issuedAt: 0,
  };
}

async function setup(deadlineMs?: number) {
  const session = testArea();
  const store = createBridgeTaskStore({ session, local: testArea() });
  const page = fakeTabs();
  const server = fakeServer();
  let clock = 1_800_000_000_000;
  const now = () => clock;
  const lease = createPageLeaseArbiter({
    area: session,
    ready: async () => {},
    probe: async () => 'no-answer',
    now,
  });
  const pairing = { current: { serverId: 'srv-a', port: 47321, token: 't' } };
  const connection = async () => pairing.current;
  const dispatcher = createBridgeDispatcher({
    store,
    lease,
    policy: { checkOp: async () => null, refreshIfOld: async () => {} },
    tabs: createBridgeTabs({ store, api: page.api, now }),
    client: server.client,
    connection,
    ready: async () => {},
    now,
  });
  const served: { blobId: string; offset: number; length: number }[] = [];
  const client = {
    blobRead: vi.fn(
      async (
        _c: unknown,
        blobId: string,
        range: { offset: number; length: number },
      ): Promise<ClientResult<BlobChunk>> => {
        served.push({ blobId, ...range });
        const base64 = Buffer.alloc(range.length, 1).toString('base64');
        return { ok: true, status: 200, data: { blobId, offset: range.offset, base64 } };
      },
    ),
  };
  const relay = createBlobRelay({ store, client, connection, ready: async () => {}, now });
  const tab = page.addTab();
  await store.setTab({ tabId: tab.id, jobId: 'J1', openedAt: clock, docNonce: 'doc-1' });
  await dispatcher.onTask(attachTask('T1', deadlineMs));
  const read = (offset: number, length: number, overrides: Record<string, unknown> = {}) =>
    relay.read(contentSender(tab.id), {
      taskId: 'T1',
      docNonce: 'doc-1',
      blobId: 'b1',
      offset,
      length,
      ...overrides,
    });
  return {
    session,
    store,
    client,
    served,
    read,
    relay,
    pairing,
    tabId: tab.id,
    advance: (ms: number) => (clock += ms),
  };
}

describe('bridge blob relay', () => {
  it('serves the running attach chunks of the blob its params named', async () => {
    const t = await setup();
    t.advance(5_000);
    const reply = await t.read(1_048_576, 1_048_576);
    expect(reply.ok && Buffer.from(reply.base64, 'base64').length).toBe(1_048_576);
    expect(t.served).toEqual([{ blobId: 'b1', offset: 1_048_576, length: 1_048_576 }]);
    // A long upload counts as progress, so the silence probe leaves it alone.
    expect((await t.store.listTasks())[0]?.lastProgressAt).toBe(1_800_000_005_000);
  });

  it('reads nothing for a task of an earlier pairing from the server paired since', async () => {
    const t = await setup();
    t.pairing.current = { serverId: 'srv-b', port: 47322, token: 'u' };
    const reply = await t.read(0, 1024);
    expect(reply).toMatchObject({ ok: false, error: { code: 'not-paired' } });
    expect(t.served).toEqual([]);
  });

  it('refuses another document, another task and a blob the task did not name', async () => {
    const t = await setup();
    const refused = [
      await t.read(0, 10, { docNonce: 'doc-2' }),
      await t.read(0, 10, { taskId: 'T9' }),
      await t.read(0, 10, { blobId: 'b2' }),
      await t.relay.read(contentSender(t.tabId + 1), {
        taskId: 'T1',
        docNonce: 'doc-1',
        blobId: 'b1',
        offset: 0,
        length: 10,
      }),
    ];
    expect(refused.map((reply) => !reply.ok && reply.error.code)).toEqual([
      'unauthorized',
      'unauthorized',
      'bad-request',
      'unauthorized',
    ]);
    expect(t.served).toEqual([]);
  });

  it('refuses ranges outside the blob or above the chunk cap', async () => {
    const t = await setup();
    const replies = [
      await t.read(BLOB.size - 10, 11),
      await t.read(-1, 10),
      await t.read(0, 4 * 1024 * 1024 + 1),
      await t.read(0, 0),
    ];
    expect(replies.every((reply) => !reply.ok && reply.error.code === 'bad-request')).toBe(true);
    expect(t.served).toEqual([]);
  });

  it('refuses a chunk whose length differs from the one asked for', async () => {
    const t = await setup();
    t.client.blobRead.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: { blobId: 'b1', offset: 0, base64: Buffer.alloc(9).toString('base64') },
    });
    const reply = await t.read(0, 10);
    expect(!reply.ok && reply.error.code).toBe('hash-mismatch');
  });

  it('stops serving once the task ended', async () => {
    const t = await setup();
    await t.session.remove(BRIDGE_SESSION_KEYS.tasks);
    const reply = await t.read(0, 10);
    expect(!reply.ok && reply.error.code).toBe('unauthorized');
  });

  it('gives an upload a lease as long as its task budget, within the cap', async () => {
    const long = await setup(ATTACH_LEASE_MAX_MS * 2);
    const lease = long.session.values[BRIDGE_SESSION_KEYS.lease] as { deadline: number };
    const task = (await long.store.listTasks())[0];
    expect(lease.deadline - (task?.startedAt ?? 0)).toBe(ATTACH_LEASE_MAX_MS);

    const sized = await setup(300_000);
    const sizedLease = sized.session.values[BRIDGE_SESSION_KEYS.lease] as { deadline: number };
    const sizedTask = (await sized.store.listTasks())[0];
    expect(sizedLease.deadline - (sizedTask?.startedAt ?? 0)).toBe(300_000);
  });
});
