/**
 * Prompt Manager's copy of the prompt library (`gvPromptItems`) and every
 * change the panel makes to it. The panel renders `items` and calls these
 * methods; it never writes the library itself.
 *
 * Each change is sent as an op to the background owner, which applies it to
 * the library as stored at that moment, so an edit in another tab, a template
 * save, an import or a Drive merge is never written over.
 *
 * The panel shows `base` with its pending ops applied on top:
 * - `base` is the newest library seen in storage. `storage.onChanged` reports
 *   writes in the order they happened, so its last value is the newest; the
 *   first read only fills `base` if no change has arrived since it started.
 * - `pending` holds this tab's ops, in the order sent, until their replies
 *   come. A failed op just leaves, which is the rollback. The reply's list is
 *   never shown: it can be older than `base`. Storage's echo shows the write.
 * Every change to either recomputes the shown library. Ops are idempotent, so
 * reapplying one that `base` already holds changes nothing.
 *
 * Ops leave one at a time, each after the previous one's reply, so the owner
 * applies a tab's ops in the order the user made them even if the transport
 * would deliver two messages out of order. A reply that does not come within
 * `watchdogMs` marks the library unavailable: new edits are refused until it
 * comes, and nothing queued behind it is sent early.
 */
import type { PromptItem } from '@/core/types/sync';
import {
  PROMPT_LIBRARY_KEY,
  type PromptLibraryOp,
  type PromptLibraryResult,
  applyPromptLibraryOp,
} from '@/features/prompt/library/promptLibraryOwner';

import { isPinned } from './promptPinning';

export interface PromptDraft {
  name: string;
  text: string;
  tags: string[];
}

/**
 * `failed`: not saved, and the panel shows the library without it.
 * `unavailable`: refused while an earlier change is still unanswered.
 */
export type PromptAddOutcome = 'added' | 'duplicate' | 'failed' | 'unavailable';
export type PromptEditOutcome = 'saved' | 'duplicate' | 'missing' | 'failed' | 'unavailable';

/** How long an op's reply may take before the library counts as unavailable. */
export const PROMPT_LIBRARY_WATCHDOG_MS = 15_000;

type StorageChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void;

/** The `storage.onChanged` event, or anything that delivers the same changes. */
export interface StorageChangeEvent {
  addListener(listener: StorageChangeListener): void;
  removeListener(listener: StorageChangeListener): void;
}

export interface PromptLibraryStateDeps {
  /**
   * The stored library: an empty one only when nothing is stored. Rejects when
   * the read fails, so a failure is never shown as an empty library.
   */
  read: () => Promise<PromptItem[]>;
  /** Sends an op to the library's owner. */
  apply: (op: PromptLibraryOp) => Promise<PromptLibraryResult>;
  /** The library this page once kept in localStorage, as stored there. */
  readLegacy?: () => string | null;
  /** `storage.onChanged`: `load` subscribes before it reads, `dispose` unsubscribes. */
  changes?: StorageChangeEvent;
  /** Storage showed a library that changes what the panel shows. */
  onChanged?: () => void;
  /** The shown library changed when a change was answered or rolled back, or a retry read it. */
  onReconcile?: () => void;
  /** An edit was refused because the library has not loaded; a new read has started. */
  onNotLoaded?: () => void;
  /** A change was not saved and was rolled back. */
  onWriteFailed?: () => void;
  /** Reading the library failed; the panel keeps the library it has. */
  onReadFailed?: (error: unknown) => void;
  /** `true` when a reply is overdue or an edit was refused for it; `false` once it came. */
  onUnavailable?: (unavailable: boolean) => void;
  now?: () => number;
  makeId?: () => string;
  watchdogMs?: number;
}

export interface PromptLibraryState {
  readonly items: PromptItem[];
  /** True while a sent op's reply is overdue; edits are refused meanwhile. */
  readonly unavailable: boolean;
  /**
   * True once the library was read or storage reported it. Until then the
   * panel cannot tell an empty library from an unread one, so edits are refused.
   */
  readonly loaded: boolean;
  /**
   * Subscribes to `changes`, then reads the library, first copying in a legacy
   * localStorage one through the owner, which stores it only if no library is
   * stored yet.
   */
  load(): Promise<PromptItem[]>;
  /** Reads the library again if it has not loaded yet. */
  retry(): Promise<void>;
  /**
   * Stops reporting anything. Ops already sent still reach the owner; their
   * calls resolve as failed so the page shows nothing for them.
   */
  dispose(): void;
  /** Adds a prompt ahead of the library unless its text is already there. */
  add(draft: PromptDraft): Promise<PromptAddOutcome>;
  /** Changes a prompt in place unless another prompt has the same text. */
  edit(id: string, draft: PromptDraft): Promise<PromptEditOutcome>;
  /** Resolves true once the owner has removed it, false if the delete failed or was refused. */
  remove(id: string): Promise<boolean>;
  togglePin(id: string): void;
  /** Takes the order a drag or key move produced. */
  reorder(next: PromptItem[]): void;
  /**
   * A `storage.onChanged` value for the library; `undefined`, a removed
   * library, is an empty one. Returns true when the shown library changed; the
   * panel's own writes echo back unchanged.
   */
  receive(newValue: unknown): boolean;
}

/** How Prompt Manager tells two prompt bodies apart: trimmed, ignoring case. */
function sameText(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

const sameList = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** A new prompt's id: an FNV-1a-ish hash over the time and a random part. */
function promptId(): string {
  const seed = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * Reads the library from the storage area the owner writes. Nothing stored is
 * an empty library; a failed read, or a stored value that is not a list,
 * rejects instead.
 */
export async function readPromptLibrary(area: {
  get(key: string): Promise<Record<string, unknown>>;
}): Promise<PromptItem[]> {
  const value = (await area.get(PROMPT_LIBRARY_KEY))?.[PROMPT_LIBRARY_KEY];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('The stored prompt library is not a list');
  return value as PromptItem[];
}

/** A legacy localStorage value worth seeding: a list of prompt records. */
export function parseLegacyPromptLibrary(raw: string | null): unknown[] | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) &&
      value.every((item) => typeof item === 'object' && item !== null && !Array.isArray(item))
      ? value
      : null;
  } catch {
    return null;
  }
}

export function createPromptLibraryState(deps: PromptLibraryStateDeps): PromptLibraryState {
  const now = deps.now ?? Date.now;
  const makeId = deps.makeId ?? promptId;
  const watchdogMs = deps.watchdogMs ?? PROMPT_LIBRARY_WATCHDOG_MS;

  /** The newest library seen in storage. */
  let base: PromptItem[] = [];
  /** This tab's unanswered ops, in the order sent. */
  let pending: PromptLibraryOp[] = [];
  /** Counts storage values received; a read that started before one is stale. */
  let received = 0;
  let items: PromptItem[] = [];
  /** The reply to the last request sent; the next one leaves after it. */
  let lastReply: Promise<unknown> = Promise.resolve();
  let unavailable = false;
  let loaded = false;
  let stopped = false;
  /** The watchdog for the request in flight; requests leave one at a time. */
  let timer: ReturnType<typeof setTimeout> | undefined;

  /** Calls a page callback unless the panel was disposed. */
  const tell = <A extends unknown[]>(fn: ((...args: A) => void) | undefined, ...args: A) => {
    if (!stopped) fn?.(...args);
  };

  /** Recomputes the shown library; true when it changed. */
  const derive = (): boolean => {
    const next = pending.reduce<unknown[]>(
      (list, op) => applyPromptLibraryOp(list, op).items ?? list,
      base,
    ) as PromptItem[];
    if (sameList(next, items)) return false;
    items = next;
    return true;
  };

  const setUnavailable = (value: boolean): void => {
    if (unavailable === value) return;
    unavailable = value;
    tell(deps.onUnavailable, value);
  };

  /**
   * Reads the library into `base`; true when the shown library changed. Reads
   * may overlap: one that started before a storage value arrived is dropped.
   */
  const readBase = async (): Promise<boolean> => {
    const before = received;
    try {
      const stored = await deps.read();
      // A change received during the read is newer than what it returned.
      if (received !== before) return false;
      base = stored;
      loaded = true;
      return derive();
    } catch (error) {
      tell(deps.onReadFailed, error);
      return false;
    }
  };

  const retry = async (): Promise<void> => {
    if (!loaded && !stopped && (await readBase())) tell(deps.onReconcile);
  };

  /** Refuses an edit before the library loaded or while a reply is overdue, saying so. */
  const refused = (): boolean => {
    if (!loaded) {
      tell(deps.onNotLoaded);
      void retry();
      return true;
    }
    if (unavailable) tell(deps.onUnavailable, true);
    return unavailable;
  };

  /**
   * Sends a request after the previous one's reply. While its reply is overdue
   * the library is unavailable; `onOverdue` hears when that starts.
   */
  const request = (op: PromptLibraryOp, onOverdue?: () => void): Promise<PromptLibraryResult> => {
    const reply = lastReply.then(() => {
      // An op queued before teardown is still sent, but nobody waits on it.
      if (!stopped) {
        timer = setTimeout(() => {
          setUnavailable(true);
          onOverdue?.();
        }, watchdogMs);
      }
      return deps.apply(op).finally(() => {
        clearTimeout(timer);
        setUnavailable(false);
      });
    });
    lastReply = reply.catch(() => undefined);
    return reply;
  };

  /** Shows `op` at once and sends it; resolves to the owner's result, or null if it failed. */
  const send = async (op: PromptLibraryOp): Promise<PromptLibraryResult | null> => {
    pending.push(op);
    derive();
    let result: PromptLibraryResult | null = null;
    try {
      result = await request(op);
    } catch {
      // Rolled back below by dropping it from `pending`.
    }
    pending = pending.filter((other) => other !== op);
    // The reply's list may be older than `base`, so the panel never shows it;
    // storage's echo brings the write in.
    if (derive()) tell(deps.onReconcile);
    if (!result) tell(deps.onWriteFailed);
    return stopped ? null : result;
  };

  const receive = (newValue: unknown): boolean => {
    if (newValue !== undefined && !Array.isArray(newValue)) return false;
    received += 1;
    loaded = true;
    base = (newValue ?? []) as PromptItem[];
    return derive();
  };

  const listener: StorageChangeListener = (changes, area) => {
    const change = area === 'local' ? changes[PROMPT_LIBRARY_KEY] : undefined;
    if (change && receive(change.newValue)) tell(deps.onChanged);
  };

  return {
    get items() {
      return items;
    },
    get unavailable() {
      return unavailable;
    },
    get loaded() {
      return loaded;
    },
    async load() {
      deps.changes?.addListener(listener);
      const legacy = parseLegacyPromptLibrary(deps.readLegacy?.() ?? null);
      // Unseeded, the library loads as stored and the next start tries again.
      // An overdue seed stops holding up the read; its echo brings it in.
      if (legacy) {
        await new Promise<void>((resolve) => {
          const done = () => resolve();
          request({ kind: 'seed', items: legacy }, done).then(done, done);
        });
      }
      await readBase();
      return items;
    },
    retry,
    dispose() {
      stopped = true;
      clearTimeout(timer);
      deps.changes?.removeListener(listener);
    },
    async add(draft) {
      if (refused()) return 'unavailable';
      if (items.some((x) => sameText(x.text, draft.text))) return 'duplicate';
      const item: PromptItem = {
        id: makeId(),
        name: draft.name,
        text: draft.text,
        tags: draft.tags,
        createdAt: now(),
      };
      const result = await send({ kind: 'add', items: [item] });
      if (!result) return 'failed';
      // Another tab may have taken the same text or name first.
      return result.added > 0 ? 'added' : 'duplicate';
    },
    async edit(id, draft) {
      if (refused()) return 'unavailable';
      if (items.some((x) => x.id !== id && sameText(x.text, draft.text))) return 'duplicate';
      if (!items.some((x) => x.id === id)) return 'missing';
      const changes = { text: draft.text, tags: draft.tags, name: draft.name, updatedAt: now() };
      const result = await send({ kind: 'update', id, changes });
      if (!result) return 'failed';
      // Another tab may have deleted it meanwhile.
      return result.items.some((item) => (item as PromptItem | null)?.id === id)
        ? 'saved'
        : 'missing';
    },
    async remove(id) {
      if (refused()) return false;
      return (await send({ kind: 'delete', id })) !== null;
    },
    togglePin(id) {
      const item = items.find((x) => x.id === id);
      if (!item || refused()) return;
      // The pin bumps updatedAt so the cloud merge carries it; see promptPinning.ts.
      const at = now();
      void send({
        kind: 'update',
        id,
        changes: isPinned(item)
          ? { pinnedAt: null, updatedAt: at }
          : { pinnedAt: at, updatedAt: at },
      });
    },
    reorder(next) {
      if (refused()) return;
      void send({ kind: 'reorder', ids: next.map((item) => item.id) });
    },
    receive,
  };
}
