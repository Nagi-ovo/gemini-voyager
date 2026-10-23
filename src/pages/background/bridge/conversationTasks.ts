/**
 * The tab ops the service worker runs itself: `conversation.open` (open a
 * tab, then its `conversation.ready` step), `conversation.close` (switch the
 * mode back if a bridge op moved it, then close), and the switch-back after a
 * job gave an op up.
 */
import type {
  BridgeTask,
  ConversationOpenResult,
  ConversationReadyResult,
  TaskResultRequest,
  ValidatedBridgeTask,
} from '@/features/bridge/protocol';

import { type ContentHolder, conversationUrl } from './bridgeTabs';
import type { BridgeTabRecord, BridgeTaskRecord } from './bridgeTaskStore';
import { fail, holderOf, notCancelling, parseAck } from './dispatchOutcome';
import type { DispatchContext } from './dispatcherConfig';
import { ownTab } from './jobTabs';
import { LEFT_RESTORE_SUFFIX, type TaskSettlement } from './taskSettlement';

export function createConversationTasks(
  { deps, config, now }: DispatchContext,
  settle: TaskSettlement,
  scheduleTick: (delayMs: number) => void,
) {
  const { store, lease, tabs } = deps;
  const { finish, leaseFor, leaseAfterLeftRestore, concludeClose, startOp } = settle;

  /**
   * After the job gave an op up (timeout, abort), switch its tab back to the mode a
   * bridge op moved it from: a failed job leaves the tab open and may never send the
   * close that would. Once, untracked, in a background tab too, and only while no task
   * runs: its lease is one no job knows of, so a leased op that comes meanwhile waits it out
   * (`leaseAfterLeftRestore`). A refusal is final.
   */
  const restoreLeftMode = async (ended: BridgeTaskRecord): Promise<void> => {
    if (ended.op === 'conversation.close' || (await store.listTasks()).length > 0) return;
    const tab = await ownTab(store, ended.jobId);
    if (!tab?.restoreMode) return;
    const holder = holderOf(tab);
    if (!holder || !(await tabs.exists(tab.tabId))) return;
    if (await deps.policy.checkOp('conversation.ready')) return;
    const taskId = `${ended.taskId}${LEFT_RESTORE_SUFFIX}`;
    const got = await leaseFor(taskId, 'conversation.ready', holder);
    if ('refused' in got) return;
    const { leaseId, deadline } = got.lease;
    const readyTask: BridgeTask = {
      taskId,
      jobId: ended.jobId,
      op: 'conversation.ready',
      opVersion: 1,
      params: { ensureMode: tab.restoreMode, restore: true },
      deadlineMs: Math.max(0, deadline - now()),
      issuedAt: now(),
    };
    let reply: unknown;
    try {
      reply = await tabs.send(holder, {
        type: 'gv.bridge.op.start',
        task: readyTask,
        grant: { leaseId, deadline, docNonce: holder.docNonce },
      });
    } catch {
      // No receiver: nothing runs, so the lease goes below.
    }
    // Its report finds no task and only frees this lease (see `onDone`).
    if (!parseAck(reply).accepted) await lease.release(leaseId);
  };

  /** `parallel`: the job was admitted beside other jobs. */
  const openConversation = async (
    task: Extract<ValidatedBridgeTask, { op: 'conversation.open' }>,
    parallel: boolean,
  ) => {
    const current = await store.getTask(task.taskId);
    if (!current || current.cancelling) return; // stopped meanwhile
    const conversationId = 'conversationId' in task.params ? task.params.conversationId : undefined;
    let tabId: number;
    try {
      tabId = await tabs.open(task.jobId, conversationUrl(conversationId), config.openTabActive, {
        parallel,
      });
    } catch (error) {
      return finish(task.taskId, fail('tab-closed', `Could not open a tab: ${String(error)}`), {
        releaseLease: false,
      });
    }
    // Every phase spends the task's own deadline, which the server counts from dispatch.
    const updated = await store.updateTask(
      task.taskId,
      {
        state: 'running',
        tabId,
        phase: 'awaiting-hello',
        ...(conversationId ? { expectConversationId: conversationId } : {}),
      },
      notCancelling,
    );
    if (!updated) return;
    scheduleTick(updated.deadline - now());
    // A hello sent before the tab was recorded here was turned away; ask for it again.
    void tabs.requestHello(tabId);
  };

  const startReady = async (taskId: string, holder: ContentHolder) => {
    // Claimed in one step: a repeated hello must not start the ready step twice.
    const claimed = await store.updateTask(
      taskId,
      { phase: 'ready', ...holder, lastProgressAt: now() },
      (current) => current.phase === 'awaiting-hello' && notCancelling(current),
    );
    if (!claimed) return;
    const got = await leaseAfterLeftRestore(taskId, 'conversation.ready', holder, claimed.deadline);
    if ('refused' in got) {
      await finish(taskId, got.refused, { releaseLease: false });
      return;
    }
    const { leaseId } = got.lease;
    const running = await store.updateTask(taskId, { leaseId }, notCancelling);
    if (!running) {
      await lease.release(leaseId);
      return;
    }
    const deadline = Math.min(running.deadline, got.lease.deadline);
    const readyTask: BridgeTask = {
      taskId,
      jobId: running.jobId,
      op: 'conversation.ready',
      opVersion: 1,
      params: {
        ...(running.expectConversationId
          ? { expect: { conversationId: running.expectConversationId } }
          : {}),
        ensureMode: 'chat',
      },
      deadlineMs: Math.max(0, deadline - now()),
      issuedAt: now(),
    };
    await startOp(running, holder, readyTask, { leaseId, deadline });
    scheduleTick(running.deadline + config.deadlineGraceMs - now());
  };

  /** Switch the tab back to the mode a bridge op switched it from; false when that cannot start. */
  const restoreMode = async (
    task: Extract<ValidatedBridgeTask, { op: 'conversation.close' }>,
    tab: BridgeTabRecord,
  ): Promise<boolean> => {
    const holder = holderOf(tab);
    const record = await store.getTask(task.taskId);
    if (!holder || !tab.restoreMode || !record) return false;
    if (!(await tabs.exists(tab.tabId))) return false;
    const until = record.deadline - config.closeMarginMs;
    if (until <= now()) return false;
    // The CLI closes a failed job's tab, often while that switch-back still holds the page:
    // closing the tab meanwhile would cut the switch short.
    const got = await leaseAfterLeftRestore(task.taskId, 'conversation.ready', holder, until);
    if ('refused' in got) return false;
    const { leaseId } = got.lease;
    const running = await store.updateTask(
      task.taskId,
      { state: 'running', phase: 'restoring-mode', ...holder, leaseId, lastProgressAt: now() },
      notCancelling,
    );
    if (!running) {
      await lease.release(leaseId);
      return true; // stopped meanwhile: the stop reports it
    }
    const deadline = Math.min(until, got.lease.deadline);
    const readyTask: BridgeTask = {
      taskId: task.taskId,
      jobId: task.jobId,
      op: 'conversation.ready',
      opVersion: 1,
      params: { ensureMode: tab.restoreMode, restore: true },
      deadlineMs: Math.max(0, deadline - now()),
      issuedAt: now(),
    };
    await startOp(running, holder, readyTask, { leaseId, deadline });
    scheduleTick(running.deadline + config.deadlineGraceMs - now());
    return true;
  };

  const closeConversation = async (
    task: Extract<ValidatedBridgeTask, { op: 'conversation.close' }>,
  ) => {
    const tab = await store.getTab(task.params.tabId);
    if (!tab || tab.jobId !== task.jobId) {
      return finish(
        task.taskId,
        fail('bad-request', 'Only the tab this job opened can be closed.'),
        {
          releaseLease: false,
        },
      );
    }
    if (!tab.restoreMode) return concludeClose(task.taskId, tab.tabId, undefined);
    // A failed restore never keeps the tab open; the result says it was not restored.
    if (!(await restoreMode(task, tab))) await concludeClose(task.taskId, tab.tabId, false);
  };

  /** Remember the mode a ready step switched the tab from, until it is back in it. */
  const noteMode = async (tabId: number, ready: ConversationReadyResult): Promise<void> => {
    const tab = await store.getTab(tabId);
    if (!tab) return;
    if (ready.switchedMode && !tab.restoreMode && config.restoreSwitchedMode) {
      await store.updateTab(tabId, { restoreMode: ready.switchedMode.from });
    } else if (tab.restoreMode && ready.mode === tab.restoreMode) {
      await store.updateTab(tabId, { restoreMode: undefined });
    }
  };

  /** The `conversation.ready` result of an open, wrapped into the open's own result. */
  const openResult = (record: BridgeTaskRecord, ready: TaskResultRequest): TaskResultRequest => {
    if (!ready.ok || record.tabId === undefined || !record.docNonce) return ready;
    const data = ready.data as ConversationReadyResult;
    if (record.expectConversationId && data.conversationId !== record.expectConversationId) {
      return fail('unverified', 'The tab opened a different conversation.', {
        expected: record.expectConversationId,
        observed: data.conversationId,
      });
    }
    const result: ConversationOpenResult = {
      tabId: record.tabId,
      url: data.url,
      ...(record.documentId ? { documentId: record.documentId } : {}),
      docNonce: record.docNonce,
      ready: data,
    };
    return { ok: true, data: result };
  };

  return {
    restoreLeftMode,
    openConversation,
    startReady,
    closeConversation,
    noteMode,
    openResult,
  };
}
