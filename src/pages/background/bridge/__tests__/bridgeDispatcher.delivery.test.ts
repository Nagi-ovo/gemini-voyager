import { describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { type OpName } from '@/features/bridge/protocol';
import type { HostCatalogCacheEntry } from '@/features/plugins/remote/hostCatalogCache';

import { BRIDGE_PLUGIN_ID, createBridgePolicy } from '../bridgePolicy';
import { BRIDGE_SESSION_KEYS } from '../bridgeTaskStore';
import { contentSender, testArea } from './bridgeTestKit';
import { READ, SERVER_A, SERVER_B, setup, task } from './dispatcherTestKit';

describe('bridge dispatcher: results, stops and pairings', () => {
  it('keeps a finished task in flight until the server has taken its result', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    let answer!: () => void;
    t.server.client.result.mockImplementationOnce(async (_c, taskId, body) => {
      t.server.calls.push({ kind: 'result', taskId, body });
      await new Promise<void>((resolve) => {
        answer = resolve;
      });
      return { ok: true, status: 200, data: {} };
    });
    const done = t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: READ },
    });
    await vi.waitFor(() => expect(t.server.results()).toHaveLength(1));
    // A poll that leaves while the result is on its way must still list the task.
    expect(await t.dispatcher.inflight()).toEqual([{ taskId: 'T1', state: 'running' }]);

    answer();
    await done;
    expect(await t.dispatcher.inflight()).toEqual([]);
    expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]).toBeUndefined();
  });

  it('hands over a result whose worker stopped while reporting it', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    // The worker is stopped mid-POST: this request never answers.
    t.server.client.result.mockImplementationOnce(() => new Promise(() => {}));
    void t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: READ },
    });
    await vi.waitFor(() => expect(t.server.client.result).toHaveBeenCalledTimes(1));

    const restarted = t.make();
    expect(await restarted.inflight()).toEqual([{ taskId: 'T1', state: 'running' }]);
    expect(await restarted.drainOutbox()).toBe(true);
    expect(t.resultOf('T1')).toEqual({ ok: true, data: READ });
    expect(await restarted.inflight()).toEqual([]);
  });

  it('reports a cancelled op only once its page confirms it stopped', async () => {
    const t = setup();
    await t.bridgeTab();
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    let stopped = false;
    t.page.state.onMessage = (_tabId, message) =>
      message.type === 'gv.bridge.op.cancel' ? { stopped } : { accepted: true };
    const cancels = () => t.page.sent.filter((s) => s.message.type === 'gv.bridge.op.cancel');

    await t.dispatcher.onAbort('T1', 'cancelled');
    expect(t.resultOf('T1')).toBeUndefined();
    expect(await t.dispatcher.inflight()).toEqual([{ taskId: 'T1', state: 'running' }]);

    // The server repeats its abort; the watchdog asks too. Each only asks the page again.
    await t.dispatcher.onAbort('T1', 'cancelled');
    await t.dispatcher.tick();
    expect(cancels()).toHaveLength(3);
    expect(t.page.starts()).toHaveLength(1);
    expect(t.resultOf('T1')).toBeUndefined();

    stopped = true;
    await t.dispatcher.onAbort('T1', 'cancelled');
    expect(t.resultOf('T1')?.error?.code).toBe('cancelled');
    expect(await t.lease.current()).toBeNull();
    expect(await t.dispatcher.inflight()).toEqual([]);
  });

  it('keeps polling when a frozen page never answers the cancel', async () => {
    const t = setup();
    await t.bridgeTab();
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    t.page.state.onMessage = (_tabId, message) =>
      message.type === 'gv.bridge.op.cancel' ? new Promise(() => {}) : { accepted: true };
    // Resolving at all is the point: the poll loop awaits this call.
    await t.make(undefined, { cancelReplyTimeoutMs: 20 }).onAbort('T1', 'cancelled');
    expect(t.resultOf('T1')).toBeUndefined();
    expect(await t.dispatcher.inflight()).toEqual([{ taskId: 'T1', state: 'running' }]);
  });

  it('reports a cancelled op once its tab is gone', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    t.page.state.onMessage = (_tabId, message) =>
      message.type === 'gv.bridge.op.cancel' ? { stopped: false } : { accepted: true };
    await t.dispatcher.onAbort('T1', 'cancelled');
    expect(t.resultOf('T1')).toBeUndefined();

    await t.dispatcher.onTabRemoved(tabId);
    expect(t.resultOf('T1')?.error?.code).toBe('cancelled');
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

  it('never runs a task whose ack the server refused', async () => {
    for (const code of ['gone', 'unauthorized', 'not-found', 'server-unreachable'] as const) {
      const t = setup();
      await t.bridgeTab();
      t.server.state.ackReply = {
        ok: false,
        status: code === 'server-unreachable' ? 0 : 410,
        error: { code, category: 'data', message: 'refused' },
      };
      await t.dispatcher.onTask(task('composer.send', 'T1'));
      expect(t.page.starts()).toEqual([]);
      expect(t.page.api.create).not.toHaveBeenCalled();
      expect(await t.lease.current()).toBeNull();
      expect(await t.dispatcher.tasks()).toEqual([]);
      expect(t.policy.checkOp).not.toHaveBeenCalled();
    }
  });

  it('never opens a tab for a conversation.open whose ack the server refused', async () => {
    const t = setup();
    t.server.state.ackReply = {
      ok: false,
      status: 410,
      error: { code: 'gone', category: 'data', message: 'ended' },
    };
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    expect(t.page.api.create).not.toHaveBeenCalled();
  });

  it('never hands a stored result of an earlier pairing to the server paired after it', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    t.server.state.unreachable = true;
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: READ },
    });
    expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]).toHaveLength(1);

    // Unpair A, pair B; B comes up reachable.
    t.pairing.current = SERVER_B;
    t.server.state.unreachable = false;
    expect(await t.dispatcher.inflight()).toEqual([]);
    expect(await t.dispatcher.drainOutbox()).toBe(true);
    expect(t.server.results()).toEqual([]);
    expect(t.local.values[StorageKeys.BRIDGE_OUTBOX] ?? []).toEqual([]);
  });

  it('reports a running task only to the server that sent it', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    t.pairing.current = SERVER_B;
    expect(await t.dispatcher.inflight()).toEqual([]);
    await t.dispatcher.onProgress(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      progress: { phase: 'reading' },
    });
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: READ },
    });
    expect(t.server.calls.filter((call) => call.kind !== 'ack')).toEqual([]);
    expect(t.server.resultPorts).toEqual([]);
  });

  it('runs nothing from a poll of a pairing that has since been replaced', async () => {
    const t = setup();
    await t.bridgeTab();
    t.pairing.current = SERVER_B;
    await t.dispatcher.onTask(task('turns.read', 'T1'), SERVER_A);
    expect(t.page.starts()).toEqual([]);
    expect(t.server.calls).toEqual([]);
  });
});
