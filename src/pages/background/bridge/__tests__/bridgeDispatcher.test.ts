import { describe, expect, it, vi } from 'vitest';

import { logger } from '@/core/services/LoggerService';
import { type ValidatedBridgeTask, WAIT_REPLY_MAX_TIMEOUT_MS } from '@/features/bridge/protocol';

import { contentSender } from './bridgeTestKit';
import { READ, SENT, setup, task } from './dispatcherTestKit';

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
    expect(await t.dispatcher.tasks()).toEqual([]);

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
    expect((await t.dispatcher.tasks())[0]?.taskId).toBe('T1');
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

  it('runs an interactive op in a background tab', async () => {
    const t = setup();
    await t.bridgeTab('doc-1', false);
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    expect(t.page.starts()).toHaveLength(1);
    expect(t.resultOf('T1')).toBeUndefined();
  });

  it('opens the bridge tab in the background', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    expect(t.page.api.create).toHaveBeenCalledWith({ url: 'https://chatgpt.com/', active: false });
  });

  it('reports a frozen tab instead of a lost document', async () => {
    const info = vi.spyOn(logger, 'info');
    const t = setup();
    const tabId = await t.bridgeTab('doc-1', false);
    await t.dispatcher.onTask({
      ...task('turns.waitReply', 'T1'),
      params: { conversationId: 'abc-123', afterUserTurnKey: 't-7' },
      deadlineMs: WAIT_REPLY_MAX_TIMEOUT_MS + 30_000,
    } as ValidatedBridgeTask);
    const probes = () => t.page.sent.filter((s) => s.message.type === 'gv.bridge.lease.probe');
    // Frozen, its document answers nothing.
    t.page.tabs.get(tabId)!.frozen = true;
    t.page.state.onMessage = () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    };
    t.advance(5 * 60_000);
    await t.dispatcher.tick();

    expect(t.server.results()).toEqual([]);
    expect(probes()).toHaveLength(0);
    expect((await t.dispatcher.tasks())[0]?.taskId).toBe('T1');
    expect(info).toHaveBeenCalledWith(expect.any(String), {
      taskId: 'T1',
      reason: 'tab-frozen',
    });

    // Thawed, it is probed again and answers.
    t.page.tabs.get(tabId)!.frozen = false;
    t.page.state.onMessage = () => ({ stopped: false });
    await t.dispatcher.tick();
    expect(probes()).toHaveLength(1);
    expect(t.server.results()).toEqual([]);
    info.mockRestore();
  });

  it('starts model.select in the page under its 25 s lease', async () => {
    const t = setup();
    await t.bridgeTab();
    await t.dispatcher.onTask(task('model.select', 'T1'));
    const [start] = t.page.starts();
    expect(start.message.task).toMatchObject({ op: 'model.select' });
    const grant = start.message.grant as { leaseId?: string; deadline: number };
    expect(grant.leaseId).toEqual(expect.any(String));
    expect(grant.deadline).toBe(t.now() + 25_000);
  });

  it('refuses an op this build cannot run, without acknowledging it', async () => {
    const t = setup();
    await t.bridgeTab();
    await t.dispatcher.onTask(task('model.inspect', 'T1'));
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
    expect(await t.store.listTabs()).toEqual([]);
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

  it('keeps a reply wait running for 3 hours in a background tab whose progress comes late', async () => {
    const t = setup();
    const tabId = await t.bridgeTab('doc-1', false);
    await t.dispatcher.onTask({
      ...task('turns.waitReply', 'T1'),
      params: { conversationId: 'abc-123', afterUserTurnKey: 't-7' },
      deadlineMs: WAIT_REPLY_MAX_TIMEOUT_MS + 30_000,
    } as ValidatedBridgeTask);
    expect(t.page.starts()).toHaveLength(1);
    expect(await t.lease.current()).toBeNull();

    // A throttled hidden tab reports every few minutes, past the silence probe's window.
    for (let minute = 0; minute < 180; minute += 3) {
      t.advance(3 * 60_000);
      await t.dispatcher.tick();
      await t.dispatcher.onProgress(contentSender(tabId), {
        taskId: 'T1',
        docNonce: 'doc-1',
        progress: { phase: 'thinking', textLength: 0, elapsedMs: (minute + 3) * 60_000 },
      });
    }
    expect(t.server.results()).toEqual([]);
    expect(t.page.sent.some((s) => s.message.type === 'gv.bridge.op.cancel')).toBe(false);

    const reply = { assistantTurnKey: 't-8', status: 'complete', elapsedMs: 3 * 3_600_000 };
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: { ok: true, data: { ...reply, evidence: {} } },
    });
    expect(t.resultOf('T1')).toMatchObject({ ok: true, data: reply });
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
});
