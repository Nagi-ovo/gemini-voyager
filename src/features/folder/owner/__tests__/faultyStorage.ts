import type { FolderOwnerStorageArea } from '../folderOwnerState';

export type StorageOp = 'get' | 'set' | 'remove';

/**
 * A fault at one storage call (1-based, counted across get, set and remove).
 * `land`: which keys of a `set` or `remove` take effect before the call throws
 * (a chosen prefix, everything, or nothing). `crash` also stops the process:
 * every later call throws until `restart()`, as after a worker or page death.
 */
export interface Fault {
  call: number;
  land: 'none' | 'all' | readonly string[];
  crash: boolean;
}

export class StorageFault extends Error {}

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);

/**
 * In-memory `chrome.storage.local` that copies values through JSON, as the
 * browser does, and can (a) land a chosen part of a multi-key `set` and throw,
 * (b) land all of it and throw, (c) stop the process after any call, and
 * (e) fail any `get`, `set` or `remove`. `before` interleaves foreign writes
 * just before a chosen call. Faults affect only calls made through `area`.
 */
export function createFaultyStorage(initial: Record<string, unknown> = {}) {
  const store = new Map<string, unknown>(Object.entries(clone(initial)));
  const faults: Fault[] = [];
  let rule: { match: (op: StorageOp, keys: string[]) => boolean; land: Fault['land'] } | null =
    null;
  let calls = 0;
  let dead = false;
  let before: ((call: number, op: StorageOp, keys: string[]) => void) | null = null;
  type Changes = Record<string, { newValue?: unknown; oldValue?: unknown }>;
  const listeners = new Set<(changes: Changes) => void>();
  let held: Changes[] | null = null;
  /** Like `storage.onChanged`: one event per call for the keys that landed, after the call. */
  const emit = (changes: Changes): void => {
    if (Object.keys(changes).length === 0) return;
    if (held) held.push(changes);
    else queueMicrotask(() => listeners.forEach((listener) => listener(clone(changes))));
  };

  const enter = async (op: StorageOp, keys: string[]): Promise<Fault | undefined> => {
    await Promise.resolve();
    if (dead) throw new StorageFault('process stopped');
    const call = ++calls;
    before?.(call, op, keys);
    const index = faults.findIndex((fault) => fault.call === call);
    if (index < 0) {
      return rule?.match(op, keys) ? { call, land: rule.land, crash: false } : undefined;
    }
    const [fault] = faults.splice(index, 1);
    return fault;
  };
  const fail = (fault: Fault): never => {
    if (fault.crash) dead = true;
    throw new StorageFault(`fault at call ${fault.call}`);
  };
  const lands = (fault: Fault, key: string): boolean =>
    fault.land === 'all' || (fault.land !== 'none' && fault.land.includes(key));

  const area: FolderOwnerStorageArea = {
    async get(keys) {
      const fault = await enter('get', keys);
      if (fault) fail(fault);
      const result: Record<string, unknown> = {};
      for (const key of keys) if (store.has(key)) result[key] = clone(store.get(key));
      return result;
    },
    async getAll() {
      const fault = await enter('get', ['*']);
      if (fault) fail(fault);
      return Object.fromEntries([...store].map(([key, value]) => [key, clone(value)]));
    },
    async set(items) {
      const fault = await enter('set', Object.keys(items));
      const changes: Changes = {};
      for (const [key, value] of Object.entries(items)) {
        if (fault && !lands(fault, key)) continue;
        changes[key] = { newValue: clone(value), oldValue: clone(store.get(key)) };
        store.set(key, clone(value));
      }
      emit(changes);
      if (fault) fail(fault);
    },
    async remove(keys) {
      const fault = await enter('remove', keys);
      const changes: Changes = {};
      for (const key of keys) {
        if ((fault && !lands(fault, key)) || !store.has(key)) continue;
        changes[key] = { oldValue: clone(store.get(key)) };
        store.delete(key);
      }
      emit(changes);
      if (fault) fail(fault);
    },
  };

  return {
    area,
    /** Direct reads and writes, outside the fault plan: other writers and assertions. */
    read: (key: string): unknown => clone(store.get(key)),
    write: (key: string, value: unknown): void => void store.set(key, clone(value)),
    keys: (): string[] => [...store.keys()],
    snapshot: (): Record<string, unknown> => clone(Object.fromEntries(store)),
    calls: (): number => calls,
    inject(fault: Fault): void {
      faults.push(fault);
    },
    /** Fails every matching call (landing `land`) until cleared with `null`; the process lives on. */
    failWhen(
      match: ((op: StorageOp, keys: string[]) => boolean) | null,
      land: Fault['land'] = 'none',
    ) {
      rule = match ? { match, land } : null;
    },
    onCall(hook: typeof before): void {
      before = hook;
    },
    /** Subscribes to change events of calls made through `area` (not `write`). */
    subscribe(listener: (changes: Changes) => void): () => void {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    listenerCount: (): number => listeners.size,
    /** Holds change events until `releaseEvents`, to deliver them late. */
    holdEvents(): void {
      held ??= [];
    },
    releaseEvents(): void {
      const pending = held ?? [];
      held = null;
      pending.forEach(emit);
    },
    restart(): void {
      dead = false;
      faults.length = 0;
      rule = null;
    },
  };
}

export type FaultyStorage = ReturnType<typeof createFaultyStorage>;
