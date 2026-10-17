/**
 * Task dispatch (spec §2.2 delivery, §3.1, §3.2). One task at a time: a second
 * one while a task is in flight is answered `busy`, never queued.
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
  type BridgeTask,
  type ConversationOpenResult,
  type ConversationReadyResult,
  type ErrorCode,
  type InflightState,
  type OpName,
  type TaskResultRequest,
  type ValidatedBridgeTask,
  bridgeError,
  supportsOpVersion,
  validateMessage,
  validateOpResult,
} from '@/features/bridge/protocol';
import {
  type BridgeOpCancelMessage,
  type BridgeOpStartAck,
  LEASED_OPS,
} from '@/features/bridge/runtimeMessages';

import type { BridgeClient, BridgeConnection } from './bridgeClient';
import type { BridgePolicy } from './bridgePolicy';
import { type BridgeTabs, type ContentHolder, conversationUrl, senderIsHolder } from './bridgeTabs';
import type { BridgeTabRecord, BridgeTaskRecord, BridgeTaskStore } from './bridgeTaskStore';
import {
  LEASE_DURATION_MS,
  LEASE_PROBE_TIMEOUT_MS,
  type PageLease,
  type PageLeaseArbiter,
} from './pageLease';

/** Ops this build can run: the service worker's own plus what the Phase B content runtime implements. */
export const SUPPORTED_BRIDGE_OPS: ReadonlySet<OpName> = new Set<OpName>([
  'conversation.open',
  'conversation.close',
  'conversation.ready',
  'composer.send',
  'turns.waitReply',
  'turns.read',
]);

export interface DispatcherConfig {
  /** Q2: an interactive op in a background tab fails `tab-hidden` instead of running. */
  readonly interactiveNeedsForeground: boolean;
  /** Open bridge tabs in the foreground, where interactive ops are allowed. */
  readonly openTabActive: boolean;
  /**
   * A running op silent for this long gets a document probe. Background-tab
   * throttling can stretch the 15 s progress beat to about a minute, so only a
   * probe that fails (no document) ends the task.
   */
  readonly silenceProbeMs: number;
  /** Slack past a task's deadline before the background gives it up. */
  readonly deadlineGraceMs: number;
  /** What a close keeps of its budget for closing the tab after switching its mode back. */
  readonly closeMarginMs: number;
  /** How long a page gets to answer `op.cancel` before the stop counts as unconfirmed for now. */
  readonly cancelReplyTimeoutMs: number;
  readonly supportedOps: ReadonlySet<OpName>;
}

export const DEFAULT_DISPATCHER_CONFIG: DispatcherConfig = {
  interactiveNeedsForeground: true,
  openTabActive: true,
  silenceProbeMs: 120_000,
  deadlineGraceMs: 30_000,
  closeMarginMs: 2_000,
  cancelReplyTimeoutMs: LEASE_PROBE_TIMEOUT_MS,
  supportedOps: SUPPORTED_BRIDGE_OPS,
};

export interface DispatcherDeps {
  readonly store: BridgeTaskStore;
  readonly lease: PageLeaseArbiter;
  readonly policy: Pick<BridgePolicy, 'checkOp' | 'refreshIfOld'>;
  readonly tabs: BridgeTabs;
  readonly client: Pick<BridgeClient, 'ack' | 'progress' | 'result'>;
  readonly connection: () => Promise<BridgeConnection | null>;
  readonly ready: () => Promise<void>;
  readonly now?: () => number;
  readonly config?: Partial<DispatcherConfig>;
}

export interface BridgeDispatcher {
  onTask(task: ValidatedBridgeTask): Promise<void>;
  /** The server gave the task up: stop it, and report it once its page confirms. */
  onAbort(taskId: string, reason: ErrorCode): Promise<void>;
  onHello(sender: chrome.runtime.MessageSender, docNonce: string): Promise<boolean>;
  onProgress(sender: chrome.runtime.MessageSender, message: ContentReport): Promise<boolean>;
  onDone(sender: chrome.runtime.MessageSender, message: ContentDone): Promise<boolean>;
  onTabRemoved(tabId: number): Promise<void>;
  /** Builtin off, unpaired or policy flipped: stop the current task with `code`. */
  stopCurrent(code: ErrorCode, message: string): Promise<void>;
  /** Policy inputs changed: stop the current task if its op is no longer allowed. */
  recheckPolicy(): Promise<void>;
  /** Periodic watchdog (alarm): deadlines, silent documents, vanished tabs, pending stops. */
  tick(): Promise<void>;
  inflight(): Promise<{ taskId: string; state: InflightState }[]>;
  drainOutbox(): Promise<boolean>;
  current(): Promise<BridgeTaskRecord | null>;
}

export interface ContentReport {
  readonly taskId: string;
  readonly docNonce: string;
  readonly progress: unknown;
}

export interface ContentDone {
  readonly taskId: string;
  readonly docNonce: string;
  readonly outcome: unknown;
}

const fail = (code: ErrorCode, message: string, details?: Record<string, unknown>) =>
  ({ ok: false, error: bridgeError(code, message, details) }) as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Why the page has to stop, in the content runtime's vocabulary. */
export function cancelReason(code: ErrorCode): BridgeOpCancelMessage['reason'] {
  if (code === 'timeout') return 'job-timeout';
  if (code === 'not-paired') return 'unpaired';
  if (
    code === 'policy-denied' ||
    code === 'policy-stale' ||
    code === 'bridge-disabled' ||
    code === 'permission-missing'
  ) {
    return 'policy-denied';
  }
  return 'cli-cancel';
}

function holderOf(record: BridgeTaskRecord | BridgeTabRecord): ContentHolder | null {
  if (record.tabId === undefined || !record.docNonce) return null;
  return {
    tabId: record.tabId,
    docNonce: record.docNonce,
    ...(record.documentId ? { documentId: record.documentId } : {}),
  };
}

function parseAck(reply: unknown): BridgeOpStartAck {
  if (isRecord(reply) && reply.accepted === true) return { accepted: true };
  const reason = isRecord(reply) ? reply.reason : undefined;
  return reason === 'doc-mismatch' ||
    reason === 'busy' ||
    reason === 'not-attached' ||
    reason === 'cancelled'
    ? { accepted: false, reason }
    : { accepted: false };
}

function refusal(ack: BridgeOpStartAck, sendFailed: boolean): TaskResultRequest {
  if (sendFailed || ack.reason === 'doc-mismatch') {
    return fail('document-lost', 'The bridge tab no longer holds the document this task was for.');
  }
  if (ack.reason === 'busy') return fail('busy', 'The page is already running an op.');
  if (ack.reason === 'not-attached')
    return fail('bridge-disabled', 'The page bridge is not running.');
  if (ack.reason === 'cancelled') return fail('cancelled', 'The task was stopped before it ran.');
  return fail('document-lost', 'The page did not accept the op.');
}

/** Check what the page reported: a well-formed error, or data shaped like `op`'s result. */
function normalizeOutcome(op: OpName, outcome: unknown): TaskResultRequest {
  if (!isRecord(outcome)) return fail('unverified', 'The page returned no outcome.');
  if (outcome.ok === false) {
    const error = validateMessage('bridgeError', outcome.error);
    return error.ok
      ? { ok: false, error: error.value }
      : fail('unverified', 'The page returned a malformed error.');
  }
  if (outcome.ok !== true) return fail('unverified', 'The page returned no outcome.');
  const data = validateOpResult(op, outcome.data);
  return data.ok
    ? { ok: true, data: data.value }
    : fail('unverified', 'The page returned a malformed result.', {
        issues: data.issues.slice(0, 5),
      });
}

/** Ops whose page side is `conversation.ready` (open and close run it as a step). */
const runsReady = (op: OpName): boolean =>
  op === 'conversation.ready' || op === 'conversation.open' || op === 'conversation.close';

const notCancelling = (record: BridgeTaskRecord): boolean => record.cancelling === undefined;

type LeaseOutcome = { readonly lease: PageLease } | { readonly refused: TaskResultRequest };

export function createBridgeDispatcher(deps: DispatcherDeps): BridgeDispatcher {
  const now = deps.now ?? (() => Date.now());
  const config: DispatcherConfig = { ...DEFAULT_DISPATCHER_CONFIG, ...deps.config };
  const { store, lease, tabs, client } = deps;
  let lastJobId: string | null = null;

  /** Hand a result to the server; true once it has answered for it (or nobody is left to tell). */
  const deliver = async (taskId: string, result: TaskResultRequest): Promise<boolean> => {
    const connection = await deps.connection();
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
    const record = await store.getTask();
    if (!record || record.taskId !== taskId) return false;
    const ended = await store.finishTask({ taskId, result, at: now() });
    if (!ended) return false;
    if (!ended.stored)
      logger.warn('Bridge outbox full; reporting without a stored copy', { taskId });
    if (options.releaseLease && record.leaseId) await lease.release(record.leaseId);
    await deliver(taskId, result);
    return true;
  };

  /** Answer a task that never got a record (busy, unsupported). */
  const refuse = async (taskId: string, result: TaskResultRequest): Promise<void> => {
    await store.pushOutbox({ taskId, result, at: now() });
    await deliver(taskId, result);
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

  const cancel = async (taskId: string, code: ErrorCode): Promise<void> => {
    const marked =
      (await store.updateTask(taskId, { cancelling: code }, notCancelling)) ??
      (await store.getTask());
    if (!marked || marked.taskId !== taskId || !marked.cancelling) return;
    await confirmStop(marked, marked.cancelling);
  };

  const scheduleTick = (delayMs: number): void => {
    if (delayMs > 5 * 60_000) return; // the wake alarm covers long waits
    setTimeout(() => void tick().catch(() => undefined), Math.max(0, delayMs) + 50);
  };

  const leaseFor = async (
    taskId: string,
    op: OpName,
    holder: ContentHolder,
  ): Promise<LeaseOutcome> => {
    const acquired = await lease.acquire({
      taskId,
      op,
      ...holder,
      durationMs: LEASE_DURATION_MS[op] ?? 30_000,
    });
    if (acquired.ok) return { lease: acquired.lease };
    const message =
      acquired.code === 'busy'
        ? 'Another op holds the page.'
        : 'An earlier op may still be running; close its ChatGPT tab.';
    return { refused: fail(acquired.code, message) };
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

  const dispatchToContent = async (task: ValidatedBridgeTask, record: BridgeTaskRecord) => {
    const tab = await store.getTab();
    if (!tab)
      return finish(task.taskId, fail('tab-closed', 'No bridge tab is open.'), {
        releaseLease: false,
      });
    const holder = holderOf(tab);
    if (!holder) {
      return finish(task.taskId, fail('document-lost', 'The bridge tab has not loaded yet.'), {
        releaseLease: false,
      });
    }
    const leased = LEASED_OPS.has(task.op);
    // `conversation.ready` clicks only to switch modes; the page refuses a hidden tab then.
    const needsFront = leased && task.op !== 'conversation.ready';
    if (needsFront && config.interactiveNeedsForeground && !(await tabs.isActive(holder.tabId))) {
      return finish(task.taskId, fail('tab-hidden', 'Bring the bridge tab to the front.'), {
        releaseLease: false,
      });
    }
    let leaseId: string | undefined;
    let deadline = record.deadline;
    if (leased) {
      const got = await leaseFor(task.taskId, task.op, holder);
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

  const openConversation = async (
    task: Extract<ValidatedBridgeTask, { op: 'conversation.open' }>,
  ) => {
    const current = await store.getTask();
    if (current?.taskId !== task.taskId || current.cancelling) return; // stopped meanwhile
    const conversationId = 'conversationId' in task.params ? task.params.conversationId : undefined;
    let tabId: number;
    try {
      tabId = await tabs.open(task.jobId, conversationUrl(conversationId), config.openTabActive);
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
    const got = await leaseFor(taskId, 'conversation.ready', holder);
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
    const record = await store.getTask();
    if (!holder || !tab.restoreMode || !record || record.taskId !== task.taskId) return false;
    if (!(await tabs.exists(tab.tabId))) return false;
    const until = record.deadline - config.closeMarginMs;
    if (until <= now()) return false;
    const got = await leaseFor(task.taskId, 'conversation.ready', holder);
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
      params: { ensureMode: tab.restoreMode },
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
    const tab = await store.getTab();
    if (!tab || tab.tabId !== task.params.tabId || tab.jobId !== task.jobId) {
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
    const tab = await store.getTab();
    if (!tab || tab.tabId !== tabId) return;
    if (ready.switchedMode && !tab.restoreMode) {
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

  const tick = async (): Promise<void> => {
    await deps.ready();
    const record = await store.getTask();
    if (!record) return;
    // A stop the page has not confirmed yet: ask again (the server may be away).
    if (record.cancelling) return confirmStop(record, record.cancelling);
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
      return;
    }
    if (record.tabId !== undefined && !(await tabs.exists(record.tabId))) {
      await deps.lease.releaseForTab(record.tabId);
      return endLost(record, fail('tab-closed', 'The bridge tab was closed.'), false);
    }
    const holder = holderOf(record);
    if (record.state !== 'running' || !holder || t - record.lastProgressAt < config.silenceProbeMs)
      return;
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

  const stopCurrent = async (code: ErrorCode, message: string) => {
    const record = await store.getTask();
    if (!record) return;
    abortInPage(record, code);
    await finish(record.taskId, fail(code, message), { releaseLease: false });
  };

  const intake = async (task: ValidatedBridgeTask): Promise<unknown> => {
    await deps.ready();
    const current = await store.getTask();
    const connection = await deps.connection();
    if (current?.taskId === task.taskId) {
      // A redelivery of the task we run: confirm again, run nothing.
      if (connection) await client.ack(connection, task.taskId);
      return;
    }
    if (!(await store.markSeen(task.taskId))) return; // seen before: never run twice
    if (current) return refuse(task.taskId, fail('busy', 'Another task is running.'));
    if (!config.supportedOps.has(task.op) || !supportsOpVersion(task.op, task.opVersion)) {
      return refuse(
        task.taskId,
        fail('unsupported-op', `${task.op} v${task.opVersion} is not supported.`),
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
    };
    // Ack first: a catalog check below can outlast the server's 10 s ack window.
    await store.setTask(record);
    if (connection) await client.ack(connection, task.taskId);
    if (task.jobId !== lastJobId) {
      lastJobId = task.jobId;
      await deps.policy.refreshIfOld();
    }
    const denied = await deps.policy.checkOp(task.op);
    if (denied) {
      return finish(task.taskId, fail(denied.code, denied.message), { releaseLease: false });
    }
    if (task.op === 'conversation.open') return openConversation(task);
    if (task.op === 'conversation.close') return closeConversation(task);
    return dispatchToContent(task, record);
  };

  return {
    onTask: async (task) => {
      await intake(task);
    },

    onAbort: async (taskId, reason) => {
      await deps.ready();
      await cancel(taskId, reason);
    },

    onHello: async (sender, docNonce) => {
      await deps.ready();
      const accepted = await tabs.acceptHello(sender, docNonce);
      if (!accepted) return false;
      const record = await store.getTask();
      if (!record || record.tabId !== accepted.current.tabId) return true;
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
      const record = await store.getTask();
      if (!record || record.taskId !== message.taskId) return false;
      if (!senderIsHolder(sender, message.docNonce, record)) return false;
      const seq = record.progressSeq + 1;
      await store.updateTask(record.taskId, { lastProgressAt: now(), progressSeq: seq });
      const connection = await deps.connection();
      if (connection && isRecord(message.progress)) {
        await client.progress(connection, record.taskId, seq, message.progress);
      }
      return true;
    },

    onDone: async (sender, message) => {
      await deps.ready();
      const record = await store.getTask();
      if (
        !record ||
        record.taskId !== message.taskId ||
        !senderIsHolder(sender, message.docNonce, record)
      ) {
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
        const tab = await store.getTab();
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
      const record = await store.getTask();
      if (record?.tabId !== tabId) return;
      if (record.op === 'conversation.close') {
        // Our own close removes the tab too; only a removal mid-restore ends the close here.
        if (record.phase === 'restoring-mode') await concludeClose(record.taskId, tabId, false);
        return;
      }
      await endLost(record, fail('tab-closed', 'The bridge tab was closed.'), false);
    },

    stopCurrent,

    recheckPolicy: async () => {
      await deps.ready();
      const record = await store.getTask();
      if (!record) return;
      const denied = await deps.policy.checkOp(record.op);
      if (denied) await stopCurrent(denied.code, denied.message);
    },

    tick,

    inflight: async () => {
      // Record first, outbox second: a result only ever moves from the one to the other.
      const record = await store.getTask();
      const outbox = await store.listOutbox();
      const list: { taskId: string; state: InflightState }[] = outbox.map((entry) => ({
        taskId: entry.taskId,
        state: 'running',
      }));
      if (record && !list.some((entry) => entry.taskId === record.taskId)) {
        list.push({ taskId: record.taskId, state: record.state });
      }
      return list.slice(0, 8);
    },

    drainOutbox: async () => {
      if (!(await deps.connection())) return false;
      for (const entry of await store.listOutbox()) {
        if (!(await deliver(entry.taskId, entry.result))) return false;
      }
      return true;
    },

    current: () => store.getTask(),
  };
}

export type { BridgeError };
