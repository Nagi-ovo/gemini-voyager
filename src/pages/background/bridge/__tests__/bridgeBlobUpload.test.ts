import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import type { OpName, ValidatedBridgeTask } from '@/features/bridge/protocol';

import { createBlobUploadRelay } from '../bridgeBlobUpload';
import { createBridgeDispatcher } from '../bridgeDispatcher';
import { createBridgeTabs } from '../bridgeTabs';
import { BRIDGE_SESSION_KEYS, createBridgeTaskStore } from '../bridgeTaskStore';
import { createPageLeaseArbiter } from '../pageLease';
import { contentSender, fakeServer, fakeTabs, testArea } from './bridgeTestKit';

const FILE = Buffer.from('id,value\n1,2\n');
const SHA256 = createHash('sha256').update(FILE).digest('hex');
const META = { name: 'report.csv', size: FILE.length, sha256: SHA256, mime: 'text/csv' };

function downloadTask(op: OpName = 'files.download'): ValidatedBridgeTask {
  const params =
    op === 'files.download'
      ? {
          conversationId: 'conv-1',
          assistantTurnKey: 'r-1',
          candidate: {
            kind: 'sandbox',
            label: 'report.csv',
            href: 'sandbox:/mnt/data/report.csv',
            controlRef: 'r-1',
          },
        }
      : { blobs: [{ blobId: 'b-up', ...META }] };
  return {
    taskId: 'T1',
    jobId: 'J1',
    op,
    opVersion: 1,
    params,
    deadlineMs: 300_000,
    issuedAt: 0,
  } as ValidatedBridgeTask;
}

async function setup(op: OpName = 'files.download') {
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
  const stored: Buffer[] = [];
  const client = {
    blobCreate: vi.fn(async () => ({ ok: true as const, status: 200, data: { blobId: 'blob-1' } })),
    blobWrite: vi.fn(async (_c: unknown, chunk: { base64: string }) => {
      stored.push(Buffer.from(chunk.base64, 'base64'));
      return { ok: true as const, status: 200, data: { received: true } };
    }),
    blobCommit: vi.fn(async () => {
      const whole = Buffer.concat(stored);
      return {
        ok: true as const,
        status: 200,
        data: {
          blobId: 'blob-1',
          size: whole.length,
          sha256: createHash('sha256').update(whole).digest('hex'),
        },
      };
    }),
  };
  const relay = createBlobUploadRelay({ store, client, connection, ready: async () => {}, now });
  const tab = page.addTab();
  await store.setTab({ tabId: tab.id, jobId: 'J1', openedAt: clock, docNonce: 'doc-1' });
  await dispatcher.onTask(downloadTask(op));
  const holder = { taskId: 'T1', docNonce: 'doc-1' };
  const sender = contentSender(tab.id);
  return {
    session,
    store,
    client,
    relay,
    sender,
    holder,
    tabId: tab.id,
    create: (overrides: Record<string, unknown> = {}) =>
      relay.create(sender, { ...holder, ...META, ...overrides }),
    write: (offset: number, bytes: Buffer, overrides: Record<string, unknown> = {}) =>
      relay.write(sender, {
        ...holder,
        blobId: 'blob-1',
        offset,
        base64: bytes.toString('base64'),
        ...overrides,
      }),
    commit: (blobId = 'blob-1') => relay.commit(sender, { ...holder, blobId }),
    advance: (ms: number) => (clock += ms),
  };
}

describe('bridge blob upload relay', () => {
  it('hands the running download to voyager serve as one blob of its job', async () => {
    const t = await setup();
    expect(await t.create()).toEqual({ ok: true, blobId: 'blob-1' });
    expect(t.client.blobCreate).toHaveBeenCalledWith(expect.anything(), {
      jobId: 'J1',
      taskId: 'T1',
      ...META,
    });
    t.advance(5_000);
    expect(await t.write(0, FILE.subarray(0, 8))).toEqual({ ok: true });
    expect(await t.write(8, FILE.subarray(8))).toEqual({ ok: true });
    // A long hand-over counts as progress, so the silence probe leaves it alone.
    expect((await t.store.listTasks())[0]?.lastProgressAt).toBe(1_800_000_005_000);
    expect(await t.commit()).toEqual({
      ok: true,
      blobId: 'blob-1',
      size: FILE.length,
      sha256: SHA256,
    });
  });

  it('refuses another document, another tab and another task', async () => {
    const t = await setup();
    const refused = [
      await t.create({ docNonce: 'doc-2' }),
      await t.create({ taskId: 'T9' }),
      await t.relay.create(contentSender(t.tabId + 1), { ...t.holder, ...META }),
    ];
    expect(refused.map((reply) => !reply.ok && reply.error.code)).toEqual([
      'unauthorized',
      'unauthorized',
      'unauthorized',
    ]);
    expect(t.client.blobCreate).not.toHaveBeenCalled();
  });

  it('refuses a blob from a running upload task, which only reads blobs', async () => {
    const t = await setup('composer.attach');
    expect((await t.store.listTasks())[0]?.state).toBe('running');
    const reply = await t.create();
    expect(!reply.ok && reply.error.code).toBe('unauthorized');
    const write = await t.write(0, FILE);
    expect(!write.ok && write.error.code).toBe('unauthorized');
    const commit = await t.commit();
    expect(!commit.ok && commit.error.code).toBe('unauthorized');
    expect(t.client.blobCreate).not.toHaveBeenCalled();
    expect(t.client.blobWrite).not.toHaveBeenCalled();
    expect(t.client.blobCommit).not.toHaveBeenCalled();
  });

  it('writes and commits only the one blob the task created, within its size', async () => {
    const t = await setup();
    const early = await t.write(0, FILE);
    expect(!early.ok && early.error.code).toBe('bad-request');
    await t.create();
    const replies = [
      await t.create(),
      await t.write(0, FILE, { blobId: 'blob-2' }),
      await t.write(4, FILE),
      await t.commit('blob-2'),
    ];
    expect(replies.map((reply) => !reply.ok && reply.error.code)).toEqual([
      'bad-request',
      'bad-request',
      'bad-request',
      'bad-request',
    ]);
    expect(t.client.blobCreate).toHaveBeenCalledTimes(1);
    expect(t.client.blobWrite).not.toHaveBeenCalled();
    expect(t.client.blobCommit).not.toHaveBeenCalled();
  });

  it('refuses a file name the server could take for a path', async () => {
    const t = await setup();
    const reply = await t.create({ name: '../report.csv' });
    expect(!reply.ok && reply.error.code).toBe('bad-request');
    expect(t.client.blobCreate).not.toHaveBeenCalled();
  });

  it('stops relaying once the task ended', async () => {
    const t = await setup();
    await t.create();
    await t.session.remove(BRIDGE_SESSION_KEYS.tasks);
    const reply = await t.write(0, FILE);
    expect(!reply.ok && reply.error.code).toBe('unauthorized');
    expect(t.client.blobWrite).not.toHaveBeenCalled();
  });
});
