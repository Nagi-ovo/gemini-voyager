/**
 * Persistent state of the Local Bridge background (spec §3.1). The service
 * worker can be stopped at any moment, so nothing that decides behaviour lives
 * only in memory:
 *   - `storage.session` (cleared with the browser session, closed to content
 *     scripts by default) holds the tasks in flight (one per job, of up to
 *     `maxTasks` jobs at once), the bridge tabs and the job that opened each,
 *     the page lease (`pageLease.ts`), the pending pairing intent and the task
 *     ids already seen;
 *   - `storage.local` holds the outbox: results the server could not take yet.
 *
 * Session keys are module constants rather than `StorageKeys`: backup policies
 * only describe sync and local storage. Chrome also clears `storage.session`
 * when the extension updates or reloads, so a key renamed here needs no migration.
 */
import { StorageKeys } from '@/core/types/common';
import {
  type ErrorCode,
  type OpName,
  type SwitchableMode,
  type TaskResultRequest,
  isErrorCode,
  isOpName,
} from '@/features/bridge/protocol';

export const BRIDGE_SESSION_KEYS = {
  lease: 'gvBridgePageLease',
  /** Tasks in flight, oldest first. */
  tasks: 'gvBridgeTasks',
  /** Bridge tabs, oldest first, each owned by the job whose open created it. */
  tabs: 'gvBridgeTabs',
  pairIntent: 'gvBridgePairIntent',
  seenTasks: 'gvBridgeSeenTasks',
  /**
   * One {@link BridgeTabOwner} per job that opened a tab, oldest first: its current tab, and
   * whether it ran beside other jobs. A job whose tab is gone never borrows another job's.
   */
  tabJobs: 'gvBridgeTabJobs',
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
  /**
   * `conversation.open`: waiting for the new tab's hello, then for its ready
   * result. `conversation.close`: switching the tab back to the mode it had,
   * then closing it.
   */
  readonly phase?: BridgeTaskPhase;
  readonly expectConversationId?: string;
  /**
   * Set once the task is being stopped (abort, …), with the code it ends with.
   * The task stays in flight until its document confirms it stopped or is gone.
   */
  readonly cancelling?: ErrorCode;
  /** `composer.attach`: the blobs its params name, the only ones its page may read. */
  readonly blobs?: readonly BridgeTaskBlob[];
  /** `files.download`: the one blob its page created, the only one it may write and commit. */
  readonly download?: BridgeTaskBlob;
  /** The paired server that sent the task; only it hears about the task. */
  readonly serverId?: string;
}

export interface BridgeTaskBlob {
  readonly blobId: string;
  readonly size: number;
}

export type BridgeTaskPhase = 'awaiting-hello' | 'ready' | 'restoring-mode' | 'closing';
const PHASES: readonly BridgeTaskPhase[] = ['awaiting-hello', 'ready', 'restoring-mode', 'closing'];

export interface BridgeTabRecord {
  readonly tabId: number;
  /** The job whose `conversation.open` created the tab; only it may close the tab. */
  readonly jobId: string;
  readonly openedAt: number;
  readonly docNonce?: string;
  readonly documentId?: string;
  /** The mode a bridge op switched this tab away from; restored before the tab closes. */
  readonly restoreMode?: SwitchableMode;
}

/** A job that opened a tab of its own. */
export interface BridgeTabOwner {
  readonly jobId: string;
  /** The tab its latest `conversation.open` created; its ops run there (it may be closed by now). */
  readonly tabId: number;
  /** A task of the job was admitted while jobs ran side by side: it finishes after the switch goes off. */
  readonly parallel?: true;
}

export interface OutboxEntry {
  readonly taskId: string;
  readonly result: TaskResultRequest;
  readonly at: number;
  /** The server the result is for; an entry without one is never handed to anybody. */
  readonly serverId?: string;
}

/** Room for the results of every job side by side while the server is briefly away. */
export const OUTBOX_MAX_ENTRIES = 16;
export const OUTBOX_MAX_BYTES = 1024 * 1024;
const MAX_SEEN_TASKS = 64;
/** Owners whose tabs are all gone that are still remembered; one with a tab is never dropped. */
const MAX_TAB_JOBS = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
const isInt = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const isText = (value: unknown): value is string => typeof value === 'string' && value.length > 0;
const optional = <T>(value: unknown, guard: (v: unknown) => v is T): boolean =>
  value === undefined || guard(value);
const isTaskBlob = (blob: unknown): blob is BridgeTaskBlob =>
  isRecord(blob) && isText(blob.blobId) && isInt(blob.size);
const isTaskBlobs = (value: unknown): value is BridgeTaskBlob[] =>
  Array.isArray(value) && value.every(isTaskBlob);

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
    (raw.phase === undefined || PHASES.includes(raw.phase as BridgeTaskPhase)) &&
    optional(raw.expectConversationId, isText) &&
    (raw.cancelling === undefined || isErrorCode(raw.cancelling)) &&
    optional(raw.blobs, isTaskBlobs) &&
    optional(raw.download, isTaskBlob) &&
    optional(raw.serverId, isText);
  return ok ? (raw as unknown as BridgeTaskRecord) : null;
}

export function parseTabRecord(raw: unknown): BridgeTabRecord | null {
  if (!isRecord(raw)) return null;
  const ok =
    isInt(raw.tabId) &&
    isText(raw.jobId) &&
    isInt(raw.openedAt) &&
    optional(raw.docNonce, isText) &&
    optional(raw.documentId, isText) &&
    (raw.restoreMode === undefined || raw.restoreMode === 'chat' || raw.restoreMode === 'work');
  return ok ? (raw as unknown as BridgeTabRecord) : null;
}

function parseTabOwner(raw: unknown): BridgeTabOwner | null {
  if (!isRecord(raw) || !isText(raw.jobId) || !isInt(raw.tabId)) return null;
  return {
    jobId: raw.jobId,
    tabId: raw.tabId,
    ...(raw.parallel === true ? { parallel: true } : {}),
  };
}

function parseList<T>(raw: unknown, parse: (entry: unknown) => T | null): T[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = parse(entry);
    return parsed ? [parsed] : [];
  });
}

function parseOutbox(raw: unknown): OutboxEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (entry): entry is OutboxEntry =>
      isRecord(entry) &&
      isText(entry.taskId) &&
      isRecord(entry.result) &&
      isInt(entry.at) &&
      optional(entry.serverId, isText),
  );
}

export interface BridgeTaskStore {
  /** Every task in flight, oldest first. */
  listTasks(): Promise<BridgeTaskRecord[]>;
  getTask(taskId: string): Promise<BridgeTaskRecord | null>;
  /** Record a task, replacing the one with its id. */
  setTask(record: BridgeTaskRecord): Promise<void>;
  /**
   * Update `taskId`'s record only while it exists and `when` (if given) holds
   * for it, in one step; returns the new record, else null.
   */
  updateTask(
    taskId: string,
    patch: Partial<Omit<BridgeTaskRecord, 'taskId'>>,
    when?: (current: BridgeTaskRecord) => boolean,
  ): Promise<BridgeTaskRecord | null>;
  /** Clear `taskId`'s record; true when this call cleared it. */
  clearTask(taskId: string): Promise<boolean>;
  /**
   * End the task: queue its result in the outbox, then clear its record, in
   * one step, so a poll always finds the task in one of the two. Null when
   * no record holds `taskId`; `stored: false` when the result did not fit the
   * outbox (it is then reported without a stored copy).
   */
  finishTask(entry: OutboxEntry): Promise<{ stored: boolean } | null>;
  /** Every recorded bridge tab, oldest first. */
  listTabs(): Promise<BridgeTabRecord[]>;
  getTab(tabId: number): Promise<BridgeTabRecord | null>;
  /**
   * Record a tab. A known tab is updated in place; a new one becomes its job's current tab
   * (`parallel`: the job runs beside others, see {@link BridgeTabOwner}).
   */
  setTab(record: BridgeTabRecord, options?: { readonly parallel?: boolean }): Promise<void>;
  /** The job that opened `jobId`'s tabs, or null when it never opened one. */
  tabOwner(jobId: string): Promise<BridgeTabOwner | null>;
  /** Every job that opened a tab, oldest first. */
  listTabOwners(): Promise<BridgeTabOwner[]>;
  /** `jobId`, which opened a tab, now runs beside other jobs; nothing when it opened none. */
  markParallel(jobId: string): Promise<void>;
  updateTab(tabId: number, patch: Partial<Omit<BridgeTabRecord, 'tabId'>>): Promise<void>;
  clearTab(tabId: number): Promise<boolean>;
  /** Remember `taskId`; false when it had been seen already (a redelivery). */
  markSeen(taskId: string): Promise<boolean>;
  listOutbox(): Promise<readonly OutboxEntry[]>;
  /** False when the entry does not fit the caps; the result is then lost. */
  pushOutbox(entry: OutboxEntry): Promise<boolean>;
  removeOutbox(taskId: string): Promise<void>;
  /** Drop every stored result: the pairing they were for is gone, or the bridge is off. */
  clearOutbox(): Promise<void>;
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
  const listTasks = async () => parseList(await read(session, K.tasks), parseTaskRecord);
  const listTabs = async () => parseList(await read(session, K.tabs), parseTabRecord);
  const listTabOwners = async () => parseList(await read(session, K.tabJobs), parseTabOwner);
  /**
   * Unserialized; callers hold the chain. Past the cap only owners without any tab are
   * forgotten, oldest first: a job keeps its tab for as long as the tab is open.
   */
  const writeOwners = async (owners: readonly BridgeTabOwner[]) => {
    const open = new Set((await listTabs()).map((tab) => tab.jobId));
    const closed = owners.filter((owner) => !open.has(owner.jobId));
    const forget = new Set(closed.slice(0, Math.max(0, closed.length - MAX_TAB_JOBS)));
    await session.set({ [K.tabJobs]: owners.filter((owner) => !forget.has(owner)) });
  };
  /** Unserialized; callers hold the chain. An empty list leaves no key behind. */
  const writeTasks = (tasks: readonly BridgeTaskRecord[]) =>
    tasks.length === 0 ? session.remove(K.tasks) : session.set({ [K.tasks]: tasks });
  const writeTabs = (tabs: readonly BridgeTabRecord[]) =>
    tabs.length === 0 ? session.remove(K.tabs) : session.set({ [K.tabs]: tabs });
  /** Unserialized; callers hold the chain. */
  const pushOutbox = async (entry: OutboxEntry): Promise<boolean> => {
    const entries = parseOutbox(await read(local, StorageKeys.BRIDGE_OUTBOX)).filter(
      (existing) => existing.taskId !== entry.taskId,
    );
    const next = [...entries, entry];
    if (next.length > OUTBOX_MAX_ENTRIES) return false;
    if (new TextEncoder().encode(JSON.stringify(next)).length > OUTBOX_MAX_BYTES) return false;
    await local.set({ [StorageKeys.BRIDGE_OUTBOX]: next });
    return true;
  };
  /** Unserialized; callers hold the chain. True when `taskId` had a record to remove. */
  const removeTask = async (taskId: string): Promise<boolean> => {
    const tasks = await listTasks();
    const next = tasks.filter((task) => task.taskId !== taskId);
    if (next.length === tasks.length) return false;
    await writeTasks(next);
    return true;
  };

  return {
    listTasks,
    getTask: async (taskId) => (await listTasks()).find((task) => task.taskId === taskId) ?? null,
    setTask: (record) =>
      serial(async () => {
        const others = (await listTasks()).filter((task) => task.taskId !== record.taskId);
        await writeTasks([...others, record]);
      }),
    updateTask: (taskId, patch, when) =>
      serial(async () => {
        const tasks = await listTasks();
        const index = tasks.findIndex((task) => task.taskId === taskId);
        const current = tasks[index];
        if (!current) return null;
        if (when && !when(current)) return null;
        const next = { ...current, ...patch, taskId };
        await writeTasks(tasks.map((task, at) => (at === index ? next : task)));
        return next;
      }),
    clearTask: (taskId) => serial(() => removeTask(taskId)),
    finishTask: (entry) =>
      serial(async () => {
        if (!(await listTasks()).some((task) => task.taskId === entry.taskId)) return null;
        const stored = await pushOutbox(entry);
        await removeTask(entry.taskId);
        return { stored };
      }),
    listTabs,
    getTab: async (tabId) => (await listTabs()).find((tab) => tab.tabId === tabId) ?? null,
    setTab: (record, options) =>
      serial(async () => {
        const tabs = await listTabs();
        // A hello only renews the document: the tab keeps its place and its job's current tab.
        if (tabs.some((tab) => tab.tabId === record.tabId)) {
          await writeTabs(tabs.map((tab) => (tab.tabId === record.tabId ? record : tab)));
          return;
        }
        await writeTabs([...tabs, record]);
        const owners = await listTabOwners();
        const before = owners.find((owner) => owner.jobId === record.jobId);
        const parallel = before?.parallel === true || options?.parallel === true;
        const owner: BridgeTabOwner = {
          jobId: record.jobId,
          tabId: record.tabId,
          ...(parallel ? { parallel: true } : {}),
        };
        await writeOwners([...owners.filter((entry) => entry.jobId !== record.jobId), owner]);
      }),
    tabOwner: async (jobId) =>
      (await listTabOwners()).find((owner) => owner.jobId === jobId) ?? null,
    listTabOwners,
    markParallel: (jobId) =>
      serial(async () => {
        const owners = await listTabOwners();
        if (!owners.some((owner) => owner.jobId === jobId && !owner.parallel)) return;
        await session.set({
          [K.tabJobs]: owners.map((owner) =>
            owner.jobId === jobId ? { ...owner, parallel: true } : owner,
          ),
        });
      }),
    updateTab: (tabId, patch) =>
      serial(async () => {
        const tabs = await listTabs();
        const index = tabs.findIndex((tab) => tab.tabId === tabId);
        const current = tabs[index];
        if (!current) return;
        const next = { ...current, ...patch, tabId };
        await writeTabs(tabs.map((tab, at) => (at === index ? next : tab)));
      }),
    clearTab: (tabId) =>
      serial(async () => {
        const tabs = await listTabs();
        const next = tabs.filter((tab) => tab.tabId !== tabId);
        if (next.length === tabs.length) return false;
        await writeTabs(next);
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
    pushOutbox: (entry) => serial(() => pushOutbox(entry)),
    removeOutbox: (taskId) =>
      serial(async () => {
        const entries = parseOutbox(await read(local, StorageKeys.BRIDGE_OUTBOX));
        const next = entries.filter((entry) => entry.taskId !== taskId);
        if (next.length === entries.length) return;
        if (next.length === 0) await local.remove(StorageKeys.BRIDGE_OUTBOX);
        else await local.set({ [StorageKeys.BRIDGE_OUTBOX]: next });
      }),
    clearOutbox: () => serial(() => local.remove(StorageKeys.BRIDGE_OUTBOX)),
  };
}
