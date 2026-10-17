/**
 * Persistent state of the Local Bridge background (spec §3.1). The service
 * worker can be stopped at any moment, so nothing that decides behaviour lives
 * only in memory:
 *   - `storage.session` (cleared with the browser session, closed to content
 *     scripts by default) holds the one in-flight task, the bridge tab, the
 *     page lease (`pageLease.ts`), the pending pairing intent and the task ids
 *     already seen;
 *   - `storage.local` holds the outbox: results the server could not take yet.
 *
 * Session keys are module constants rather than `StorageKeys`: backup policies
 * only describe sync and local storage.
 */
import { StorageKeys } from '@/core/types/common';
import { type OpName, type TaskResultRequest, isOpName } from '@/features/bridge/protocol';

export const BRIDGE_SESSION_KEYS = {
  lease: 'gvBridgePageLease',
  task: 'gvBridgeTask',
  tab: 'gvBridgeTab',
  pairIntent: 'gvBridgePairIntent',
  seenTasks: 'gvBridgeSeenTasks',
} as const;

export interface StorageAreaLike {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
}

/** In-memory stand-in where `storage.session` is missing; state then lives as long as the worker. */
export function createMemoryArea(): StorageAreaLike {
  const values: Record<string, unknown> = {};
  return {
    async get(keys) {
      const names = typeof keys === 'string' ? [keys] : keys;
      return Object.fromEntries(names.filter((k) => k in values).map((k) => [k, values[k]]));
    },
    async set(items) {
      Object.assign(values, structuredClone(items));
    },
    async remove(keys) {
      for (const key of typeof keys === 'string' ? [keys] : keys) delete values[key];
    },
  };
}

export type BridgeTaskState = 'acked' | 'running';

export interface BridgeTaskRecord {
  readonly taskId: string;
  readonly jobId: string;
  readonly op: OpName;
  readonly state: BridgeTaskState;
  readonly startedAt: number;
  /** Absolute time after which the background gives the task up as `timeout`. */
  readonly deadline: number;
  readonly lastProgressAt: number;
  readonly progressSeq: number;
  readonly tabId?: number;
  readonly documentId?: string;
  readonly docNonce?: string;
  readonly leaseId?: string;
  /** `conversation.open` only: waiting for the new tab's hello, then for its ready result. */
  readonly phase?: 'awaiting-hello' | 'ready';
  readonly expectConversationId?: string;
}

export interface BridgeTabRecord {
  readonly tabId: number;
  /** The job whose `conversation.open` created the tab; only it may close the tab. */
  readonly jobId: string;
  readonly openedAt: number;
  readonly docNonce?: string;
  readonly documentId?: string;
}

export interface OutboxEntry {
  readonly taskId: string;
  readonly result: TaskResultRequest;
  readonly at: number;
}

export const OUTBOX_MAX_ENTRIES = 5;
export const OUTBOX_MAX_BYTES = 1024 * 1024;
const MAX_SEEN_TASKS = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const optional = <T>(value: unknown, guard: (v: unknown) => v is T): boolean =>
  value === undefined || guard(value);

export function parseTaskRecord(raw: unknown): BridgeTaskRecord | null {
  if (!isRecord(raw)) return null;
  const ok =
    isText(raw.taskId) &&
    isText(raw.jobId) &&
    isOpName(raw.op) &&
    (raw.state === 'acked' || raw.state === 'running') &&
    isInt(raw.startedAt) &&
    isInt(raw.deadline) &&
    isInt(raw.lastProgressAt) &&
    isInt(raw.progressSeq) &&
    optional(raw.tabId, isInt) &&
    optional(raw.documentId, isText) &&
    optional(raw.docNonce, isText) &&
    optional(raw.leaseId, isText) &&
    (raw.phase === undefined || raw.phase === 'awaiting-hello' || raw.phase === 'ready') &&
    optional(raw.expectConversationId, isText);
  return ok ? (raw as unknown as BridgeTaskRecord) : null;
}

export function parseTabRecord(raw: unknown): BridgeTabRecord | null {
  if (!isRecord(raw)) return null;
  const ok =
    isInt(raw.tabId) &&
    isText(raw.jobId) &&
    isInt(raw.openedAt) &&
    optional(raw.docNonce, isText) &&
    optional(raw.documentId, isText);
  return ok ? (raw as unknown as BridgeTabRecord) : null;
}

function parseOutbox(raw: unknown): OutboxEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is OutboxEntry =>
      isRecord(entry) && isText(entry.taskId) && isRecord(entry.result) && isInt(entry.at),
  );
}

export interface BridgeTaskStore {
  getTask(): Promise<BridgeTaskRecord | null>;
  setTask(record: BridgeTaskRecord): Promise<void>;
  /** Update the record only while it still belongs to `taskId`; returns the new record. */
  updateTask(
    taskId: string,
    patch: Partial<Omit<BridgeTaskRecord, 'taskId'>>,
  ): Promise<BridgeTaskRecord | null>;
  /** Clear the record only while it still belongs to `taskId`; true when this call cleared it. */
  clearTask(taskId: string): Promise<boolean>;
  getTab(): Promise<BridgeTabRecord | null>;
  setTab(record: BridgeTabRecord): Promise<void>;
  updateTab(tabId: number, patch: Partial<Omit<BridgeTabRecord, 'tabId'>>): Promise<void>;
  clearTab(tabId: number): Promise<boolean>;
  /** Remember `taskId`; false when it had been seen already (a redelivery). */
  markSeen(taskId: string): Promise<boolean>;
  listOutbox(): Promise<readonly OutboxEntry[]>;
  /** False when the entry does not fit the caps; the result is then lost. */
  pushOutbox(entry: OutboxEntry): Promise<boolean>;
  removeOutbox(taskId: string): Promise<void>;
}

export function createBridgeTaskStore(areas: {
  readonly session: StorageAreaLike;
  readonly local: StorageAreaLike;
}): BridgeTaskStore {
  const { session, local } = areas;
  const K = BRIDGE_SESSION_KEYS;
  // One read-modify-write at a time: content messages arrive concurrently.
  let chain: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const run = chain.then(work, work);
    chain = run.catch(() => undefined);
    return run;
  };
  const read = async (area: StorageAreaLike, key: string): Promise<unknown> =>
    (await area.get(key))[key];
  const getTask = async () => parseTaskRecord(await read(session, K.task));
  const getTab = async () => parseTabRecord(await read(session, K.tab));

  return {
    getTask,
    setTask: (record) => serial(() => session.set({ [K.task]: record })),
    updateTask: (taskId, patch) =>
      serial(async () => {
        const current = await getTask();
        if (!current || current.taskId !== taskId) return null;
        const next = { ...current, ...patch, taskId };
        await session.set({ [K.task]: next });
        return next;
      }),
    clearTask: (taskId) =>
      serial(async () => {
        const current = await getTask();
        if (!current || current.taskId !== taskId) return false;
        await session.remove(K.task);
        return true;
      }),
    getTab,
    setTab: (record) => serial(() => session.set({ [K.tab]: record })),
    updateTab: (tabId, patch) =>
      serial(async () => {
        const current = await getTab();
        if (!current || current.tabId !== tabId) return;
        await session.set({ [K.tab]: { ...current, ...patch, tabId } });
      }),
    clearTab: (tabId) =>
      serial(async () => {
        const current = await getTab();
        if (!current || current.tabId !== tabId) return false;
        await session.remove(K.tab);
        return true;
      }),
    markSeen: (taskId) =>
      serial(async () => {
        const raw = await read(session, K.seenTasks);
        const seen = Array.isArray(raw) ? raw.filter(isText) : [];
        if (seen.includes(taskId)) return false;
        await session.set({ [K.seenTasks]: [...seen, taskId].slice(-MAX_SEEN_TASKS) });
        return true;
      }),
    listOutbox: async () => parseOutbox(await read(local, StorageKeys.BRIDGE_OUTBOX)),
    pushOutbox: (entry) =>
      serial(async () => {
        const entries = parseOutbox(await read(local, StorageKeys.BRIDGE_OUTBOX)).filter(
          (existing) => existing.taskId !== entry.taskId,
        );
        const next = [...entries, entry];
        if (next.length > OUTBOX_MAX_ENTRIES) return false;
        if (new TextEncoder().encode(JSON.stringify(next)).length > OUTBOX_MAX_BYTES) return false;
        await local.set({ [StorageKeys.BRIDGE_OUTBOX]: next });
        return true;
      }),
    removeOutbox: (taskId) =>
      serial(async () => {
        const entries = parseOutbox(await read(local, StorageKeys.BRIDGE_OUTBOX));
        const next = entries.filter((entry) => entry.taskId !== taskId);
        if (next.length === entries.length) return;
        if (next.length === 0) await local.remove(StorageKeys.BRIDGE_OUTBOX);
        else await local.set({ [StorageKeys.BRIDGE_OUTBOX]: next });
      }),
  };
}
