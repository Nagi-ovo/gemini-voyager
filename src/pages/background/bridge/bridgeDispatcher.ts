/**
 * Task dispatch (spec §2.2 delivery, §3.1, §3.2). One task per job, each job in
 * the tab its own latest open created (`jobTabs.ts`); one job at a time, or as
 * many as the person chose once they allow parallel jobs. A task past that (another of the same job, or of
 * one job too many) is answered `busy`, never queued. Ops that dispatch page
 * events still take the one page lease, so two jobs never type or click at once.
 *
 * Everything is event driven from the session record, so a service worker
 * restart loses nothing: a content `op.done` that arrives after a restart is
 * matched against the stored record, not against a promise that died with the
 * old worker. Nothing is retried; a task id already seen is never run again.
 *
 * The server must see a task in `inflight` until its result is safe: the
 * result enters the outbox in the same step that clears the record, and leaves
 * it only once the server has answered for it. A stopped task (abort) stays in
 * flight as `cancelling` until its document confirms it stopped or is gone;
 * only then is it reported, so the server never frees the page early.
 *
 * Page safety: a lease is released only once its document has answered
 * (`op.done`, a confirmed stop), refused the op, or is gone (tab closed). A
 * task the background gives up on (timeout) keeps its lease until it expires;
 * the arbiter then lets a new holder in only after the old document confirms
 * it stopped.
 */
import { logger } from '@/core/services/LoggerService';
import {
  type BridgeError,
  type ConversationReadyResult,
  type ErrorCode,
  type InflightState,
  MAX_INFLIGHT_TASKS,
  type ValidatedBridgeTask,
  supportsOpVersion,
} from '@/features/bridge/protocol';
import { LEASED_OPS } from '@/features/bridge/runtimeMessages';

import type { PairedConnection } from './bridgeClient';
import { senderIsHolder } from './bridgeTabs';
import type { BridgeTaskRecord } from './bridgeTaskStore';
import { createConversationTasks } from './conversationTasks';
import {
  fail,
  holderOf,
  isRecord,
  normalizeOutcome,
  notCancelling,
  runsReady,
} from './dispatchOutcome';
import {
  type BridgeDispatcher,
  DEFAULT_DISPATCHER_CONFIG,
  type DispatchContext,
  type DispatcherConfig,
  type DispatcherDeps,
} from './dispatcherConfig';
import { jobTab } from './jobTabs';
import { createTaskSettlement } from './taskSettlement';

export {
  type BridgeDispatcher,
  type ContentDone,
  type ContentReport,
  DEFAULT_DISPATCHER_CONFIG,
  type DispatcherConfig,
  type DispatcherDeps,
  MAX_BRIDGE_TASKS,
  SUPPORTED_BRIDGE_OPS,
} from './dispatcherConfig';
export { cancelReason } from './dispatchOutcome';

interface Stop {
  readonly record: BridgeTaskRecord;
  readonly code: ErrorCode;
  readonly message: string;
}

export function createBridgeDispatcher(deps: DispatcherDeps): BridgeDispatcher {
  const now = deps.now ?? (() => Date.now());
  const config: DispatcherConfig = { ...DEFAULT_DISPATCHER_CONFIG, ...deps.config };
  const { store, lease, tabs, client } = deps;
  let lastJobId: string | null = null;

  const context: DispatchContext = { deps, config, now };
  const capacity = async (): Promise<number> =>
    Math.min(config.maxTasks, Math.max(1, (await deps.parallelJobs?.()) ?? 1));
  const settle = createTaskSettlement(context);
  const { ownConnection, deliver, finish, refuse, abortInPage, confirmStop } = settle;
  const { leaseAfterLeftRestore } = settle;
  const { concludeClose, endLost, startOp } = settle;
  const conversations = createConversationTasks(context, settle, (delayMs) =>
    scheduleTick(delayMs),
  );
  const { restoreLeftMode, openConversation, startReady, closeConversation } = conversations;
  const { noteMode, openResult } = conversations;

  const cancel = async (taskId: string, code: ErrorCode): Promise<void> => {
    const marked =
      (await store.updateTask(taskId, { cancelling: code }, notCancelling)) ??
      (await store.getTask(taskId));
    if (!marked?.cancelling) return;
    await confirmStop(marked, marked.cancelling);
    await restoreLeftMode(marked);
  };

  const scheduleTick = (delayMs: number): void => {
    if (delayMs > 5 * 60_000) return; // the wake alarm covers long waits
    setTimeout(() => void tick().catch(() => undefined), Math.max(0, delayMs) + 50);
  };

  const dispatchToContent = async (task: ValidatedBridgeTask, record: BridgeTaskRecord) => {
    const got = await jobTab(store, task.jobId, (await capacity()) === 1);
    if ('refused' in got) return finish(task.taskId, got.refused, { releaseLease: false });
    const { tab } = got;
    const holder = holderOf(tab);
    if (!holder) {
      return finish(task.taskId, fail('document-lost', 'The bridge tab has not loaded yet.'), {
        releaseLease: false,
      });
    }
    const leased = LEASED_OPS.has(task.op);
    let leaseId: string | undefined;
    let deadline = record.deadline;
    if (leased) {
      const got = await leaseAfterLeftRestore(task.taskId, task.op, holder, record.deadline);
      if ('refused' in got) return finish(task.taskId, got.refused, { releaseLease: false });
      leaseId = got.lease.leaseId;
      deadline = Math.min(deadline, got.lease.deadline);
    }
    const releaseOwn = async () => {
      if (leaseId) await lease.release(leaseId);
    };
    // The policy can flip while the lease is awaited; the last check is the one that counts.
    const denied = await deps.policy.checkOp(task.op);
    if (denied) {
      await releaseOwn();
      return finish(task.taskId, fail(denied.code, denied.message), { releaseLease: false });
    }
    const running = await store.updateTask(
      task.taskId,
      { state: 'running', ...holder, ...(leaseId ? { leaseId } : {}), lastProgressAt: now() },
      notCancelling,
    );
    if (!running) return releaseOwn(); // stopped while waiting
    await startOp(running, holder, task, { ...(leaseId ? { leaseId } : {}), deadline });
    scheduleTick(running.deadline + config.deadlineGraceMs - now());
  };

  /** One task's watchdog: its stop, its deadline, its tab and its document. */
  const watch = async (record: BridgeTaskRecord): Promise<void> => {
    // A stop the page has not confirmed yet: ask again (the server may be away).
    if (record.cancelling) {
      await confirmStop(record, record.cancelling);
      return restoreLeftMode(record);
    }
    const t = now();
    // Only the wait for a hello has no page op that could still answer.
    const grace = record.phase === 'awaiting-hello' ? 0 : config.deadlineGraceMs;
    if (t > record.deadline + grace) {
      abortInPage(record, 'timeout');
      if (record.op === 'conversation.close' && record.tabId !== undefined) {
        return concludeClose(record.taskId, record.tabId, false);
      }
      await finish(record.taskId, fail('timeout', `${record.op} did not finish in time.`), {
        releaseLease: false,
      });
      // The CLI may have crashed or timed out too: no close will come to switch the mode back.
      return restoreLeftMode(record);
    }
    if (record.tabId !== undefined && !(await tabs.exists(record.tabId))) {
      await deps.lease.releaseForTab(record.tabId);
      return endLost(record, fail('tab-closed', 'The bridge tab was closed.'), false);
    }
    const holder = holderOf(record);
    if (record.state !== 'running' || !holder || t - record.lastProgressAt < config.silenceProbeMs)
      return;
    // A frozen tab runs nothing until it thaws, and a message to it may never be answered:
    // hold the task (its deadline still counts) instead of calling its document lost.
    if (await tabs.isFrozen(holder.tabId)) {
      logger.info('Local bridge task held', { taskId: record.taskId, reason: 'tab-frozen' });
      return;
    }
    try {
      await tabs.send(holder, {
        type: 'gv.bridge.lease.probe',
        leaseId: record.leaseId ?? record.taskId,
      });
      await store.updateTask(record.taskId, { lastProgressAt: t });
    } catch {
      await endLost(record, fail('document-lost', 'The bridge tab lost its page.'), true);
    }
  };

  const tick = async (): Promise<void> => {
    await deps.ready();
    for (const record of await store.listTasks()) await watch(record);
  };

  /**
   * Stop each task in its page before reporting any of them: a report awaits the server, and
   * meanwhile another job's send would go on. Marked first, so one still waiting never starts.
   */
  const stopEach = async (stops: readonly Stop[]): Promise<void> => {
    for (const { record, code } of stops) {
      const marked = await store.updateTask(record.taskId, { cancelling: code }, notCancelling);
      abortInPage(marked ?? record, code);
    }
    for (const { record, code, message } of stops) {
      await finish(record.taskId, fail(code, message), { releaseLease: false });
    }
  };

  const stopAll = async (code: ErrorCode, message: string) =>
    stopEach((await store.listTasks()).map((record) => ({ record, code, message })));

  const intake = async (task: ValidatedBridgeTask, from?: PairedConnection): Promise<unknown> => {
    await deps.ready();
    const current = await store.getTask(task.taskId);
    const paired = await deps.connection();
    const connection = from ?? paired;
    // A poll of a pairing replaced meanwhile: its server is not the one this browser serves now.
    if (!connection || !paired) return;
    if (connection.serverId !== paired.serverId || connection.token !== paired.token) return;
    const { serverId } = connection;
    if (current) {
      // A redelivery of a task we run: confirm again, run nothing.
      if (current.serverId === serverId) await client.ack(connection, task.taskId);
      return;
    }
    if (!(await store.markSeen(task.taskId))) return; // seen before: never run twice
    const running = await store.listTasks();
    if (running.some((other) => other.jobId === task.jobId)) {
      return refuse(task.taskId, fail('busy', 'This job already has a task running.'), serverId);
    }
    // A job that ran beside others in its own tab finishes after the switch went off; the
    // cap admits new jobs, and with the switch off never depends on serve. `config.maxTasks`
    // holds either way.
    const ongoing =
      (await store.tabOwner(task.jobId))?.parallel === true &&
      (await store.listTabs()).some((tab) => tab.jobId === task.jobId);
    const maxTasks = ongoing ? config.maxTasks : await capacity();
    if (running.length >= maxTasks) {
      return refuse(
        task.taskId,
        fail('busy', `${running.length} of ${maxTasks} tasks are running already.`, { maxTasks }),
        serverId,
      );
    }
    if (maxTasks > 1) await store.markParallel(task.jobId);
    if (!config.supportedOps.has(task.op) || !supportsOpVersion(task.op, task.opVersion)) {
      return refuse(
        task.taskId,
        fail('unsupported-op', `${task.op} v${task.opVersion} is not supported.`),
        serverId,
      );
    }
    const startedAt = now();
    const record: BridgeTaskRecord = {
      taskId: task.taskId,
      jobId: task.jobId,
      op: task.op,
      state: 'acked',
      startedAt,
      deadline: startedAt + task.deadlineMs,
      lastProgressAt: startedAt,
      progressSeq: 0,
      serverId,
      // The page may read exactly these blobs, and only while this task runs.
      ...(task.op === 'composer.attach'
        ? { blobs: task.params.blobs.map(({ blobId, size }) => ({ blobId, size })) }
        : task.op === 'project.upload'
          ? { blobs: [{ blobId: task.params.blob.blobId, size: task.params.blob.size }] }
          : {}),
    };
    // Ack first: a catalog check below can outlast the server's 10 s ack window.
    await store.setTask(record);
    const ack = await client.ack(connection, task.taskId);
    // The server may have ended or disowned the task since the poll: only its ack lets it run.
    if (!ack.ok) {
      return finish(
        task.taskId,
        fail(ack.error.code, `voyager serve did not confirm the task: ${ack.error.message}`),
        { releaseLease: false },
      );
    }
    // A refresh of its own is about to run: an unforced one first would only delay it.
    if (task.jobId !== lastJobId && task.op !== 'catalog.refresh') {
      lastJobId = task.jobId;
      await deps.policy.refreshIfOld();
    }
    const denied = await deps.policy.checkOp(task.op);
    if (denied) {
      return finish(task.taskId, fail(denied.code, denied.message), { releaseLease: false });
    }
    if (task.op === 'catalog.refresh') {
      const refreshed = deps.refreshCatalog
        ? await deps.refreshCatalog(task.params)
        : fail('unsupported-op', 'This build cannot refresh the catalog.');
      return finish(task.taskId, refreshed, { releaseLease: false });
    }
    if (task.op === 'conversation.open') return openConversation(task, maxTasks > 1);
    if (task.op === 'conversation.close') return closeConversation(task);
    return dispatchToContent(task, record);
  };

  return {
    onTask: async (task, from) => {
      await intake(task, from);
    },

    onAbort: async (taskId, reason, from) => {
      await deps.ready();
      const record = await store.getTask(taskId);
      if (from && record && record.serverId !== from.serverId) return;
      await cancel(taskId, reason);
    },

    onHello: async (sender, docNonce) => {
      await deps.ready();
      const accepted = await tabs.acceptHello(sender, docNonce);
      if (!accepted) return false;
      const { tabId } = accepted.current;
      const record = (await store.listTasks()).find((task) => task.tabId === tabId);
      if (!record) return true;
      if (record.op === 'conversation.open' && record.phase === 'awaiting-hello') {
        await startReady(record.taskId, {
          tabId: accepted.current.tabId,
          docNonce,
          ...(accepted.current.documentId ? { documentId: accepted.current.documentId } : {}),
        });
      } else if (record.docNonce && record.docNonce !== docNonce) {
        // The tab loaded a new document under the running op; the old one may sit in bfcache,
        // so its lease stays until it expires and the arbiter has confirmed it stopped.
        await endLost(record, fail('document-lost', 'The bridge tab navigated away.'), false);
      }
      return true;
    },

    onProgress: async (sender, message) => {
      await deps.ready();
      const record = await store.getTask(message.taskId);
      if (!record) return false;
      if (!senderIsHolder(sender, message.docNonce, record)) return false;
      const seq = record.progressSeq + 1;
      await store.updateTask(record.taskId, { lastProgressAt: now(), progressSeq: seq });
      const connection = await ownConnection(record.serverId);
      if (connection && isRecord(message.progress)) {
        await client.progress(connection, record.taskId, seq, message.progress);
      }
      return true;
    },

    onDone: async (sender, message) => {
      await deps.ready();
      const record = await store.getTask(message.taskId);
      if (!record || !senderIsHolder(sender, message.docNonce, record)) {
        // A late report from a document whose task already ended may still free its own lease.
        const held = await lease.current();
        if (
          held &&
          held.taskId === message.taskId &&
          senderIsHolder(sender, message.docNonce, held)
        ) {
          await lease.release(held.leaseId);
        }
        return false;
      }
      const outcome = normalizeOutcome(
        runsReady(record.op) ? 'conversation.ready' : record.op,
        message.outcome,
      );
      if (record.op === 'conversation.close' && record.tabId !== undefined) {
        const tab = await store.getTab(record.tabId);
        const restored =
          outcome.ok && (outcome.data as ConversationReadyResult).mode === tab?.restoreMode;
        if (record.leaseId) await lease.release(record.leaseId);
        await concludeClose(record.taskId, record.tabId, restored);
        return true;
      }
      if (runsReady(record.op) && outcome.ok && record.tabId !== undefined) {
        await noteMode(record.tabId, outcome.data as ConversationReadyResult);
      }
      const isOpen = record.op === 'conversation.open';
      await finish(record.taskId, isOpen ? openResult(record, outcome) : outcome, {
        releaseLease: true,
      });
      return true;
    },

    onTabRemoved: async (tabId) => {
      await deps.ready();
      await lease.releaseForTab(tabId);
      await store.clearTab(tabId);
      const record = (await store.listTasks()).find((task) => task.tabId === tabId);
      if (!record) return;
      if (record.op === 'conversation.close') {
        // Our own close removes the tab too; only a removal mid-restore ends the close here.
        if (record.phase === 'restoring-mode') await concludeClose(record.taskId, tabId, false);
        return;
      }
      await endLost(record, fail('tab-closed', 'The bridge tab was closed.'), false);
    },

    stopAll,

    recheckPolicy: async () => {
      await deps.ready();
      const stops: Stop[] = [];
      for (const record of await store.listTasks()) {
        const denied = await deps.policy.checkOp(record.op);
        if (denied) stops.push({ record, ...denied });
      }
      await stopEach(stops);
    },

    tick,

    inflight: async () => {
      // Records first, outbox second: a result only ever moves from the one to the other.
      const records = await store.listTasks();
      const outbox = await store.listOutbox();
      // Only the tasks of the server polled now: another server never learns their ids.
      const serverId = (await deps.connection())?.serverId;
      if (serverId === undefined) return [];
      // Records lead the list: past the cap, a result left in the outbox is only redelivered,
      // while a running task the server does not see listed is failed as reloaded.
      const list: { taskId: string; state: InflightState }[] = records
        .filter((record) => record.serverId === serverId)
        .map((record) => ({ taskId: record.taskId, state: record.state }));
      for (const entry of outbox) {
        if (entry.serverId !== serverId || list.some((item) => item.taskId === entry.taskId))
          continue;
        list.push({ taskId: entry.taskId, state: 'running' });
      }
      return list.slice(0, MAX_INFLIGHT_TASKS);
    },

    drainOutbox: async () => {
      if (!(await deps.connection())) return false;
      for (const entry of await store.listOutbox()) {
        if (!(await deliver(entry.taskId, entry.result, entry.serverId))) return false;
      }
      return true;
    },

    tasks: () => store.listTasks(),

    capacity,
  };
}

export type { BridgeError };
