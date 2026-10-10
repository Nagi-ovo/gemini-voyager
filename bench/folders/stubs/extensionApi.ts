/**
 * An in-memory stand-in for the `chrome` / `browser` extension API, for running
 * folder modules on a plain page or in node.
 *
 * `storage.*.set` stores a structured clone (the extension serializes values
 * before handing them to the browser process) and reports the change through
 * `storage.onChanged` on a later task, as Chrome does in the writing context.
 * Every API the bench does not model is a no-op that resolves to `undefined`.
 */

type StorageChange = { oldValue?: unknown; newValue?: unknown };
type ChangeListener = (changes: Record<string, StorageChange>, area: string) => void;
type Keys = string | string[] | Record<string, unknown> | null | undefined;

export interface StorageAreaStub {
  get(keys?: Keys): Promise<Record<string, unknown>>;
  set(values: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
  /** Test hook: the stored values, without cloning. */
  readonly items: Map<string, unknown>;
}

function createArea(area: string, emit: ChangeListener): StorageAreaStub {
  const items = new Map<string, unknown>();
  return {
    items,
    async get(keys) {
      const out: Record<string, unknown> = {};
      if (keys == null) {
        for (const [key, value] of items) out[key] = structuredClone(value);
        return out;
      }
      if (typeof keys === 'string' || Array.isArray(keys)) {
        for (const key of typeof keys === 'string' ? [keys] : keys) {
          if (items.has(key)) out[key] = structuredClone(items.get(key));
        }
        return out;
      }
      for (const [key, fallback] of Object.entries(keys)) {
        out[key] = items.has(key) ? structuredClone(items.get(key)) : fallback;
      }
      return out;
    },
    async set(values) {
      const changes: Record<string, StorageChange> = {};
      for (const [key, value] of Object.entries(values)) {
        const stored = structuredClone(value);
        changes[key] = { oldValue: items.get(key), newValue: structuredClone(stored) };
        items.set(key, stored);
      }
      setTimeout(() => emit(changes, area), 0);
    },
    async remove(keys) {
      const changes: Record<string, StorageChange> = {};
      for (const key of typeof keys === 'string' ? [keys] : keys) {
        if (!items.has(key)) continue;
        changes[key] = { oldValue: items.get(key) };
        items.delete(key);
      }
      if (Object.keys(changes).length) setTimeout(() => emit(changes, area), 0);
    },
    async clear() {
      items.clear();
    },
  };
}

/** Any property is another no-op API; calling one resolves to `undefined`. */
function noopApi(path: string): unknown {
  const target = () => Promise.resolve(undefined);
  return new Proxy(target, {
    get(_target, property) {
      if (property === 'then') return undefined;
      if (property === 'addListener' || property === 'removeListener') return () => {};
      if (property === 'hasListener') return () => false;
      return noopApi(`${path}.${String(property)}`);
    },
    apply() {
      return Promise.resolve(undefined);
    },
  });
}

export function createExtensionApiStub() {
  const listeners = new Set<ChangeListener>();
  const emit: ChangeListener = (changes, area) => {
    // A copy: a listener may remove itself while the change is delivered.
    for (const listener of Array.from(listeners)) listener(changes, area);
  };
  const storage = {
    local: createArea('local', emit),
    sync: createArea('sync', emit),
    session: createArea('session', emit),
    onChanged: {
      addListener: (listener: ChangeListener) => listeners.add(listener),
      removeListener: (listener: ChangeListener) => listeners.delete(listener),
      hasListener: (listener: ChangeListener) => listeners.has(listener),
    },
  };
  const runtime = {
    id: 'voyager-folder-bench',
    getURL: (path: string) => `chrome-extension://voyager-folder-bench/${path}`,
    getManifest: () => ({ version: '0.0.0-bench', manifest_version: 3 }),
    sendMessage: () => Promise.resolve(undefined),
    onMessage: { addListener: () => {}, removeListener: () => {}, hasListener: () => false },
    lastError: undefined,
  };
  const i18n = {
    getMessage: () => '',
    getUILanguage: () => 'en',
  };
  const known: Record<string, unknown> = { storage, runtime, i18n };
  return new Proxy(known, {
    get(target, property) {
      if (typeof property === 'string' && property in target) return target[property];
      return noopApi(String(property));
    },
  }) as typeof known & { storage: typeof storage };
}

export type ExtensionApiStub = ReturnType<typeof createExtensionApiStub>;

let installed: ExtensionApiStub | null = null;

/** Installs one stub as both `chrome` and `browser`; later calls return the same one. */
export function installExtensionApiStub(): ExtensionApiStub {
  if (installed) return installed;
  installed = createExtensionApiStub();
  const scope = globalThis as unknown as Record<string, unknown>;
  scope.chrome = installed;
  scope.browser = installed;
  return installed;
}
