import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import type { ErrorCode, OpName, ValidatedBridgeTask } from '@/features/bridge/protocol';
import type { HostCatalogCacheEntry } from '@/features/plugins/remote/hostCatalogCache';

import { createBridgeDispatcher } from '../bridgeDispatcher';
import { BRIDGE_PLUGIN_ID, createBridgePolicy } from '../bridgePolicy';
import { createBridgeTabs } from '../bridgeTabs';
import { BRIDGE_SESSION_KEYS, createBridgeTaskStore } from '../bridgeTaskStore';
import { type LeaseProbeOutcome, createPageLeaseArbiter } from '../pageLease';
import { contentSender, fakeServer, fakeTabs, testArea } from './bridgeTestKit';

const READY = {
  url: 'https://chatgpt.com/',
  conversationId: null,
  loggedIn: true,
  mode: 'chat',
  evidence: {},
};
const SENT = {
  conversationId: 'abc-123',
  url: 'https://chatgpt.com/c/abc-123',
  userTurnKey: 't-7',
};
const READ = { markdown: 'OK', turnKey: 't-8', textSha256: '0'.repeat(64), files: [] };

const PARAMS: Partial<Record<OpName, unknown>> = {
  'conversation.open': { new: true },
  'composer.send': { text: 'Reply with OK' },
  'turns.read': { conversationId: 'abc-123', assistantTurnKey: 't-8' },
  'model.select': { target: { preset: 'pro' } },
};

function task(op: OpName, taskId: string, jobId = 'J1'): ValidatedBridgeTask {
  return {
    taskId,
    jobId,
    op,
    opVersion: 1,
    params: PARAMS[op] ?? {},
    deadlineMs: 60_000,
    issuedAt: 0,
  } as ValidatedBridgeTask;
}

interface SetupOptions {
  readonly probe?: () => Promise<LeaseProbeOutcome>;
}

function setup(options: SetupOptions = {}) {
  const session = testArea();
  const local = testArea();
  const store = createBridgeTaskStore({ session, local });
  const page = fakeTabs();
  const server = fakeServer();
  let clock = 1_800_000_000_000;
  const now = () => clock;
  const policy = {
    denied: null as { code: 'policy-denied'; message: string } | null,
    checkOp: vi.fn(async () => policy.denied),
    refreshIfOld: vi.fn(async () => {}),
  };
  const lease = createPageLeaseArbiter({
    area: session,
    ready: async () => {},
    probe: options.probe ?? (async () => 'no-answer'),
    now,
  });
  const tabs = createBridgeTabs({ store, api: page.api, now });
  const make = (
    checkOp: (op: OpName) => Promise<{ code: ErrorCode; message: string } | null> = policy.checkOp,
  ) =>
    createBridgeDispatcher({
      store,
      lease,
      policy: { checkOp, refreshIfOld: policy.refreshIfOld },
      tabs,
      client: server.client,
      connection: async () => ({ port: 47321, token: 't' }),
      ready: async () => {},
      now,
    });
  const dispatcher = make();
  /** A loaded bridge tab whose document said hello. */
  const bridgeTab = async (docNonce = 'doc-1', active = true) => {
    const tab = page.addTab({ active });
    await store.setTab({ tabId: tab.id, jobId: 'J1', openedAt: clock, docNonce });
    return tab.id;
  };
  const resultOf = (taskId: string) =>
    server.results().find((call) => call.taskId === taskId)?.body as
      | { ok: boolean; data?: unknown; error?: { code: string } }
      | undefined;
  return {
    session,
    local,
    store,
    page,
    server,
    policy,
    lease,
    dispatcher,
    make,
    bridgeTab,
    resultOf,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('bridge dispatcher', () => {
  it('runs an op in the bridge tab and reports what the page returned', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));

    const [start] = t.page.starts();
    expect(start.tabId).toBe(tabId);
    expect(start.message.grant).toMatchObject({ docNonce: 'doc-1' });
    expect(t.server.calls[0]).toEqual({ kind: 'ack', taskId: 'T1' });

    const done = { taskId: 'T1', docNonce: 'doc-1', outcome: { ok: true, data: READ } };
    expect(await t.dispatcher.onDone(contentSender(tabId), done)).toBe(true);
    expect(t.resultOf('T1')).toEqual({ ok: true, data: READ });
    expect(await t.dispatcher.current()).toBeNull();

    // The page retries a report it thinks was lost: only the first one counts.
    expect(await t.dispatcher.onDone(contentSender(tabId), done)).toBe(false);
    expect(t.server.results()).toHaveLength(1);
  });

  it('answers busy to a second task instead of queueing it', async () => {
    const t = setup();
    await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    await t.dispatcher.onTask(task('turns.read', 'T2'));

    expect(t.page.starts()).toHaveLength(1);
    expect(t.resultOf('T2')).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect((await t.dispatcher.current())?.taskId).toBe('T1');
  });

  it('never runs a redelivered task twice', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    expect(t.page.starts()).toHaveLength(1);
    expect(t.server.calls.filter((c) => c.kind === 'ack')).toHaveLength(2);

    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: READ },
    });
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    expect(t.page.starts()).toHaveLength(1);
    expect(t.server.results()).toHaveLength(1);
  });

  it('holds a lease for a page-event op and frees it when the page reports', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    const grant = t.page.starts()[0].message.grant as { leaseId?: string; deadline: number };
    expect(grant.leaseId).toEqual(expect.any(String));
    expect((await t.lease.current())?.leaseId).toBe(grant.leaseId);

    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: SENT },
    });
    expect(await t.lease.current()).toBeNull();
    expect(t.resultOf('T1')).toEqual({ ok: true, data: SENT });
  });

  it('refuses an interactive op in a background tab', async () => {
    const t = setup();
    await t.bridgeTab('doc-1', false);
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    expect(t.page.starts()).toHaveLength(0);
    expect(t.resultOf('T1')).toMatchObject({ ok: false, error: { code: 'tab-hidden' } });
  });

  it('refuses an op this build cannot run, without acknowledging it', async () => {
    const t = setup();
    await t.bridgeTab();
    await t.dispatcher.onTask(task('model.select', 'T1'));
    expect(t.server.calls).toEqual([
      expect.objectContaining({ kind: 'result', body: expect.objectContaining({ ok: false }) }),
    ]);
    expect(t.resultOf('T1')?.error?.code).toBe('unsupported-op');
  });

  it('turns a malformed page result into unverified', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: { markdown: 1 } },
    });
    expect(t.resultOf('T1')?.error?.code).toBe('unverified');
  });

  it('ignores reports from another document or tab', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    const outcome = { ok: true, data: READ };
    expect(
      await t.dispatcher.onDone(contentSender(tabId), { taskId: 'T1', docNonce: 'other', outcome }),
    ).toBe(false);
    expect(
      await t.dispatcher.onDone(contentSender(tabId + 1), {
        taskId: 'T1',
        docNonce: 'doc-1',
        outcome,
      }),
    ).toBe(false);
    expect(t.server.results()).toHaveLength(0);
  });

  it('fails the task and frees the page when the bridge tab closes', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    await t.dispatcher.onTabRemoved(tabId);
    expect(t.resultOf('T1')?.error?.code).toBe('tab-closed');
    expect(await t.lease.current()).toBeNull();
    expect(await t.store.getTab()).toBeNull();
  });

  it('keeps the page closed to a new op while an expired holder stays silent, and lets its late report free it', async () => {
    const t = setup({ probe: async () => 'no-answer' });
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    t.advance(60_000 + 30_001); // past the task deadline and its grace
    await t.dispatcher.tick();
    expect(t.resultOf('T1')?.error?.code).toBe('timeout');
    expect(t.page.sent.some((s) => s.message.type === 'gv.bridge.op.cancel')).toBe(true);

    await t.dispatcher.onTask(task('composer.send', 'T2'));
    expect(t.resultOf('T2')?.error?.code).toBe('busy-stale');
    expect(t.page.starts()).toHaveLength(1);

    // The frozen page resumes and reports T1: no second result, but its lease ends.
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: SENT },
    });
    expect(t.server.results().filter((r) => r.taskId === 'T1')).toHaveLength(1);
    expect(await t.lease.current()).toBeNull();
    await t.dispatcher.onTask(task('composer.send', 'T3'));
    expect(t.page.starts()).toHaveLength(2);
  });

  it('stops a running op when the policy turns it off', async () => {
    const t = setup();
    await t.bridgeTab();
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    t.policy.denied = { code: 'policy-denied', message: 'revoked' };
    await t.dispatcher.recheckPolicy();

    expect(t.resultOf('T1')?.error?.code).toBe('policy-denied');
    expect(
      t.page.sent.find((s) => s.message.type === 'gv.bridge.op.cancel')?.message,
    ).toMatchObject({
      taskId: 'T1',
      reason: 'policy-denied',
    });
    // The page has not confirmed it stopped, so it keeps the lease until the arbiter knows.
    expect((await t.lease.current())?.taskId).toBe('T1');
  });

  it('opens a tab, waits for its hello, then reports the ready page', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    const created = vi.mocked(t.page.api.create).mock.calls[0][0];
    expect(created).toEqual({ url: 'https://chatgpt.com/', active: true });
    const tabId = (await t.store.getTab())!.tabId;

    expect(await t.dispatcher.onHello(contentSender(tabId + 5), 'stranger')).toBe(false);
    expect(t.page.starts()).toHaveLength(0);

    await t.dispatcher.onHello(contentSender(tabId, 'DOC'), 'doc-9');
    const [start] = t.page.starts();
    expect(start).toMatchObject({ tabId, documentId: 'DOC' });
    expect(start.message.task).toMatchObject({ taskId: 'T1', op: 'conversation.ready' });

    await t.dispatcher.onDone(contentSender(tabId, 'DOC'), {
      taskId: 'T1',
      docNonce: 'doc-9',
      outcome: { ok: true, data: READY },
    });
    expect(t.resultOf('T1')).toEqual({
      ok: true,
      data: { tabId, url: READY.url, documentId: 'DOC', docNonce: 'doc-9', ready: READY },
    });
  });

  it('gives up on a tab whose page never says hello', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    t.advance(30_001);
    await t.dispatcher.tick();
    expect(t.resultOf('T1')?.error?.code).toBe('timeout');
  });

  it('closes only the tab this job opened', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    const close = (jobId: string, id: string) =>
      t.dispatcher.onTask({
        ...task('conversation.close', id, jobId),
        params: { tabId },
      } as ValidatedBridgeTask);
    await close('J2', 'T1');
    expect(t.resultOf('T1')?.error?.code).toBe('bad-request');
    await close('J1', 'T2');
    expect(t.resultOf('T2')).toEqual({ ok: true, data: { closed: true } });
    expect(t.page.tabs.has(tabId)).toBe(false);
  });

  it('keeps a result the server could not take and hands it over on the next poll', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    t.server.state.unreachable = true;
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: READ },
    });
    expect(await t.dispatcher.inflight()).toEqual([{ taskId: 'T1', state: 'running' }]);
    expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]).toHaveLength(1);

    t.server.state.unreachable = false;
    expect(await t.dispatcher.drainOutbox()).toBe(true);
    expect(t.resultOf('T1')).toEqual({ ok: true, data: READ });
    expect(await t.dispatcher.inflight()).toEqual([]);
  });

  it('refuses a dispatch whose policy was revoked while it waited for the page', async () => {
    const t = setup();
    await t.bridgeTab();
    const local = testArea({
      [StorageKeys.PLUGINS_STATE]: { [BRIDGE_PLUGIN_ID]: { enabled: true, installedAt: 1 } },
    });
    const site = (revision: number, allow: OpName[]) => ({
      id: 'chatgpt',
      label: 'ChatGPT',
      matches: ['https://chatgpt.com/*'],
      selectors: {},
      theme: { hostSelector: 'html', lightSelector: 'html.l', darkSelector: 'html.d' },
      catalogRevision: revision,
      bridge: { format: 1, allow },
    });
    let entry: HostCatalogCacheEntry = {
      host: 'chatgpt.com',
      status: 'ok',
      manifests: [],
      fetchedAt: 1_800_000_000_000,
      lastAttemptAt: 1_800_000_000_000,
      failureCount: 0,
      extensionVersion: 'test',
      site: site(10, ['composer.send']),
    } as unknown as HostCatalogCacheEntry;
    const policy = createBridgePolicy({
      local,
      loadEntry: async () => entry,
      packaged: null,
      extensionVersion: 'test',
      hasOrigin: async () => true,
      refreshCatalog: async () => {},
      loadOnlineUpdatesEnabled: async () => true,
      now: () => 1_800_000_000_000,
    });
    // The catalog refresher lands a revoking revision while the lease is being written.
    t.session.onWrite = (keys) => {
      if (keys.includes(BRIDGE_SESSION_KEYS.lease))
        entry = { ...entry, site: site(11, []) } as unknown as HostCatalogCacheEntry;
    };
    const dispatcher = t.make(policy.checkOp);
    await dispatcher.onTask(task('composer.send', 'T1'));

    expect(t.page.starts()).toHaveLength(0);
    expect(t.resultOf('T1')?.error?.code).toBe('policy-denied');
    expect(await t.lease.current()).toBeNull();

    // An older allowing copy arriving afterwards cannot undo the revocation.
    t.session.onWrite = undefined;
    entry = { ...entry, site: site(10, ['composer.send']) } as unknown as HostCatalogCacheEntry;
    await dispatcher.onTask(task('composer.send', 'T2'));
    expect(t.resultOf('T2')?.error?.code).toBe('policy-stale');
  });
});
