import { describe, expect, it } from 'vitest';

import { type ValidatedBridgeTask } from '@/features/bridge/protocol';

import { contentSender } from './bridgeTestKit';
import { setup, task } from './dispatcherTestKit';

function waitReply(taskId: string, jobId: string): ValidatedBridgeTask {
  return {
    ...task('turns.waitReply', taskId, jobId),
    params: { conversationId: `c-${jobId}`, afterUserTurnKey: 't-1' },
  } as ValidatedBridgeTask;
}

const REPLY = { assistantTurnKey: 't-2', status: 'complete', elapsedMs: 1, evidence: {} };

type Setup = ReturnType<typeof setup>;

/** `jobId`'s reply wait, run to its end in `tabId`: the job is now between two ops. */
async function waitedIn(t: Setup, tabId: number, docNonce: string, taskId: string, jobId: string) {
  await t.dispatcher.onTask(waitReply(taskId, jobId));
  await t.dispatcher.onDone(contentSender(tabId), {
    taskId,
    docNonce,
    outcome: { ok: true, data: REPLY },
  });
}

const startedIn = (t: Setup, taskId: string) =>
  t.page.starts().find((start) => (start.message.task as { taskId?: string }).taskId === taskId)
    ?.tabId;

describe('bridge dispatcher: the tab each job runs in', () => {
  it('runs a job that opened two tabs in the one it opened last, even after the first said hello again', async () => {
    const t = setup();
    const first = await t.bridgeTab('doc-1', false, 'J1');
    const last = await t.bridgeTab('doc-2', false, 'J1');
    await waitedIn(t, last, 'doc-2', 'T1', 'J1');
    expect(startedIn(t, 'T1')).toBe(last);

    // A remount's hello rewrites the first tab's record.
    await t.dispatcher.onHello(contentSender(first), 'doc-1b');
    await t.dispatcher.onTask(task('turns.read', 'T2', 'J1'));
    expect(startedIn(t, 'T2')).toBe(last);
  });

  it('lends a job that opened no tab (voyager call) the newest tab while jobs run one at a time', async () => {
    const t = setup();
    await t.bridgeTab('doc-1', false, 'J1');
    const newer = await t.bridgeTab('doc-2', false, 'J2');
    await t.dispatcher.onTask(task('turns.read', 'T1', 'CALL'));
    expect(startedIn(t, 'T1')).toBe(newer);
  });

  it("refuses a job that opened no tab beside jobs side by side, rather than lend it a job's tab between two ops", async () => {
    const t = setup();
    t.parallel.allowed = true;
    const tabId = await t.bridgeTab('doc-1', false, 'J1');
    await waitedIn(t, tabId, 'doc-1', 'T1', 'J1');

    await t.dispatcher.onTask(task('composer.send', 'T2', 'CALL'));
    expect(t.resultOf('T2')).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(startedIn(t, 'T2')).toBeUndefined();
  });

  it('never lends the tab of a job that ran beside others, even after the switch went off', async () => {
    const t = setup();
    t.parallel.allowed = true;
    const tabId = await t.bridgeTab('doc-1', false, 'J1');
    await waitedIn(t, tabId, 'doc-1', 'T1', 'J1');
    t.parallel.allowed = false;

    await t.dispatcher.onTask(task('composer.send', 'T2', 'CALL'));
    expect(t.resultOf('T2')).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(startedIn(t, 'T2')).toBeUndefined();
  });

  it('keeps a long job in its own tab after more than 64 other jobs opened and closed theirs', async () => {
    const t = setup();
    t.parallel.allowed = true;
    const own = await t.bridgeTab('doc-1', false, 'J1');
    for (let i = 0; i < 70; i += 1) {
      const other = await t.bridgeTab(`doc-x${i}`, false, `X${i}`);
      t.page.tabs.delete(other);
      await t.dispatcher.onTabRemoved(other);
    }
    await t.bridgeTab('doc-2', false, 'J2');

    await t.dispatcher.onTask(task('turns.read', 'T1', 'J1'));
    expect(startedIn(t, 'T1')).toBe(own);
  });

  it("never runs a job whose tab closed in another job's tab, after more than 64 jobs opened theirs", async () => {
    const t = setup();
    t.parallel.allowed = true;
    const own = await t.bridgeTab('doc-1', false, 'J1');
    t.page.tabs.delete(own);
    await t.dispatcher.onTabRemoved(own);
    for (let i = 0; i < 70; i += 1) {
      const other = await t.bridgeTab(`doc-x${i}`, false, `X${i}`);
      t.page.tabs.delete(other);
      await t.dispatcher.onTabRemoved(other);
    }
    await t.bridgeTab('doc-2', false, 'J2');

    await t.dispatcher.onTask(task('composer.send', 'T1', 'J1'));
    expect(t.page.starts()).toHaveLength(0);
    expect(t.resultOf('T1')?.ok).toBe(false);
  });

  it('holds a job that ran one at a time to the switch once it is off, whatever serve sends', async () => {
    const t = setup();
    const first = await t.bridgeTab('doc-1', false, 'J1');
    await t.bridgeTab('doc-2', false, 'J2');
    await waitedIn(t, first, 'doc-1', 'T1', 'J1');
    await t.dispatcher.onTask(waitReply('T2', 'J2'));

    await t.dispatcher.onTask(task('turns.read', 'T3', 'J1'));
    expect(t.resultOf('T3')).toMatchObject({ ok: false, error: { code: 'busy' } });
    expect(startedIn(t, 'T3')).toBeUndefined();
  });
});
