import { describe, expect, it, vi } from 'vitest';

import { type ValidatedBridgeTask } from '@/features/bridge/protocol';

import { contentSender } from './bridgeTestKit';
import { READY, setup, task } from './dispatcherTestKit';

describe('bridge dispatcher: conversation tabs and their mode', () => {
  it('opens a tab, waits for its hello, then reports the ready page', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    const created = vi.mocked(t.page.api.create).mock.calls[0][0];
    expect(created.url).toBe('https://chatgpt.com/');
    const tabId = (await t.store.listTabs())[0]!.tabId;

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

  it('gives up on a tab whose page never says hello once the task deadline passed', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    t.advance(59_000);
    await t.dispatcher.tick();
    expect(t.resultOf('T1')).toBeUndefined();
    t.advance(1_001);
    await t.dispatcher.tick();
    expect(t.resultOf('T1')?.error?.code).toBe('timeout');
  });

  it('names the tab a failed open left behind, so the CLI can close it', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    const tabId = (await t.store.listTabs())[0]!.tabId;
    await t.dispatcher.onHello(contentSender(tabId, 'DOC'), 'doc-9');
    await t.dispatcher.onDone(contentSender(tabId, 'DOC'), {
      taskId: 'T1',
      docNonce: 'doc-9',
      outcome: {
        ok: false,
        error: {
          code: 'mode-unavailable',
          category: 'user-action',
          message: 'Work mode.',
          details: { mode: 'work' },
        },
      },
    });

    expect(t.resultOf('T1')?.error).toMatchObject({
      code: 'mode-unavailable',
      details: { mode: 'work', tabId },
    });
    expect(t.page.tabs.has(tabId)).toBe(true);
  });

  it('spends one deadline across the catalog check, the hello and the ready step', async () => {
    const t = setup();
    const startedAt = t.now();
    t.policy.refreshIfOld.mockImplementationOnce(async () => t.advance(15_000));
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    expect((await t.dispatcher.tasks())[0]?.deadline).toBe(startedAt + 60_000);
    const tabId = (await t.store.listTabs())[0]!.tabId;

    t.advance(25_000);
    await t.dispatcher.onHello(contentSender(tabId), 'doc-9');
    const [start] = t.page.starts();
    expect(start.message.grant).toMatchObject({ deadline: startedAt + 60_000 });
    expect(start.message.task).toMatchObject({ op: 'conversation.ready', deadlineMs: 20_000 });
  });

  it('starts the ready step even when the page said hello before its tab was recorded', async () => {
    const t = setup();
    const create = vi.mocked(t.page.api.create).getMockImplementation()!;
    let early: Promise<boolean> | undefined;
    vi.mocked(t.page.api.create).mockImplementationOnce(async (props) => {
      const tab = await create(props);
      early = t.dispatcher.onHello(contentSender(tab!.id!, 'DOC'), 'doc-9');
      await early;
      return tab;
    });
    let repeated: Promise<boolean> | undefined;
    t.page.state.onMessage = (tabId, message) => {
      if (message.type !== 'gv.bridge.hello.request') return { accepted: true };
      repeated = t.dispatcher.onHello(contentSender(tabId, 'DOC'), 'doc-9');
      return { attached: true };
    };
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    expect(await early).toBe(false); // too early: the tab was not recorded yet
    await repeated;

    const [start] = t.page.starts();
    expect(start.message.task).toMatchObject({ taskId: 'T1', op: 'conversation.ready' });
  });

  it('switches a tab it moved out of work mode back before closing it, when asked to', async () => {
    const t = setup();
    const dispatcher = t.make(t.policy.checkOp, { restoreSwitchedMode: true });
    await dispatcher.onTask(task('conversation.open', 'T1'));
    const tabId = (await t.store.listTabs())[0]!.tabId;
    await dispatcher.onHello(contentSender(tabId), 'doc-9');
    const open = t.page.starts()[0].message;
    expect(open.task).toMatchObject({ params: { ensureMode: 'chat' } });
    expect(open.grant).toMatchObject({ leaseId: expect.any(String) });
    const switched = { ...READY, switchedMode: { from: 'work', to: 'chat' } };
    await dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-9',
      outcome: { ok: true, data: switched },
    });
    expect(t.resultOf('T1')).toMatchObject({ ok: true, data: { ready: switched } });

    const close = { ...task('conversation.close', 'T2'), params: { tabId } } as ValidatedBridgeTask;
    await dispatcher.onTask(close);
    const restore = t.page.starts()[1].message;
    expect(restore.task).toMatchObject({
      taskId: 'T2',
      params: { ensureMode: 'work', restore: true },
    });
    expect(restore.grant).toMatchObject({ leaseId: expect.any(String) });
    expect(t.page.tabs.has(tabId)).toBe(true);

    await dispatcher.onDone(contentSender(tabId), {
      taskId: 'T2',
      docNonce: 'doc-9',
      outcome: { ok: true, data: { ...READY, mode: 'work' } },
    });
    expect(t.resultOf('T2')).toEqual({ ok: true, data: { closed: true, restoredMode: true } });
    expect(t.page.tabs.has(tabId)).toBe(false);
    expect(await t.lease.current()).toBeNull();
  });

  it('leaves the account in chat when it closes a tab it moved out of work mode', async () => {
    const t = setup();
    await t.dispatcher.onTask(task('conversation.open', 'T1'));
    const tabId = (await t.store.listTabs())[0]!.tabId;
    await t.dispatcher.onHello(contentSender(tabId), 'doc-9');
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T1',
      docNonce: 'doc-9',
      outcome: { ok: true, data: { ...READY, switchedMode: { from: 'work', to: 'chat' } } },
    });

    const close = { ...task('conversation.close', 'T2'), params: { tabId } } as ValidatedBridgeTask;
    await t.dispatcher.onTask(close);
    expect(t.page.starts()).toHaveLength(1);
    expect(t.resultOf('T2')).toEqual({ ok: true, data: { closed: true } });
    expect(t.page.tabs.has(tabId)).toBe(false);
  });

  it('still switches the mode back before closing after the bridge remounted and said hello again', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.store.updateTab(tabId, { restoreMode: 'work' });
    await t.dispatcher.onHello(contentSender(tabId), 'doc-1');
    const close = { ...task('conversation.close', 'T2'), params: { tabId } } as ValidatedBridgeTask;
    await t.dispatcher.onTask(close);
    expect(t.page.starts()[0]?.message.task).toMatchObject({
      taskId: 'T2',
      params: { ensureMode: 'work', restore: true },
    });
    expect(t.page.tabs.has(tabId)).toBe(true);
  });

  it('still closes the tab when its mode cannot be switched back', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.store.updateTab(tabId, { restoreMode: 'work' });
    const close = { ...task('conversation.close', 'T2'), params: { tabId } } as ValidatedBridgeTask;
    await t.dispatcher.onTask(close);
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: 'T2',
      docNonce: 'doc-1',
      outcome: {
        ok: false,
        error: { code: 'mode-unavailable', category: 'user-action', message: 'no switch' },
      },
    });
    expect(t.resultOf('T2')).toEqual({ ok: true, data: { closed: true, restoredMode: false } });
    expect(t.page.tabs.has(tabId)).toBe(false);
  });

  it('switches a tab back to its mode when an op times out and no close follows', async () => {
    const t = setup({ probe: async () => 'stopped' });
    const tabId = await t.bridgeTab('doc-1', false);
    await t.store.updateTab(tabId, { restoreMode: 'work' });
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    t.advance(60_000 + 30_001);
    await t.dispatcher.tick();
    expect(t.resultOf('T1')?.error?.code).toBe('timeout');

    expect(t.page.starts()).toHaveLength(2);
    const restore = t.page.starts()[1].message.task as { taskId: string };
    expect(restore).toMatchObject({
      op: 'conversation.ready',
      params: { ensureMode: 'work', restore: true },
    });
    expect(restore.taskId).not.toBe('T1');
    expect(t.page.tabs.has(tabId)).toBe(true);

    // Its report frees the page and tells the server nothing: the job it belonged to is over.
    await t.dispatcher.onDone(contentSender(tabId), {
      taskId: restore.taskId,
      docNonce: 'doc-1',
      outcome: { ok: true, data: { ...READY, mode: 'work' } },
    });
    expect(t.server.results()).toHaveLength(1);
    expect(await t.lease.current()).toBeNull();
  });

  it('lets a timeout finish switching the mode back before the close that follows closes the tab', async () => {
    const t = setup({ probe: async () => 'stopped' });
    const dispatcher = t.make(t.policy.checkOp, { leftRestorePollMs: 1 });
    const tabId = await t.bridgeTab('doc-1', false);
    await t.store.updateTab(tabId, { restoreMode: 'work' });
    await dispatcher.onTask(task('turns.read', 'T1'));
    t.advance(60_000 + 30_001);
    await dispatcher.tick();
    const switchBack = t.page.starts()[1].message.task as { taskId: string };

    const close = { ...task('conversation.close', 'T2'), params: { tabId } } as ValidatedBridgeTask;
    const closing = dispatcher.onTask(close);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(t.page.tabs.has(tabId)).toBe(true);
    expect(t.resultOf('T2')).toBeUndefined();

    await dispatcher.onDone(contentSender(tabId), {
      taskId: switchBack.taskId,
      docNonce: 'doc-1',
      outcome: { ok: true, data: { ...READY, mode: 'work' } },
    });
    await closing;
    expect(t.page.starts()[2]?.message.task).toMatchObject({
      taskId: 'T2',
      params: { ensureMode: 'work', restore: true },
    });
  });

  it('switches a tab back to its mode once the page confirms an aborted op stopped', async () => {
    const t = setup();
    const tabId = await t.bridgeTab();
    await t.store.updateTab(tabId, { restoreMode: 'work' });
    await t.dispatcher.onTask(task('composer.send', 'T1'));
    t.page.state.onMessage = (_tabId, message) =>
      message.type === 'gv.bridge.op.cancel' ? { stopped: true } : { accepted: true };
    await t.dispatcher.onAbort('T1', 'timeout');
    expect(t.resultOf('T1')?.error?.code).toBe('timeout');
    expect(t.page.starts()[1]?.message.task).toMatchObject({
      params: { ensureMode: 'work', restore: true },
    });
  });

  it('leaves the mode alone after a timeout once the bridge may no longer touch the page', async () => {
    const t = setup({ probe: async () => 'stopped' });
    const tabId = await t.bridgeTab();
    await t.store.updateTab(tabId, { restoreMode: 'work' });
    await t.dispatcher.onTask(task('turns.read', 'T1'));
    t.policy.denied = { code: 'policy-denied', message: 'off' };
    t.advance(60_000 + 30_001);
    await t.dispatcher.tick();
    expect(t.resultOf('T1')?.error?.code).toBe('timeout');
    expect(t.page.starts()).toHaveLength(1);
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
});
