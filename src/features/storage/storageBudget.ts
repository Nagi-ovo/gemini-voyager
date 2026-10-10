/**
 * The background's one storage budget (DESIGN-v2 addendum P3P4 §0). Every
 * write that grows extension storage on behalf of several contexts (backup
 * copies, highlight commits, and later owner commits) is admitted and written
 * in one step of this chain, so two writers never both pass a check against the
 * same measurement. A step settles before the next starts, so a reservation
 * lives exactly as long as its write: there is no timed release (F1).
 *
 * The chain is separate from `writeQueue`: a queue turn may call `run`, but a
 * budget step never awaits the queue, and a step must never call `run` itself
 * (it would wait for its own step and hang).
 */
import {
  STORAGE_QUOTA_SOFT_CAP_KEY,
  storageQuotaService,
} from '@/core/services/StorageQuotaService';

const MIB = 1024 * 1024;
/** Room a copy must leave free: above the highlights' reserve of max(512 KiB, 10%). */
const COPY_RESERVE_MIN_BYTES = 2 * MIB;
const COPY_RESERVE_RATIO = 0.25;

/** `copy`: a recovery copy, kept only with room to spare. `data`: user data, refused only by a hard quota. */
export type BudgetClass = 'copy' | 'data';

export interface BudgetMeasure {
  bytesInUse: number;
  /** Bytes the keys about to be replaced hold now. */
  keyBytes: number;
  /** `L`: the soft cap, or the quota when that is lower. */
  limitBytes: number;
  /** `Q`: the effective quota; `null` when there is no practical one. */
  quotaBytes: number | null;
}

export interface BudgetRequest {
  kind: BudgetClass;
  /** Keys the write replaces; their current bytes are credited. */
  keys: readonly string[];
  /** Bytes the write stores. */
  bytes: number;
  /** Extra free space the write must leave under `Q`, given `Q` (a bundle's `M`, R3.1). */
  margin?: (quotaBytes: number) => number;
}

export type Admission<T> =
  | { admitted: true; value: T }
  | { admitted: false; reason: 'quota' | 'unmeasurable' };

export interface StorageBudgetDeps {
  measure(keys: readonly string[]): Promise<BudgetMeasure>;
  /** `Q` alone: a `data` step under no quota measures nothing. */
  quota(): Promise<number | null>;
  /**
   * One storage call issued before the first admission. Storage operations are
   * FIFO per extension (LC10), so a `set` a dead worker sent has landed by then
   * or never will, and the first measurement counts it.
   */
  barrier(): Promise<unknown>;
  /** Bytes held by standing reservations (pending allowances, R3.2). */
  reserved?: ReservationSource;
}

/** Must not wait on the budget or the write queue: a step awaits it. */
export type ReservationSource = () => number | Promise<number>;

export interface StorageBudget {
  /** Admits `request` against a fresh measurement and, if admitted, runs `write` in the same step. */
  run<T>(request: BudgetRequest, write: () => Promise<T>): Promise<Admission<T>>;
  /** A step whose own check decides (the highlights' soft cap, F2); it gets the standing reservations. */
  runChecked<T>(step: (reservedBytes: number) => Promise<T>): Promise<T>;
  /** Registers the source of standing reservations (the owner's pending allowances), or clears it. */
  setReservations(source: ReservationSource | null): void;
}

const encoder = new TextEncoder();

/** Bytes chrome.storage counts for one item: the key plus its UTF-8 JSON value. */
export const storedItemBytes = (key: string, value: unknown): number =>
  encoder.encode(key).byteLength + encoder.encode(JSON.stringify(value)).byteLength;

/** The bytes of every item `items` stores. */
export const storedItemsBytes = (items: Record<string, unknown>): number =>
  Object.entries(items).reduce((sum, [key, value]) => sum + storedItemBytes(key, value), 0);

export const copyReserveBytes = (limitBytes: number): number =>
  Math.max(COPY_RESERVE_MIN_BYTES, Math.ceil(limitBytes * COPY_RESERVE_RATIO));

/** Whether `request` fits `measure` with `reserved` bytes already promised. */
export function admits(request: BudgetRequest, measure: BudgetMeasure, reserved: number): boolean {
  const peak = measure.bytesInUse + reserved - measure.keyBytes + request.bytes;
  // The hard peak applies to every class: a credit never offsets unreleased quota.
  if (measure.quotaBytes !== null) {
    const margin = request.margin?.(measure.quotaBytes) ?? 0;
    if (peak + margin > measure.quotaBytes) return false;
  }
  return (
    request.kind === 'data' || peak + copyReserveBytes(measure.limitBytes) <= measure.limitBytes
  );
}

export function createStorageBudget(deps: StorageBudgetDeps): StorageBudget {
  let tail: Promise<unknown> = Promise.resolve();
  let barrier: Promise<unknown> | null = null;
  let reservations = deps.reserved ?? null;
  const reserved = async () => (reservations ? await reservations() : 0);

  const chain = <T>(step: () => Promise<T>): Promise<T> => {
    const run = async () => {
      barrier ??= deps.barrier().catch(() => undefined);
      await barrier;
      return step();
    };
    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  };

  async function admit(request: BudgetRequest): Promise<Admission<void>> {
    try {
      // Only a hard quota refuses `data`, so under none nothing is measured or reserved.
      if (request.kind === 'data' && (await deps.quota()) === null) {
        return { admitted: true, value: undefined };
      }
      const held = await reserved();
      const measured = await deps.measure(request.keys);
      return admits(request, measured, held)
        ? { admitted: true, value: undefined }
        : { admitted: false, reason: 'quota' };
    } catch {
      return { admitted: false, reason: 'unmeasurable' };
    }
  }

  return {
    run: (request, write) =>
      chain(async () => {
        const admission = await admit(request);
        if (!admission.admitted) return admission;
        return { admitted: true as const, value: await write() };
      }),
    runChecked: (step) => chain(async () => step(await reserved())),
    setReservations(source) {
      reservations = source;
    },
  };
}

/** The background's budget over `chrome.storage.local`; touches nothing until its first step. */
export const storageBudget: StorageBudget = createStorageBudget({
  measure: (keys) => storageQuotaService.getLocalHeadroom(keys),
  quota: async () => (await storageQuotaService.resolveEffectiveLocalQuota()).quotaBytes,
  barrier: () => chrome.storage.local.get(STORAGE_QUOTA_SOFT_CAP_KEY),
});
