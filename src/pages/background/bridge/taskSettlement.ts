/**
 * How a dispatched task reaches its page and how it ends: leases, the start
 * message, stops, and the one `finish` that moves a result to the outbox and
 * reports it (see the outbox rules in `bridgeDispatcher.ts`).
 */
import { logger } from '@/core/services/LoggerService';
import type { BridgeTask, ErrorCode, OpName, TaskResultRequest } from '@/features/bridge/protocol';
import type { BridgeOpCancelMessage } from '@/features/bridge/runtimeMessages';

import type { PairedConnection } from './bridgeClient';
import type { ContentHolder } from './bridgeTabs';
import type { BridgeTaskRecord } from './bridgeTaskStore';
import {
  type LeaseOutcome,
  cancelReason,
  fail,
  holderOf,
  isRecord,
  parseAck,
  refusal,
} from './dispatchOutcome';
import type { DispatchContext } from './dispatcherConfig';
import { leaseDurationFor } from './pageLease';

export type TaskSettlement = ReturnType<typeof createTaskSettlement>;

/** Marks the untracked mode switch-back that follows a timeout or abort. */
export const LEFT_RESTORE_SUFFIX = '.restore-mode';

export function createTaskSettlement({ deps, config, now }: DispatchContext) {
  const { store, lease, tabs, client } = deps;

  /** The current pairing while it is still the one `serverId` names, else null. */
  const ownConnection = async (serverId: string | undefined): Promise<PairedConnection | null> => {
    const connection = await deps.connection();
    return connection && serverId !== undefined && connection.serverId === serverId
      ? connection
      : null;
  };

  /** Hand a result to the server; true once it has answered for it (or nobody is left to tell). */
  const deliver = async (
    taskId: string,
    result: TaskResultRequest,
    serverId: string | undefined,
  ): Promise<boolean> => {
    // Only the server that sent the task may see its result; after a re-pairing it is dropped.
    const connection = await ownConnection(serverId);
    if (connection) {
      const reply = await client.result(connection, taskId, result);
      // Unreachable: the outbox keeps it, and it is handed over before the next poll.
      if (!reply.ok && reply.error.code === 'server-unreachable') return false;
      if (!reply.ok && reply.error.code !== 'gone' && reply.error.code !== 'not-found') {
        logger.warn('voyager serve refused a task result', { taskId, code: reply.error.code });
      }
    }
    await store.removeOutbox(taskId);
    // A worker stopped between the outbox write and the record removal leaves the record behind.
    await store.clearTask(taskId);
    return true;
  };

  /**
   * End the task once: its result enters the outbox as its record goes, so a
   * poll in between still lists it (else the server calls the extension
   * reloaded and drops the result). Then maybe free its lease, then report.
   */
  const finish = async (
    taskId: string,
    result: TaskResultRequest,
    options: { releaseLease: boolean },
  ): Promise<boolean> => {
    const record = await store.getTask(taskId);
    if (!record) return false;
    const owner = record.serverId;
    // A failed open never hands the CLI its tab, so the error names it: the CLI can close it.
    if (!result.ok && record.op === 'conversation.open' && record.tabId !== undefined) {
      result = {
        ...result,
        error: { ...result.error, details: { ...result.error.details, tabId: record.tabId } },
      };
    }
    const ended = await store.finishTask({
      taskId,
      result,
      at: now(),
      ...(owner ? { serverId: owner } : {}),
    });
    if (!ended) return false;
    if (!ended.stored)
      logger.warn('Bridge outbox full; reporting without a stored copy', { taskId });
    if (options.releaseLease && record.leaseId) await lease.release(record.leaseId);
    await deliver(taskId, result, owner);
    return true;
  };

  /** Answer a task that never got a record (busy, unsupported). */
  const refuse = async (
    taskId: string,
    result: TaskResultRequest,
    serverId: string,
  ): Promise<void> => {
    await store.pushOutbox({ taskId, result, at: now(), serverId });
    await deliver(taskId, result, serverId);
  };

  const cancelMessage = (taskId: string, code: ErrorCode): BridgeOpCancelMessage => ({
    type: 'gv.bridge.op.cancel',
    taskId,
    reason: cancelReason(code),
  });

  /** Fire-and-forget stop for a task the background ends on its own (timeout, unpair, policy). */
  const abortInPage = (record: BridgeTaskRecord, reason: ErrorCode): void => {
    const holder = holderOf(record);
    if (!holder) return;
    void tabs.send(holder, cancelMessage(record.taskId, reason)).catch(() => undefined);
  };

  /**
   * Ask the page to stop a `cancelling` task, and report it only once the
   * document confirms (`stopped: true`) or is gone. Anything else keeps the
   * task in flight; the next abort or tick asks again.
   */
  const confirmStop = async (record: BridgeTaskRecord, code: ErrorCode): Promise<void> => {
    const stopped = fail(code, 'Stopped by voyager serve.');
    const holder = holderOf(record);
    // No document was handed this task, so nothing can be running it.
    if (!holder) {
      await finish(record.taskId, stopped, { releaseLease: false });
      return;
    }
    let reply: unknown;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Bounded: a frozen page that never answers must not hold up the poll loop that called us.
    const unanswered = new Promise<undefined>((resolve) => {
      timer = setTimeout(() => resolve(undefined), config.cancelReplyTimeoutMs);
    });
    try {
      reply = await Promise.race([
        tabs.send(holder, cancelMessage(record.taskId, code)),
        unanswered,
      ]);
    } catch {
      // No receiver: the document and its ops are gone. The arbiter's probe frees the lease.
      await finish(record.taskId, stopped, { releaseLease: false });
      return;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
    if (isRecord(reply) && reply.stopped === true) {
      await finish(record.taskId, stopped, { releaseLease: true });
    }
  };

  const leaseFor = async (
    taskId: string,
    op: OpName,
    holder: ContentHolder,
    taskBudgetMs = 0,
  ): Promise<LeaseOutcome> => {
    const acquired = await lease.acquire({
      taskId,
      op,
      ...holder,
      durationMs: leaseDurationFor(op, taskBudgetMs),
    });
    if (acquired.ok) return { lease: acquired.lease };
    const message =
      acquired.code === 'busy'
        ? 'Another op holds the page.'
        : 'An earlier op may still be running; close its ChatGPT tab.';
    return { refused: fail(acquired.code, message) };
  };

  /**
   * `leaseFor`, waiting until `until` while a timeout's mode switch-back holds the page. No
   * job knows of that lease, so serve cannot take turns around it: an op it would refuse as
   * `busy` (another job's, or the close of the job that timed out) waits it out instead.
   */
  const leaseAfterLeftRestore = async (
    taskId: string,
    op: OpName,
    holder: ContentHolder,
    until: number,
  ): Promise<LeaseOutcome> => {
    for (;;) {
      const got = await leaseFor(taskId, op, holder, until - now());
      if (!('refused' in got)) return got;
      const held = await lease.current();
      const switchingBack = held?.taskId.endsWith(LEFT_RESTORE_SUFFIX) === true;
      if (!switchingBack || now() >= until) return got;
      const record = await store.getTask(taskId);
      if (!record || record.cancelling) return got; // stopped meanwhile
      await new Promise((resolve) => setTimeout(resolve, config.leftRestorePollMs));
    }
  };

  /** Close the job's tab and report it; `restoredMode` only when a mode restore was due. */
  const concludeClose = async (
    taskId: string,
    tabId: number,
    restoredMode: boolean | undefined,
  ): Promise<void> => {
    // One owner: our own tab removal, a tick and a late page report can all end up here.
    const claimed = await store.updateTask(
      taskId,
      { phase: 'closing' },
      (current) => current.phase !== 'closing',
    );
    if (!claimed) return;
    const closed = await tabs.close(tabId);
    await lease.releaseForTab(tabId);
    const data = { closed, ...(restoredMode === undefined ? {} : { restoredMode }) };
    await finish(taskId, { ok: true, data }, { releaseLease: false });
  };

  /** The task's page went away: a close still closes; anything else ends with `result`. */
  const endLost = async (
    record: BridgeTaskRecord,
    result: TaskResultRequest,
    releaseLease: boolean,
  ): Promise<void> => {
    if (record.op === 'conversation.close' && record.tabId !== undefined) {
      await concludeClose(record.taskId, record.tabId, false);
      return;
    }
    const ended = record.cancelling
      ? fail(record.cancelling, 'Stopped; its page is gone.')
      : result;
    await finish(record.taskId, ended, { releaseLease });
  };

  const startOp = async (
    record: BridgeTaskRecord,
    holder: ContentHolder,
    task: BridgeTask,
    grant: { leaseId?: string; deadline: number },
  ): Promise<void> => {
    let reply: unknown;
    let sendFailed = false;
    try {
      reply = await tabs.send(holder, {
        type: 'gv.bridge.op.start',
        task,
        grant: { ...grant, docNonce: holder.docNonce },
      });
    } catch {
      sendFailed = true;
    }
    const ack = parseAck(reply);
    if (ack.accepted) return;
    // A refused op dispatched nothing, so its lease can go at once.
    if (record.op === 'conversation.close') {
      if (grant.leaseId) await lease.release(grant.leaseId);
      await concludeClose(record.taskId, holder.tabId, false);
      return;
    }
    await finish(record.taskId, refusal(ack, sendFailed), { releaseLease: true });
  };

  return {
    ownConnection,
    deliver,
    finish,
    refuse,
    abortInPage,
    confirmStop,
    leaseFor,
    leaseAfterLeftRestore,
    concludeClose,
    endLost,
    startOp,
  };
}
