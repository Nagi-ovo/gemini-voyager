import { vi } from 'vitest';

/**
 * Test-only ledger of everything a content module can leave behind on the
 * page: listeners on window, the document and every element still in it, DOM
 * observers, `chrome.storage.onChanged` and `chrome.runtime.onMessage`
 * subscriptions. Timers are the caller's business through `vi.useFakeTimers`.
 *
 * A listener counts as removed the way the DOM removes it: by
 * `removeEventListener`, by its `signal` aborting, or by a `once` listener
 * firing. One left on an element that has since left the document is not
 * reported by default; pass `includeDetached` to see those too, for a host
 * that keeps a detached node and attaches it again later.
 *
 * `chrome.storage` is replaced by an in-memory implementation that answers
 * both callback and promise styles, so modules that read settings at start
 * actually run instead of hanging on a `vi.fn()` that never calls back.
 */

type Listener = (...args: never[]) => unknown;
type StorageArea = 'sync' | 'local';
type StorageChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;

interface ObserverLike {
  observe(...args: never[]): void;
  disconnect(): void;
}

export interface LifecycleLedger {
  /**
   * Listener registrations on window, the document or a connected element not
   * yet removed; with `includeDetached`, on every detached element as well, or
   * with `detachedHosts`, on those inside one of these host nodes, including
   * descendants added after the set was taken.
   */
  openListeners(options?: {
    includeDetached?: boolean;
    detachedHosts?: ReadonlySet<EventTarget>;
  }): string[];
  /** Observers that called `observe` and never `disconnect`. */
  openObservers(): string[];
  openStorageListeners(): number;
  openRuntimeListeners(): number;
  /** Everything registered since the harness (or `resetActivity`) started, removed or not. */
  activity(): number;
  resetActivity(): void;
}

export interface LifecycleHarness {
  readonly ledger: LifecycleLedger;
  readonly storage: Record<StorageArea, Map<string, unknown>>;
  emitStorageChange(changes: StorageChanges, areaName: StorageArea): void;
  restore(): void;
}

function pickTarget(target: EventTarget): string | null {
  if (target === window) return 'window';
  if (target === document) return 'document';
  if (target === document.documentElement) return 'html';
  if (target === document.body) return 'body';
  if (target instanceof Element) {
    const id = target.id ? `#${target.id}` : '';
    const classes = Array.from(target.classList, (name) => `.${name}`).join('');
    return `${target.tagName.toLowerCase()}${id}${classes}`;
  }
  return null;
}

/** Whether `target` is one of `hosts` or inside one, attached or not. */
function insideHost(target: EventTarget, hosts: ReadonlySet<EventTarget> | undefined): boolean {
  if (!hosts || !(target instanceof Node)) return false;
  for (const host of hosts) {
    if (host instanceof Node && host.contains(target)) return true;
  }
  return false;
}

/** Still reachable: window, the document, or an element in it. */
function isLive(target: EventTarget): boolean {
  return !(target instanceof Node) || target === document || target.isConnected;
}

function captureFlag(options: boolean | AddEventListenerOptions | undefined): string {
  const capture = typeof options === 'boolean' ? options : options?.capture === true;
  return capture ? 'capture' : 'bubble';
}

function readKeys(keys: unknown, store: Map<string, unknown>): Record<string, unknown> {
  if (keys === null || keys === undefined) return Object.fromEntries(store);
  if (typeof keys === 'string') return store.has(keys) ? { [keys]: store.get(keys) } : {};
  if (Array.isArray(keys)) {
    return Object.fromEntries(
      keys.filter((key) => store.has(key)).map((key) => [key, store.get(key)]),
    );
  }
  if (typeof keys === 'object') {
    return Object.fromEntries(
      Object.entries(keys as Record<string, unknown>).map(([key, fallback]) => [
        key,
        store.has(key) ? store.get(key) : fallback,
      ]),
    );
  }
  return {};
}

export function installLifecycleHarness(): LifecycleHarness {
  // One entry per registration the DOM would keep: the same target, type,
  // listener and capture flag added twice is still one listener.
  interface OpenListener {
    readonly target: EventTarget;
    readonly label: string;
    /** Drops the entry when the listener's `once` firing or `signal` removes it. */
    readonly release: () => void;
  }
  const open = new Map<string, OpenListener>();
  const ids = new WeakMap<object, number>();
  let nextId = 1;
  let activity = 0;

  const idFor = (value: object): number => {
    let id = ids.get(value);
    if (id === undefined) {
      id = nextId++;
      ids.set(value, id);
    }
    return id;
  };
  const keyFor = (
    target: EventTarget,
    type: string,
    listener: object,
    options: boolean | EventListenerOptions | undefined,
  ): string => `${idFor(target)}:${type}:${captureFlag(options)}:#${idFor(listener)}`;

  const originalAdd = EventTarget.prototype.addEventListener;
  const originalRemove = EventTarget.prototype.removeEventListener;
  // vitest wraps `window`'s own add/remove (to count error listeners) around a
  // jsdom window that the global object is not an instance of, so window
  // listeners never reach the prototype: they are recorded by wrapping those.
  const windowAddDescriptor = Object.getOwnPropertyDescriptor(window, 'addEventListener');
  const windowRemoveDescriptor = Object.getOwnPropertyDescriptor(window, 'removeEventListener');
  const ownWindow =
    windowAddDescriptor && windowRemoveDescriptor
      ? {
          add: window.addEventListener as EventTarget['addEventListener'],
          remove: window.removeEventListener as EventTarget['removeEventListener'],
        }
      : null;
  // Set while a wrapped window call delegates, so the prototype patch below
  // does not record that call a second time.
  let delegating = false;
  const delegate = <T>(call: () => T): T => {
    delegating = true;
    try {
      return call();
    } finally {
      delegating = false;
    }
  };
  /** Add or remove without recording, on whichever implementation the target accepts. */
  const raw = (
    action: 'add' | 'remove',
    target: EventTarget,
    type: string,
    listener: EventListener,
    options: AddEventListenerOptions,
  ): void => {
    if (target === window && ownWindow) {
      delegate(() => ownWindow[action].call(window, type, listener, options));
      return;
    }
    (action === 'add' ? originalAdd : originalRemove).call(target, type, listener, options);
  };

  const track = (
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options: boolean | AddEventListenerOptions | undefined,
  ): void => {
    const name = pickTarget(target);
    if (!name || !listener) return;
    const signal = typeof options === 'object' ? options.signal : undefined;
    if (signal?.aborted) return;
    activity += 1;
    const key = keyFor(target, type, listener, options);
    if (open.has(key)) return;
    const capture = captureFlag(options) === 'capture';
    const drop = (): void => {
      const entry = open.get(key);
      if (!entry) return;
      open.delete(key);
      entry.release();
    };
    const onAbort = (): void => drop();
    // Registered after the listener, so it runs right after a `once` firing.
    const afterOnce = (): void => drop();
    const once = typeof options === 'object' && options.once === true;
    if (once) raw('add', target, type, afterOnce, { capture, once: true });
    signal?.addEventListener('abort', onAbort, { once: true });
    open.set(key, {
      target,
      label: `${name}:${type}:${captureFlag(options)}:#${idFor(listener)}`,
      release: () => {
        if (once) raw('remove', target, type, afterOnce, { capture });
        signal?.removeEventListener('abort', onAbort);
      },
    });
  };
  const untrack = (
    target: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options: boolean | EventListenerOptions | undefined,
  ): void => {
    if (!listener) return;
    const key = keyFor(target, type, listener, options);
    const entry = open.get(key);
    if (!entry) return;
    open.delete(key);
    entry.release();
  };

  EventTarget.prototype.addEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ) {
    if (!delegating) track(this, type, listener, options);
    return originalAdd.call(this, type, listener, options);
  };
  EventTarget.prototype.removeEventListener = function (
    this: EventTarget,
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ) {
    if (!delegating) untrack(this, type, listener, options);
    return originalRemove.call(this, type, listener, options);
  };

  if (ownWindow) {
    const ownAdd = ownWindow.add;
    const ownRemove = ownWindow.remove;
    Object.defineProperty(window, 'addEventListener', {
      configurable: true,
      writable: true,
      value(
        this: Window,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
      ) {
        track(window, type, listener, options);
        return delegate(() => ownAdd.call(this, type, listener, options));
      },
    });
    Object.defineProperty(window, 'removeEventListener', {
      configurable: true,
      writable: true,
      value(
        this: Window,
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | EventListenerOptions,
      ) {
        untrack(window, type, listener, options);
        return delegate(() => ownRemove.call(this, type, listener, options));
      },
    });
  }

  // Observers: wrap the real MutationObserver; stub the layout observers jsdom lacks.
  const openObservers = new Map<object, string>();
  const OriginalMutationObserver = globalThis.MutationObserver;
  class TrackedMutationObserver extends OriginalMutationObserver {
    observe(target: Node, options?: MutationObserverInit): void {
      activity += 1;
      openObservers.set(this, 'MutationObserver');
      super.observe(target, options);
    }
    disconnect(): void {
      openObservers.delete(this);
      super.disconnect();
    }
  }
  const makeLayoutObserver = (name: string) =>
    class implements ObserverLike {
      constructor(_callback: unknown) {}
      observe(): void {
        activity += 1;
        openObservers.set(this, name);
      }
      unobserve(): void {}
      disconnect(): void {
        openObservers.delete(this);
      }
      takeRecords(): unknown[] {
        return [];
      }
    };
  const originalResize = globalThis.ResizeObserver;
  const originalIntersection = globalThis.IntersectionObserver;
  globalThis.MutationObserver = TrackedMutationObserver;
  globalThis.ResizeObserver = makeLayoutObserver(
    'ResizeObserver',
  ) as unknown as typeof ResizeObserver;
  globalThis.IntersectionObserver = makeLayoutObserver(
    'IntersectionObserver',
  ) as unknown as typeof IntersectionObserver;

  // chrome.storage: in-memory areas, tracked onChanged subscriptions.
  const storage: Record<StorageArea, Map<string, unknown>> = { sync: new Map(), local: new Map() };
  const storageListeners = new Set<Listener>();
  const runtimeListeners = new Set<Listener>();
  const previous = {
    sync: { ...chrome.storage.sync },
    local: { ...chrome.storage.local },
    onChanged: { ...chrome.storage.onChanged },
    onMessage: { ...chrome.runtime.onMessage },
    sendMessage: chrome.runtime.sendMessage,
  };

  const mockArea = (area: StorageArea): void => {
    const store = storage[area];
    const target = chrome.storage[area] as unknown as Record<string, unknown>;
    const settle = <T>(value: T, callback: unknown): Promise<T> => {
      if (typeof callback === 'function') callback(value);
      return Promise.resolve(value);
    };
    target.get = vi.fn((keys: unknown, callback?: unknown) =>
      settle(readKeys(keys, store), callback),
    );
    target.set = vi.fn((items: Record<string, unknown>, callback?: unknown) => {
      for (const [key, value] of Object.entries(items)) store.set(key, value);
      return settle(undefined, callback);
    });
    target.remove = vi.fn((keys: string | string[], callback?: unknown) => {
      for (const key of Array.isArray(keys) ? keys : [keys]) store.delete(key);
      return settle(undefined, callback);
    });
    target.clear = vi.fn((callback?: unknown) => {
      store.clear();
      return settle(undefined, callback);
    });
    target.getBytesInUse = vi.fn((_keys: unknown, callback?: unknown) => settle(0, callback));
  };
  mockArea('sync');
  mockArea('local');

  const onChanged = chrome.storage.onChanged as unknown as Record<string, unknown>;
  onChanged.addListener = vi.fn((listener: Listener) => {
    activity += 1;
    storageListeners.add(listener);
  });
  onChanged.removeListener = vi.fn((listener: Listener) => {
    storageListeners.delete(listener);
  });
  onChanged.hasListener = vi.fn((listener: Listener) => storageListeners.has(listener));

  const onMessage = chrome.runtime.onMessage as unknown as Record<string, unknown>;
  onMessage.addListener = vi.fn((listener: Listener) => {
    activity += 1;
    runtimeListeners.add(listener);
  });
  onMessage.removeListener = vi.fn((listener: Listener) => {
    runtimeListeners.delete(listener);
  });
  onMessage.hasListener = vi.fn((listener: Listener) => runtimeListeners.has(listener));
  (chrome.runtime as unknown as Record<string, unknown>).sendMessage = vi.fn(
    (_message: unknown, callback?: unknown) => {
      if (typeof callback === 'function') callback(undefined);
      return Promise.resolve(undefined);
    },
  );

  const ledger: LifecycleLedger = {
    openListeners: (options) =>
      [...open.values()]
        .filter(
          (entry) =>
            options?.includeDetached === true ||
            insideHost(entry.target, options?.detachedHosts) ||
            isLive(entry.target),
        )
        .map((entry) => entry.label)
        .sort(),
    openObservers: () => [...openObservers.values()].sort(),
    openStorageListeners: () => storageListeners.size,
    openRuntimeListeners: () => runtimeListeners.size,
    activity: () => activity,
    resetActivity: () => {
      activity = 0;
    },
  };

  return {
    ledger,
    storage,
    emitStorageChange(changes, areaName) {
      for (const listener of storageListeners) {
        (listener as (changes: StorageChanges, areaName: string) => void)(changes, areaName);
      }
    },
    restore() {
      // Take back the `once` companions and `abort` hooks of listeners still open.
      for (const entry of open.values()) entry.release();
      open.clear();
      EventTarget.prototype.addEventListener = originalAdd;
      EventTarget.prototype.removeEventListener = originalRemove;
      if (windowAddDescriptor && windowRemoveDescriptor) {
        Object.defineProperty(window, 'addEventListener', windowAddDescriptor);
        Object.defineProperty(window, 'removeEventListener', windowRemoveDescriptor);
      }
      globalThis.MutationObserver = OriginalMutationObserver;
      globalThis.ResizeObserver = originalResize;
      globalThis.IntersectionObserver = originalIntersection;
      Object.assign(chrome.storage.sync, previous.sync);
      Object.assign(chrome.storage.local, previous.local);
      Object.assign(chrome.storage.onChanged, previous.onChanged);
      Object.assign(chrome.runtime.onMessage, previous.onMessage);
      (chrome.runtime as unknown as Record<string, unknown>).sendMessage = previous.sendMessage;
    },
  };
}
