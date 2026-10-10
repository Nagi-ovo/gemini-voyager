/**
 * An in-memory `chrome.storage.local` that counts bytes as the browser does
 * (key plus JSON value) and runs every call in FIFO order, as one extension's
 * storage calls do (LC10). `hold()` stalls the queue until `release()`, so a
 * test can leave a `set` in flight. With a hard `quota`, a `set` that would
 * exceed it throws; `perKey` lands each key that fits on its own (LC9 variant).
 */
const encoder = new TextEncoder();

export const itemBytes = (key: string, value: unknown): number =>
  encoder.encode(key).byteLength + encoder.encode(JSON.stringify(value)).byteLength;

export class QuotaExceeded extends Error {}

export interface ByteStoreOptions {
  quota?: number | null;
  perKey?: boolean;
}

type Changes = Record<string, { oldValue?: unknown; newValue?: unknown }>;

export function createByteStore(
  initial: Record<string, unknown> = {},
  options: ByteStoreOptions = {},
) {
  const items = new Map<string, unknown>(Object.entries(structuredClone(initial)));
  let tail: Promise<unknown> = Promise.resolve();
  let gate: Promise<void> | null = null;
  let open: (() => void) | null = null;
  const log: string[] = [];
  const listeners = new Set<(changes: Changes) => void>();
  let beforeSet: ((values: Record<string, unknown>) => void | Promise<void>) | null = null;
  const emit = (changes: Changes) => {
    if (Object.keys(changes).length > 0) {
      queueMicrotask(() => listeners.forEach((listener) => listener(structuredClone(changes))));
    }
  };

  const used = (): number =>
    [...items].reduce((sum, [key, value]) => sum + itemBytes(key, value), 0);
  const bytesOf = (keys: readonly string[]): number =>
    keys.reduce((sum, key) => sum + (items.has(key) ? itemBytes(key, items.get(key)) : 0), 0);

  /** Queues `op` behind every earlier call; a held queue keeps it waiting. */
  function enqueue<T>(name: string, op: () => T): Promise<T> {
    const run = async () => {
      if (gate) await gate;
      log.push(name);
      return op();
    };
    const next = tail.then(run, run);
    tail = next.catch(() => undefined);
    return next;
  }

  function put(entries: Array<[string, unknown]>): void {
    const quota = options.quota ?? null;
    const fits = (key: string, value: unknown) =>
      quota === null || used() - bytesOf([key]) + itemBytes(key, value) <= quota;
    const changes: Changes = {};
    const land = (key: string, value: unknown) => {
      if (JSON.stringify(items.get(key)) !== JSON.stringify(value)) {
        changes[key] = {
          oldValue: structuredClone(items.get(key)),
          newValue: structuredClone(value),
        };
      }
      items.set(key, structuredClone(value));
    };
    try {
      if (options.perKey) {
        let failed = false;
        for (const [key, value] of entries) {
          if (fits(key, value)) land(key, value);
          else failed = true;
        }
        if (failed) throw new QuotaExceeded('QUOTA_BYTES quota exceeded');
        return;
      }
      const keys = entries.map(([key]) => key);
      const next = used() - bytesOf(keys) + entries.reduce((s, [k, v]) => s + itemBytes(k, v), 0);
      if (quota !== null && next > quota) throw new QuotaExceeded('QUOTA_BYTES quota exceeded');
      for (const [key, value] of entries) land(key, value);
    } finally {
      emit(changes);
    }
  }

  const area = {
    get: (keys: string | readonly string[] | null) =>
      enqueue('get', () => {
        const wanted = keys === null ? [...items.keys()] : [keys].flat();
        return Object.fromEntries(
          wanted
            .filter((key) => items.has(key))
            .map((key) => [key, structuredClone(items.get(key))]),
        );
      }),
    getAll: () => area.get(null),
    set: (values: Record<string, unknown>) => {
      const dispatch = () => enqueue('set', () => put(Object.entries(values)));
      const waiting = beforeSet?.(values);
      return waiting ? waiting.then(dispatch) : dispatch();
    },
    remove: (keys: string | readonly string[]) =>
      enqueue('remove', () => {
        const changes: Changes = {};
        for (const key of [keys].flat()) {
          if (items.has(key)) changes[key] = { oldValue: structuredClone(items.get(key)) };
          items.delete(key);
        }
        emit(changes);
      }),
    getBytesInUse: (keys: string | readonly string[] | null) =>
      enqueue('bytes', () => (keys === null ? used() : bytesOf([keys].flat()))),
  };

  return {
    area,
    used,
    log,
    read: (key: string): unknown => structuredClone(items.get(key)),
    has: (key: string): boolean => items.has(key),
    subscribe(listener: (changes: Changes) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Pauses before dispatch, so later dispatched calls still run FIFO. */
    onBeforeSet(hook: typeof beforeSet): void {
      beforeSet = hook;
    },
    /** Stalls every call issued from now on until `release`. */
    hold(): void {
      gate ??= new Promise<void>((resolve) => (open = resolve));
    },
    release(): void {
      open?.();
      gate = null;
      open = null;
    },
  };
}

export type ByteStore = ReturnType<typeof createByteStore>;
