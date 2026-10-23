import { describe, expect, it } from 'vitest';

import { contentSender } from './bridgeTestKit';
import { READY, setup, task } from './dispatcherTestKit';

const taskIdOf = (start: { message: Record<string, unknown> }) =>
  (start.message.task as { taskId: string }).taskId;

/** J1's read times out in a tab the bridge moved out of work mode, so its switch-back starts. */
async function switchingBack() {
  const t = setup({ probe: async () => 'stopped' });
  t.parallel.allowed = true;
  const dispatcher = t.make(t.policy.checkOp, { leftRestorePollMs: 1 });
  const left = await t.bridgeTab('doc-1', false, 'J1');
  await t.store.updateTab(left, { restoreMode: 'work' });
  await dispatcher.onTask(task('turns.read', 'T1', 'J1'));
  t.advance(60_000 + 30_001);
  await dispatcher.tick();
  const switchBack = t.page.starts()[1]!;
  expect(switchBack.message.task).toMatchObject({ params: { ensureMode: 'work', restore: true } });
  const finishSwitchBack = () =>
    dispatcher.onDone(contentSender(left), {
      taskId: taskIdOf(switchBack),
      docNonce: 'doc-1',
      outcome: { ok: true, data: { ...READY, mode: 'work' } },
    });
  return { t, dispatcher, finishSwitchBack };
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 20));

describe("bridge dispatcher: a timed-out job's mode switch-back", () => {
  it("lets another job's send wait out the switch-back instead of answering busy", async () => {
    const { t, dispatcher, finishSwitchBack } = await switchingBack();
    const other = await t.bridgeTab('doc-2', false, 'J2');

    const sending = dispatcher.onTask(task('composer.send', 'T2', 'J2'));
    await pause();
    expect(t.resultOf('T2')).toBeUndefined();
    expect(t.page.starts().map(taskIdOf)).not.toContain('T2');

    await finishSwitchBack();
    await sending;
    expect(t.page.starts().find((start) => taskIdOf(start) === 'T2')?.tabId).toBe(other);
    expect(t.resultOf('T2')).toBeUndefined();
  });

  it("lets a new job's open wait out the switch-back before its ready step", async () => {
    const { t, dispatcher, finishSwitchBack } = await switchingBack();
    await dispatcher.onTask(task('conversation.open', 'T2', 'J2'));
    const opened = (await t.store.tabOwner('J2'))!.tabId;

    const hello = dispatcher.onHello(contentSender(opened), 'doc-2');
    await pause();
    expect(t.resultOf('T2')).toBeUndefined();

    await finishSwitchBack();
    await hello;
    const ready = t.page.starts().find((start) => taskIdOf(start) === 'T2');
    expect(ready).toMatchObject({ tabId: opened, message: { task: { op: 'conversation.ready' } } });
  });
});
