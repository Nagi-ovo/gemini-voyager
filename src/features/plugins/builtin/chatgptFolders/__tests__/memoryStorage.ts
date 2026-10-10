/**
 * An in-memory `chrome.storage` with `local`, `sync` and `onChanged`, recording
 * every write. Install it as `globalThis.chrome.storage`; the
 * `webextension-polyfill` mock in each test reads `chrome.storage` at call time,
 * so both APIs share one store and one listener list.
 *
 * The one-time sidebar guide starts out seen, so it stays out of tests about
 * other behaviour; a guide test deletes `StorageKeys.COACHMARKS_SEEN` first.
 */
import { StorageKeys } from '@/core/types/common';

import { CHATGPT_FOLDERS_GUIDE_ID } from '../chatgptFolderGuide';

type Area = 'local' | 'sync';
type Change = { oldValue?: unknown; newValue?: unknown };
type Listener = (changes: Record<string, Change>, area: string) => void;
type Keys = string | string[] | Record<string, unknown> | null | undefined;

export interface MemoryStorage {
  readonly values: Record<Area, Map<string, unknown>>;
  readonly writes: Array<{ area: Area; key: string }>;
  readonly listeners: Set<Listener>;
  readonly api: typeof chrome.storage;
  /** Another context writes `key`: no write is recorded, listeners still fire. */
  external(area: Area, key: string, value: unknown): void;
}

const clone = <T>(value: T): T => (value === undefined ? value : structuredClone(value));

export function createMemoryStorage(): MemoryStorage {
  const values: Record<Area, Map<string, unknown>> = {
    local: new Map(),
    sync: new Map([[StorageKeys.COACHMARKS_SEEN, [CHATGPT_FOLDERS_GUIDE_ID]]]),
  };
  const writes: Array<{ area: Area; key: string }> = [];
  const listeners = new Set<Listener>();

  const notify = (area: Area, changes: Record<string, Change>): void => {
    queueMicrotask(() => {
      for (const listener of listeners) listener(changes, area);
    });
  };
  const apply = (area: Area, items: Record<string, unknown>, record: boolean): void => {
    const changes: Record<string, Change> = {};
    for (const [key, value] of Object.entries(items)) {
      changes[key] = { oldValue: clone(values[area].get(key)), newValue: clone(value) };
      values[area].set(key, clone(value));
      if (record) writes.push({ area, key });
    }
    notify(area, changes);
  };

  const read = (name: Area, keys: Keys): Record<string, unknown> => {
    const store = values[name];
    const result: Record<string, unknown> = {};
    if (keys === null || keys === undefined) {
      for (const [key, value] of store) result[key] = clone(value);
      return result;
    }
    const entries: Array<[string, unknown]> =
      typeof keys === 'string'
        ? [[keys, undefined]]
        : Array.isArray(keys)
          ? keys.map((key) => [key, undefined])
          : Object.entries(keys);
    for (const [key, fallback] of entries) {
      if (store.has(key)) result[key] = clone(store.get(key));
      else if (fallback !== undefined) result[key] = fallback;
    }
    return result;
  };

  const area = (name: Area) => ({
    // Promise style, or chrome's callback style when one is passed.
    get: async (keys?: Keys, callback?: (items: Record<string, unknown>) => void) => {
      const result = read(name, keys);
      callback?.(result);
      return result;
    },
    set: async (items: Record<string, unknown>) => apply(name, items, true),
    remove: async (keys: string | string[]) => {
      const changes: Record<string, Change> = {};
      for (const key of Array.isArray(keys) ? keys : [keys]) {
        changes[key] = { oldValue: clone(values[name].get(key)) };
        values[name].delete(key);
        writes.push({ area: name, key });
      }
      notify(name, changes);
    },
    clear: async () => values[name].clear(),
  });

  const api = {
    local: area('local'),
    sync: area('sync'),
    onChanged: {
      addListener: (listener: Listener) => listeners.add(listener),
      removeListener: (listener: Listener) => listeners.delete(listener),
      hasListener: (listener: Listener) => listeners.has(listener),
    },
  } as unknown as typeof chrome.storage;

  return {
    values,
    writes,
    listeners,
    api,
    external: (name, key, value) => apply(name, { [key]: value }, false),
  };
}

/** Lets queued storage work, change events and the reloads they start settle. */
export async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) await Promise.resolve();
}
