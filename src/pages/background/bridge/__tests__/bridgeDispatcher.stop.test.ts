import { describe, expect, it } from 'vitest';

import { type ValidatedBridgeTask } from '@/features/bridge/protocol';

import { setup, task } from './dispatcherTestKit';

function waitReply(taskId: string, jobId: string): ValidatedBridgeTask {
  return {
    ...task('turns.waitReply', taskId, jobId),
    params: { conversationId: `c-${jobId}`, afterUserTurnKey: 't-1' },
  } as ValidatedBridgeTask;
}

/** Two jobs side by side: J1 waits for its reply, J2 is sending. */
async function twoJobs() {
  const t = setup();
  t.parallel.allowed = true;
  await t.bridgeTab('doc-1', false, 'J1');
  await t.bridgeTab('doc-2', false, 'J2');
  await t.dispatcher.onTask(waitReply('T1', 'J1'));
  await t.dispatcher.onTask(task('composer.send', 'T2', 'J2'));
  expect(t.page.starts()).toHaveLength(2);
  // The server takes its time over the first result.
  let answer = () => {};
  const held = new Promise<void>((resolve) => {
    answer = resolve;
  });
  const result = t.server.client.result.getMockImplementation()!;
  t.server.client.result.mockImplementationOnce(async (...args) => {
    await held;
    return result(...args);
  });
  const cancelled = () =>
    t.page.sent
      .filter((sent) => sent.message.type === 'gv.bridge.op.cancel')
      .map((sent) => sent.message.taskId);
  const settled = async () => {
    for (let i = 0; i < 50 && t.server.client.result.mock.calls.length === 0; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  return { t, answer, cancelled, settled };
}

describe('bridge dispatcher: stopping jobs side by side', () => {
  it("aborts a second job's send before the first job's result is reported on unpair", async () => {
    const { t, answer, cancelled, settled } = await twoJobs();
    const stopping = t.dispatcher.stopAll('not-paired', 'unpaired');
    await settled();
    expect(t.resultOf('T1')).toBeUndefined();
    expect(cancelled()).toEqual(['T1', 'T2']);

    answer();
    await stopping;
    expect(t.resultOf('T1')?.error?.code).toBe('not-paired');
    expect(t.resultOf('T2')?.error?.code).toBe('not-paired');
  });

  it("aborts a second job's send before the first job's result is reported on a policy change", async () => {
    const { t, answer, cancelled, settled } = await twoJobs();
    t.policy.denied = { code: 'policy-denied', message: 'revoked' };
    const stopping = t.dispatcher.recheckPolicy();
    await settled();
    expect(t.resultOf('T1')).toBeUndefined();
    expect(cancelled()).toEqual(['T1', 'T2']);

    answer();
    await stopping;
    expect(t.resultOf('T2')?.error?.code).toBe('policy-denied');
  });
});
