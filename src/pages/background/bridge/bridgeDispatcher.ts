/**
 * Task dispatch (spec §2.2 delivery, §3.1, §3.2). One task at a time: a second
 * one while a task is in flight is answered `busy`, never queued.
 *
 * Everything is event driven from the session record, so a service worker
 * restart loses nothing: a content `op.done` that arrives after a restart is
 * matched against the stored record, not against a promise that died with the
 * old worker. Nothing is retried; a task id already seen is never run again.
 *
 * Page safety: a lease is released only once its document has answered
 * (`op.done`), refused the op, or is gone (tab closed). A task the background
 * gives up on (timeout, abort) keeps its lease until it expires; the arbiter
 * then lets a new holder in only after the old document confirms it stopped.
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
import type { BridgeTaskRecord, BridgeTaskStore } from './bridgeTaskStore';
import { LEASE_DURATION_MS, type PageLeaseArbiter } from './pageLease';

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
  readonly helloTimeoutMs: number;
  readonly readyTimeoutMs: number;
  /**
   * A running op silent for this long gets a document probe. Background-tab
   * throttling can stretch the 15 s progress beat to about a minute, so only a
   * probe that fails (no document) ends the task.
   */
  readonly silenceProbeMs: number;
  /** Slack past a task's deadline before the background gives it up. */
  readonly deadlineGraceMs: number;
  readonly supportedOps: ReadonlySet<OpName>;
}

export const DEFAULT_DISPATCHER_CONFIG: DispatcherConfig = {
  interactiveNeedsForeground: true,
  openTabActive: true,
  helloTimeoutMs: 30_000,
  readyTimeoutMs: 30_000,
  silenceProbeMs: 120_000,
  deadlineGraceMs: 30_000,
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
  onAbort(taskId: string, reason: ErrorCode): Promise<void>;
  onHello(sender: chrome.runtime.MessageSender, docNonce: string): Promise<boolean>;
  onProgress(sender: chrome.runtime.MessageSender, message: ContentReport): Promise<boolean>;
  onDone(sender: chrome.runtime.MessageSender, message: ContentDone): Promise<boolean>;
  onTabRemoved(tabId: number): Promise<void>;
  /** Builtin off, unpaired or policy flipped: stop the current task with `code`. */
  stopCurrent(code: ErrorCode, message: string): Promise<void>;
  /** Policy inputs changed: stop the current task if its op is no longer allowed. */
  recheckPolicy(): Promise<void>;
  /** Periodic watchdog (alarm): deadlines, silent documents, vanished tabs. */
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

function holderOf(record: BridgeTaskRecord): ContentHolder | null {
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
  return reason === 'doc-mismatch' || reason === 'busy' || reason === 'not-attached'
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

export function createBridgeDispatcher(deps: DispatcherDeps): BridgeDispatcher {
  const now = deps.now ?? (() => Date.now());
  const config: DispatcherConfig = { ...DEFAULT_DISPATCHER_CONFIG, ...deps.config };
  const { store, lease, tabs, client } = deps;
  let lastJobId: string | null = null;

  const deliver = async (taskId: string, result: TaskResultRequest): Promise<void> => {
    const connection = await deps.connection();
    if (!connection) return;
    const reply = await client.result(connection, taskId, result);
    if (reply.ok || reply.error.code === 'gone' || reply.error.code === 'not-found') return;
    if (reply.error.code === 'server-unreachable') {
      const kept = await store.pushOutbox({ taskId, result, at: now() });
      if (!kept) logger.warn('Bridge outbox full; a result was dropped', { taskId });
      return;
    }
    logger.warn('voyager serve refused a task result', { taskId, code: reply.error.code });
  };

  /** End the task once: clear its record, maybe free its lease, then report. */
  const finish = async (
    taskId: string,
    result: TaskResultRequest,
    options: { releaseLease: boolean },
  ): Promise<boolean> => {
    const record = await store.getTask();
    if (!record || record.taskId !== taskId || !(await store.clearTask(taskId))) return false;
    if (options.releaseLease && record.leaseId) await lease.release(record.leaseId);
    await deliver(taskId, result);
    return true;
  };

  const abortInPage = (record: BridgeTaskRecord, reason: ErrorCode): void => {
    const holder = holderOf(record);
    if (!holder) return;
    const message: BridgeOpCancelMessage = {
      type: 'gv.bridge.op.cancel',
      taskId: record.taskId,
      reason: cancelReason(reason),
    };
    void tabs.send(holder, message).catch(() => undefined);
  };

  const scheduleTick = (delayMs: number): void => {
    if (delayMs > 5 * 60_000) return; // the wake alarm covers long waits
    setTimeout(() => void tick().catch(() => undefined), Math.max(0, delayMs) + 50);
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
    // A refused op dispatched nothing, so its lease can go at once.
    if (!ack.accepted)
      await finish(record.taskId, refusal(ack, sendFailed), { releaseLease: true });
  };

  const dispatchToContent = async (task: ValidatedBridgeTask, record: BridgeTaskRecord) => {
    const tab = await store.getTab();
    if (!tab)
      return finish(task.taskId, fail('tab-closed', 'No bridge tab is open.'), {
        releaseLease: false,
      });
    if (!tab.docNonce) {
      return finish(task.taskId, fail('document-lost', 'The bridge tab has not loaded yet.'), {
        releaseLease: false,
      });
    }
    const holder: ContentHolder = {
      tabId: tab.tabId,
      docNonce: tab.docNonce,
      ...(tab.documentId ? { documentId: tab.documentId } : {}),
    };
    const leased = LEASED_OPS.has(task.op);
    if (leased && config.interactiveNeedsForeground && !(await tabs.isActive(holder.tabId))) {
      return finish(task.taskId, fail('tab-hidden', 'Bring the bridge tab to the front.'), {
        releaseLease: false,
      });
    }
    let leaseId: string | undefined;
    let deadline = record.deadline;
    if (leased) {
      const acquired = await lease.acquire({
        taskId: task.taskId,
        op: task.op,
        ...holder,
        durationMs: LEASE_DURATION_MS[task.op] ?? 30_000,
      });
      if (!acquired.ok) {
        const message =
          acquired.code === 'busy'
            ? 'Another op holds the page.'
            : 'An earlier op may still be running; close its ChatGPT tab.';
        return finish(task.taskId, fail(acquired.code, message), { releaseLease: false });
      }
      leaseId = acquired.lease.leaseId;
      deadline = Math.min(deadline, acquired.lease.deadline);
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
    const running = await store.updateTask(task.taskId, {
      state: 'running',
      ...holder,
      ...(leaseId ? { leaseId } : {}),
      lastProgressAt: now(),
    });
    if (!running) return releaseOwn(); // stopped while waiting
    await startOp(running, holder, task, { ...(leaseId ? { leaseId } : {}), deadline });
    scheduleTick(running.deadline + config.deadlineGraceMs - now());
  };

  const openConversation = async (
    task: Extract<ValidatedBridgeTask, { op: 'conversation.open' }>,
  ) => {
    const conversationId = 'conversationId' in task.params ? task.params.conversationId : undefined;
    let tabId: number;
    try {
      tabId = await tabs.open(task.jobId, conversationUrl(conversationId), config.openTabActive);
    } catch (error) {
      return finish(task.taskId, fail('tab-closed', `Could not open a tab: ${String(error)}`), {
        releaseLease: false,
      });
    }
    const updated = await store.updateTask(task.taskId, {
      state: 'running',
      tabId,
      phase: 'awaiting-hello',
      deadline: now() + config.helloTimeoutMs,
      ...(conversationId ? { expectConversationId: conversationId } : {}),
    });
    if (updated) scheduleTick(config.helloTimeoutMs);
  };

  const startReady = async (record: BridgeTaskRecord, holder: ContentHolder) => {
    const deadline = now() + config.readyTimeoutMs;
    const running = await store.updateTask(record.taskId, {
      phase: 'ready',
      ...holder,
      deadline,
      lastProgressAt: now(),
    });
    if (!running) return;
    const readyTask: BridgeTask = {
      taskId: record.taskId,
      jobId: record.jobId,
      op: 'conversation.ready',
      opVersion: 1,
      params: record.expectConversationId
        ? { expect: { conversationId: record.expectConversationId } }
        : {},
      deadlineMs: config.readyTimeoutMs,
      issuedAt: now(),
    };
    await startOp(running, holder, readyTask, { deadline });
    scheduleTick(config.readyTimeoutMs);
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
    const closed = await tabs.close(tab.tabId);
    await lease.releaseForTab(tab.tabId);
    await finish(task.taskId, { ok: true, data: { closed } }, { releaseLease: false });
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
    const t = now();
    const grace = record.phase ? 0 : config.deadlineGraceMs;
    if (t > record.deadline + grace) {
      abortInPage(record, 'timeout');
      await finish(record.taskId, fail('timeout', `${record.op} did not finish in time.`), {
        releaseLease: false,
      });
      return;
    }
    if (record.tabId !== undefined && !(await tabs.exists(record.tabId))) {
      await deps.lease.releaseForTab(record.tabId);
      await finish(record.taskId, fail('tab-closed', 'The bridge tab was closed.'), {
        releaseLease: false,
      });
      return;
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
      await finish(record.taskId, fail('document-lost', 'The bridge tab lost its page.'), {
        releaseLease: true,
      });
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
    if (current) return deliver(task.taskId, fail('busy', 'Another task is running.'));
    if (!config.supportedOps.has(task.op) || !supportsOpVersion(task.op, task.opVersion)) {
      return deliver(
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
      const record = await store.getTask();
      if (!record || record.taskId !== taskId) return;
      abortInPage(record, reason);
      await finish(taskId, fail(reason, 'Stopped by voyager serve.'), { releaseLease: false });
    },

    onHello: async (sender, docNonce) => {
      await deps.ready();
      const accepted = await tabs.acceptHello(sender, docNonce);
      if (!accepted) return false;
      const record = await store.getTask();
      if (!record || record.tabId !== accepted.current.tabId) return true;
      if (record.op === 'conversation.open' && record.phase === 'awaiting-hello') {
        await startReady(record, {
          tabId: accepted.current.tabId,
          docNonce,
          ...(accepted.current.documentId ? { documentId: accepted.current.documentId } : {}),
        });
      } else if (record.docNonce && record.docNonce !== docNonce) {
        // The tab loaded a new document under the running op; the old one may sit in bfcache,
        // so its lease stays until it expires and the arbiter has confirmed it stopped.
        await finish(record.taskId, fail('document-lost', 'The bridge tab navigated away.'), {
          releaseLease: false,
        });
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
      const isOpen = record.op === 'conversation.open';
      const outcome = normalizeOutcome(isOpen ? 'conversation.ready' : record.op, message.outcome);
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
      if (record?.tabId === tabId && record.op !== 'conversation.close') {
        await finish(record.taskId, fail('tab-closed', 'The bridge tab was closed.'), {
          releaseLease: false,
        });
      }
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
      const [record, outbox] = await Promise.all([store.getTask(), store.listOutbox()]);
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
      const connection = await deps.connection();
      if (!connection) return false;
      for (const entry of await store.listOutbox()) {
        const reply = await client.result(connection, entry.taskId, entry.result);
        if (!reply.ok && reply.error.code === 'server-unreachable') return false;
        await store.removeOutbox(entry.taskId);
      }
      return true;
    },

    current: () => store.getTask(),
  };
}

export type { BridgeError };
