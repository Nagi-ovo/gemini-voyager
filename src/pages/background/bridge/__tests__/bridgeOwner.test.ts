import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { BRIDGE_SESSION_KEYS } from '../bridgeTaskStore';
import { contentSender } from './bridgeTestKit';
import { PAIRING, READ, TOKEN, json, setup } from './ownerTestKit';

describe('bridge owner', () => {
  it('matches a page report that wakes a fresh worker to the task stored before it stopped', async () => {
    const t = setup({
      local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING },
      session: {
        [BRIDGE_SESSION_KEYS.tasks]: [
          {
            taskId: 'T1',
            jobId: 'J1',
            op: 'turns.read',
            state: 'running',
            startedAt: 1,
            deadline: Number.MAX_SAFE_INTEGER,
            lastProgressAt: 1,
            progressSeq: 0,
            tabId: 100,
            docNonce: 'doc-1',
            serverId: 'srv1',
          },
        ],
      },
    });
    let hydrate!: () => void;
    t.session.gate = new Promise<void>((resolve) => {
      hydrate = resolve;
    });
    const reply = t.owner.handleMessage(
      {
        type: 'gv.bridge.op.done',
        taskId: 'T1',
        docNonce: 'doc-1',
        outcome: { ok: true, data: READ },
      },
      contentSender(100),
    );
    hydrate();
    t.session.gate = undefined;
    expect(await reply).toEqual({ ok: true });
    const posted = t.requests.find((r) => r.path === '/v1/ext/tasks/T1/result');
    expect(posted?.body).toEqual({ ok: true, data: READ });
    expect(posted?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('relays an upload chunk to the page holding the attach task, fetched with the token by POST', async () => {
    const t = setup({
      local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING },
      session: {
        [BRIDGE_SESSION_KEYS.tasks]: [
          {
            taskId: 'T1',
            jobId: 'J1',
            op: 'composer.attach',
            state: 'running',
            startedAt: 1,
            deadline: Number.MAX_SAFE_INTEGER,
            lastProgressAt: 1,
            progressSeq: 0,
            tabId: 100,
            docNonce: 'doc-1',
            serverId: 'srv1',
            blobs: [{ blobId: 'b1', size: 6 }],
          },
        ],
      },
    });
    t.routes['/v1/ext/blobs/b1/read'] = () =>
      json({ ok: true, data: { blobId: 'b1', offset: 2, base64: 'AAEC' } });
    const reply = await t.owner.handleMessage(
      {
        type: 'gv.bridge.blob.read',
        taskId: 'T1',
        docNonce: 'doc-1',
        blobId: 'b1',
        offset: 2,
        length: 3,
      },
      contentSender(100),
    );
    expect(reply).toEqual({ ok: true, base64: 'AAEC' });
    const fetched = t.requests.find((r) => r.path === '/v1/ext/blobs/b1/read');
    expect(fetched?.body).toEqual({ offset: 2, length: 3 });
    expect(fetched?.headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('pairs once when the permission arrives after the popup closed, and the late pair reuses that result', async () => {
    const t = setup();
    expect(await t.send({ type: 'gv.bridge.pairIntent', port: 47321, code: '1234-5678' })).toEqual({
      ok: true,
      data: { pending: true },
    });
    expect(t.requests).toHaveLength(0);

    t.origins.add('http://127.0.0.1/*');
    t.owner.onPermissionsAdded(['http://127.0.0.1/*']);
    await vi.waitFor(() => expect(t.local.values[StorageKeys.BRIDGE_PAIRING]).toBeDefined());
    expect(t.requests.find((r) => r.path === '/v1/pair')?.body).toMatchObject({ code: '12345678' });

    expect(await t.send({ type: 'gv.bridge.pair', port: 47321, code: '12345678' })).toEqual({
      ok: true,
      data: { serverId: 'srv1' },
    });
    expect(t.requests.filter((r) => r.path === '/v1/pair')).toHaveLength(1);
    expect(t.session.values[BRIDGE_SESSION_KEYS.pairIntent]).toBeUndefined();
  });

  it('pairs once when two requests bring the same code at the same time', async () => {
    const t = setup();
    t.origins.add('http://127.0.0.1/*');
    const message = { type: 'gv.bridge.pair', port: 47321, code: '12345678' };
    const [first, second] = await Promise.all([t.send(message), t.send(message)]);

    expect(t.requests.filter((r) => r.path === '/v1/pair')).toHaveLength(1);
    expect(first).toEqual({ ok: true, data: { serverId: 'srv1' } });
    expect(second).toEqual(first);
  });

  it('pairs when the same code is tried again after the first try failed', async () => {
    const t = setup();
    t.origins.add('http://127.0.0.1/*');
    const helloOk = t.routes['/v1/hello'];
    // Another program on the port answers the first try.
    t.routes['/v1/hello'] = () => new Response('Unsupported method', { status: 501 });
    const message = { type: 'gv.bridge.pair', port: 47321, code: '12345678' };
    expect(await t.send(message)).toMatchObject({ ok: false });

    t.routes['/v1/hello'] = helloOk;
    expect(await t.send(message)).toEqual({ ok: true, data: { serverId: 'srv1' } });
    expect(t.requests.filter((r) => r.path === '/v1/pair')).toHaveLength(1);
  });

  it('turns online updates on before it checks the catalog for a stale policy', async () => {
    const t = setup({ onlineUpdatesEnabled: false });
    const reply = await t.send({ type: 'gv.bridge.enableRefresh' });

    expect(t.settings.onlineUpdatesEnabled).toBe(true);
    expect(t.refreshes).toEqual([true]);
    expect(reply).toEqual({ ok: true, data: { policy: 'allowed' } });
    expect(await t.send({ type: 'gv.bridge.status' })).toMatchObject({
      data: { onlineUpdatesEnabled: true },
    });
  });

  it('names the side to upgrade when the protocol ranges do not meet', async () => {
    const t = setup();
    t.origins.add('http://127.0.0.1/*');
    t.routes['/v1/hello'] = () =>
      json({
        ok: true,
        data: {
          serverId: 'srv1',
          serverVersion: '9.0.0',
          protocol: { min: 2, max: 3, selected: 2 },
          paired: false,
        },
      });
    const reply = await t.send({ type: 'gv.bridge.pair', port: 47321, code: '12345678' });
    expect(reply).toMatchObject({
      ok: false,
      error: { code: 'protocol-mismatch', details: { upgrade: 'extension' } },
    });
    const status = await t.send({ type: 'gv.bridge.status' });
    expect(status).toMatchObject({
      ok: true,
      data: { lastError: { code: 'protocol-mismatch', upgrade: 'extension' }, paired: null },
    });
    expect(t.local.values[StorageKeys.BRIDGE_PAIRING]).toBeUndefined();
  });

  it('reports status in the shape the popup reads', async () => {
    const t = setup({ local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING } });
    t.origins.add('http://127.0.0.1/*');
    expect(await t.send({ type: 'gv.bridge.status' })).toEqual({
      ok: true,
      data: {
        permission: true,
        paired: { serverId: 'srv1', port: 47321, pairedAt: 1 },
        server: 'unknown',
        policy: 'allowed', // unstamped test build: the packaged chatgpt policy applies
        onlineUpdatesEnabled: true,
        parallel: false,
        parallelJobs: 3,
        activeTasks: [],
      },
    });
  });

  it('lists every running job in its status, oldest first', async () => {
    const record = (taskId: string, jobId: string, op: string) => ({
      taskId,
      jobId,
      op,
      state: 'running',
      startedAt: 1,
      deadline: Number.MAX_SAFE_INTEGER,
      lastProgressAt: 1,
      progressSeq: 0,
    });
    const t = setup({
      local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING },
      session: {
        [BRIDGE_SESSION_KEYS.tasks]: [
          record('T1', 'J1', 'turns.waitReply'),
          record('T2', 'J2', 'composer.send'),
        ],
      },
    });
    expect(await t.send({ type: 'gv.bridge.status' })).toMatchObject({
      data: {
        activeTasks: [
          { jobId: 'J1', op: 'turns.waitReply' },
          { jobId: 'J2', op: 'composer.send' },
        ],
      },
    });
  });

  it('keeps the parallel switch and count the popup sets, and refuses anything else', async () => {
    const t = setup({ local: { [StorageKeys.BRIDGE_PAIRING]: PAIRING } });
    for (const bad of [{ enabled: 'yes' }, { jobs: 1 }, { jobs: 11 }, { jobs: 2.5 }, {}]) {
      expect(await t.send({ type: 'gv.bridge.setParallel', ...bad })).toMatchObject({
        ok: false,
        error: { code: 'bad-request' },
      });
    }
    expect(await t.send({ type: 'gv.bridge.setParallel', enabled: true })).toEqual({
      ok: true,
      data: { parallel: true, parallelJobs: 3 },
    });
    expect(t.local.values[StorageKeys.BRIDGE_PARALLEL]).toBe(true);
    expect(await t.send({ type: 'gv.bridge.setParallel', jobs: 6 })).toEqual({
      ok: true,
      data: { parallel: true, parallelJobs: 6 },
    });
    expect(await t.send({ type: 'gv.bridge.status' })).toMatchObject({
      data: { parallel: true, parallelJobs: 6 },
    });

    // Off keeps the count, so turning it back on restores it.
    await t.send({ type: 'gv.bridge.setParallel', enabled: false });
    expect(t.local.values[StorageKeys.BRIDGE_PARALLEL]).toBeUndefined();
    expect(await t.send({ type: 'gv.bridge.status' })).toMatchObject({
      data: { parallel: false, parallelJobs: 6 },
    });
  });
});
