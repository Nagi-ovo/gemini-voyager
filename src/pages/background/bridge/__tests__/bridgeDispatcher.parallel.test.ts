import { describe, expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { type ValidatedBridgeTask } from '@/features/bridge/protocol';

import { MAX_BRIDGE_TASKS } from '../bridgeDispatcher';
import { contentSender } from './bridgeTestKit';
import { READ, SENT, setup, task } from './dispatcherTestKit';

/** A reply wait of `jobId`, the op that keeps a job's task in flight for hours. */
function waitReply(taskId: string, jobId: string): ValidatedBridgeTask {
  return {
    ...task('turns.waitReply', taskId, jobId),
    params: { conversationId: `c-${jobId}`, afterUserTurnKey: 't-1' },
  } as ValidatedBridgeTask;
}

describe('bridge dispatcher: jobs side by side', () => {
  it('runs one job at a time until the person allows parallel jobs', async () => {
    const t = setup();
    await t.bridgeTab('doc-1', false, 'J1');
    await t.dispatcher.onTask(waitReply('T1', 'J1'));
    await t.dispatcher.onTask(task('conversation.open', 'T2', 'J2'));
    expect(t.resultOf('T2')).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(t.page.api.create).not.toHaveBeenCalled();
    expect(await t.dispatcher.capacity()).toBe(1);

    t.parallel.allowed = true;
    await t.dispatcher.onTask(task('conversation.open', 'T3', 'J3'));
    expect(t.page.api.create).toHaveBeenCalledTimes(1);
    expect(await t.dispatcher.capacity()).toBe(MAX_BRIDGE_TASKS);
  });

  it('runs the tasks of different jobs at once, each in the tab its own open created', async () => {
    const t = setup();
    t.parallel.allowed = true;
    const first = await t.bridgeTab('doc-1', false, 'J1');
    const second = await t.bridgeTab('doc-2', false, 'J2');
    await t.dispatcher.onTask(waitReply('T1', 'J1'));
    await t.dispatcher.onTask(task('turns.read', 'T2', 'J2'));

    expect(t.page.starts().map((start) => start.tabId)).toEqual([first, second]);
    expect((await t.dispatcher.tasks()).map((record) => record.taskId)).toEqual(['T1', 'T2']);

    // Each report finds its own task; the other keeps running.
    const done = { taskId: 'T2', docNonce: 'doc-2', outcome: { ok: true, data: READ } };
    expect(await t.dispatcher.onDone(contentSender(first), done)).toBe(false);
    expect(await t.dispatcher.onDone(contentSender(second), done)).toBe(true);
    expect(t.resultOf('T2')).toEqual({ ok: true, data: READ });
    expect((await t.dispatcher.tasks()).map((record) => record.taskId)).toEqual(['T1']);
  });

  it('lets jobs already in their tabs finish after the switch goes off, and no new one in', async () => {
    const t = setup();
    t.parallel.allowed = true;
    const first = await t.bridgeTab('doc-1', false, 'J1');
    await t.bridgeTab('doc-2', false, 'J2');
    await t.dispatcher.onTask(waitReply('T1', 'J1'));
    await t.dispatcher.onTask(waitReply('T2', 'J2'));
    await t.dispatcher.onDone(contentSender(first), {
      taskId: 'T1',
      docNonce: 'doc-1',
      outcome: {
        ok: true,
        data: { assistantTurnKey: 't-2', status: 'complete', elapsedMs: 1, evidence: {} },
      },
    });

    t.parallel.allowed = false;
    await t.dispatcher.onTask(task('turns.read', 'T3', 'J1'));
    await t.dispatcher.onTask(task('conversation.open', 'T4', 'J3'));
    expect(t.page.starts().map((start) => start.message.task)).toContainEqual(
      expect.objectContaining({ taskId: 'T3' }),
    );
    expect(t.resultOf('T4')).toMatchObject({ ok: false, error: { code: 'busy' } });
  });

  it('answers busy to one job too many and to a second task of a running job', async () => {
    const t = setup();
    t.parallel.allowed = true;
    const dispatcher = t.make(undefined, { maxTasks: 2 });
    for (const job of ['J1', 'J2', 'J3']) await t.bridgeTab(`doc-${job}`, false, job);
    await dispatcher.onTask(waitReply('T1', 'J1'));
    await dispatcher.onTask(waitReply('T2', 'J2'));
    await dispatcher.onTask(waitReply('T3', 'J3'));
    await dispatcher.onTask(task('turns.read', 'T4', 'J1'));

    expect(t.page.starts()).toHaveLength(2);
    expect(t.resultOf('T3')).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(t.resultOf('T4')).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(await dispatcher.capacity()).toBe(2);
  });

  it('runs as many jobs at once as the person chose, and answers busy past them', async () => {
    for (const jobs of [3, MAX_BRIDGE_TASKS]) {
      const t = setup();
      t.parallel.allowed = true;
      t.parallel.jobs = jobs;
      for (let i = 1; i <= jobs + 1; i += 1) {
        await t.bridgeTab(`doc-${i}`, false, `J${i}`);
        await t.dispatcher.onTask(waitReply(`T${i}`, `J${i}`));
      }
      expect(t.page.starts()).toHaveLength(jobs);
      expect(t.resultOf(`T${jobs + 1}`)).toMatchObject({ error: { code: 'busy' } });
      expect(await t.dispatcher.capacity()).toBe(jobs);
    }
  });

  it('still lets one job at a time type or click: the page lease spans every tab', async () => {
    const t = setup();
    t.parallel.allowed = true;
    await t.bridgeTab('doc-1', false, 'J1');
    await t.bridgeTab('doc-2', false, 'J2');
    await t.dispatcher.onTask(task('composer.send', 'T1', 'J1'));
    await t.dispatcher.onTask(task('composer.send', 'T2', 'J2'));

    expect(t.page.starts()).toHaveLength(1);
    expect(t.resultOf('T2')).toMatchObject({ ok: false, error: { code: 'busy' } });
  });

  it('ends only the task of the tab that closed', async () => {
    const t = setup();
    t.parallel.allowed = true;
    const first = await t.bridgeTab('doc-1', false, 'J1');
    await t.bridgeTab('doc-2', false, 'J2');
    await t.dispatcher.onTask(waitReply('T1', 'J1'));
    await t.dispatcher.onTask(waitReply('T2', 'J2'));

    t.page.tabs.delete(first);
    await t.dispatcher.onTabRemoved(first);
    expect(t.resultOf('T1')).toMatchObject({ ok: false, error: { code: 'tab-closed' } });
    expect(t.resultOf('T2')).toBeUndefined();
    expect((await t.dispatcher.tasks()).map((record) => record.taskId)).toEqual(['T2']);
  });

  it("never runs a job whose tab closed in another job's tab", async () => {
    const t = setup();
    t.parallel.allowed = true;
    const own = await t.bridgeTab('doc-1', false, 'J1');
    await t.bridgeTab('doc-2', false, 'J2');
    t.page.tabs.delete(own);
    await t.dispatcher.onTabRemoved(own);

    await t.dispatcher.onTask(task('composer.send', 'T1', 'J1'));
    expect(t.page.starts()).toHaveLength(0);
    expect(t.resultOf('T1')).toMatchObject({ ok: false, error: { code: 'tab-closed' } });
  });

  it('lists every running task in flight ahead of the results still to hand over', async () => {
    const t = setup();
    t.parallel.allowed = true;
    await t.local.set({
      [StorageKeys.BRIDGE_OUTBOX]: [
        { taskId: 'T0', result: { ok: true, data: SENT }, at: 1, serverId: 'srv-a' },
      ],
    });
    await t.bridgeTab('doc-1', false, 'J1');
    await t.bridgeTab('doc-2', false, 'J2');
    await t.dispatcher.onTask(waitReply('T1', 'J1'));
    await t.dispatcher.onTask(waitReply('T2', 'J2'));

    expect(await t.dispatcher.inflight()).toEqual([
      { taskId: 'T1', state: 'running' },
      { taskId: 'T2', state: 'running' },
      { taskId: 'T0', state: 'running' },
    ]);
  });
});
