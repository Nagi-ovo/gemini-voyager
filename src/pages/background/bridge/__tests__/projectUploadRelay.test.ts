import { describe, expect, it, vi } from 'vitest';

import {
  type BlobChunk,
  type OpName,
  PROJECT_OP_NAMES,
  type ProjectOpName,
  type ValidatedBridgeTask,
  isOpName,
} from '@/features/bridge/protocol';

import { createBlobRelay } from '../bridgeBlobRelay';
import type { ClientResult } from '../bridgeClient';
import { createBridgeDispatcher } from '../bridgeDispatcher';
import { createBridgeTabs } from '../bridgeTabs';
import { createBridgeTaskStore } from '../bridgeTaskStore';
import { ATTACH_LEASE_MAX_MS, createPageLeaseArbiter, leaseDurationFor } from '../pageLease';
import { contentSender, fakeServer, fakeTabs, testArea } from './bridgeTestKit';

/** The project ops run once their registration lists them in `OpName`. */
const registered = PROJECT_OP_NAMES.every((op) => isOpName(op));
const asOp = (op: ProjectOpName): OpName => op as string as OpName;

const BLOB = {
  blobId: 'b1',
  name: 'repo.zip',
  size: 3_000_000,
  sha256: 'a'.repeat(64),
  mime: 'application/zip',
};

function uploadTask(): ValidatedBridgeTask {
  return {
    taskId: 'T1',
    jobId: 'J1',
    op: asOp('project.upload'),
    opVersion: 1,
    params: { projectId: `g-p-${'a1'.repeat(16)}`, blob: BLOB },
    deadlineMs: 300_000,
    issuedAt: 0,
  } as ValidatedBridgeTask;
}

async function setup() {
  const session = testArea();
  const store = createBridgeTaskStore({ session, local: testArea() });
  const page = fakeTabs();
  const server = fakeServer();
  const clock = 1_800_000_000_000;
  const now = () => clock;
  const lease = createPageLeaseArbiter({
    area: session,
    ready: async () => {},
    probe: async () => 'no-answer',
    now,
  });
  const connection = async () => ({ serverId: 'srv-a', port: 47321, token: 't' });
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
  const served: string[] = [];
  const client = {
    blobRead: vi.fn(
      async (
        _c: unknown,
        blobId: string,
        range: { offset: number; length: number },
      ): Promise<ClientResult<BlobChunk>> => {
        served.push(blobId);
        const base64 = Buffer.alloc(range.length, 1).toString('base64');
        return { ok: true, status: 200, data: { blobId, offset: range.offset, base64 } };
      },
    ),
  };
  const relay = createBlobRelay({ store, client, connection, ready: async () => {}, now });
  const tab = page.addTab();
  await store.setTab({ tabId: tab.id, jobId: 'J1', openedAt: clock, docNonce: 'doc-1' });
  await dispatcher.onTask(uploadTask());
  const read = (blobId: string) =>
    relay.read(contentSender(tab.id), {
      taskId: 'T1',
      docNonce: 'doc-1',
      blobId,
      offset: 0,
      length: 1024,
    });
  return { read, served, lease };
}

describe.runIf(registered)('bridge blob relay for project.upload', () => {
  it('serves a running project upload the chunks of the one blob it names', async () => {
    const t = await setup();
    const reply = await t.read('b1');
    expect(reply.ok && Buffer.from(reply.base64, 'base64').length).toBe(1024);
    expect(t.served).toEqual(['b1']);
  });

  it('refuses a blob the upload did not name', async () => {
    const t = await setup();
    const reply = await t.read('b2');
    expect(reply).toMatchObject({ ok: false, error: { code: 'bad-request' } });
    expect(t.served).toEqual([]);
  });

  it('leases the page for as long as the upload was budgeted, within the attach cap', async () => {
    expect(leaseDurationFor(asOp('project.upload'), 300_000)).toBe(300_000);
    expect(leaseDurationFor(asOp('project.upload'), 60 * 60_000)).toBe(ATTACH_LEASE_MAX_MS);
    const t = await setup();
    expect(await t.lease.current()).toMatchObject({ taskId: 'T1' });
  });
});
