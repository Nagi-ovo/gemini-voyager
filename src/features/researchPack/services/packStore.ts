/**
 * Persistence for the research pack in `chrome.storage.local`.
 *
 * Scope: one pack per browser profile while account isolation is off, which
 * is what lets a user carry it from one conversation (or account) to the next.
 * When the user turns account isolation on for the platform, each account gets
 * its own pack under `buildScopedStorageKey`, matching how folders behave.
 * The pack is never synced to Drive or included in backups.
 *
 * Writes have a single owner: the extension background applies every tab's
 * ops through one `createResearchPackOwner` queue (see `packMessages.ts`).
 * chrome.storage has no compare-and-set, so two tabs each doing their own
 * read-modify-write would silently drop one tab's edit.
 */
import { buildScopedStorageKey } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';

import { isNewerPackVersion, parsePack } from './packModel';
import { type ResearchPackOp, applyResearchPackOp } from './packOps';
import type { AddItemOutcome, ResearchPack } from './types';

export interface ResearchPackStorageArea {
  get(key: string): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

export interface ResearchPackKeyDeps {
  isIsolationEnabled: () => Promise<boolean>;
  /** Resolves the current account's key; only called when isolation is on. */
  resolveAccountKey: () => Promise<string>;
}

/** The storage key for the current page: global, or per account under isolation. */
export async function resolveResearchPackStorageKey(deps: ResearchPackKeyDeps): Promise<string> {
  if (!(await deps.isIsolationEnabled())) return StorageKeys.RESEARCH_PACK;
  return buildScopedStorageKey(StorageKeys.RESEARCH_PACK, await deps.resolveAccountKey());
}

/** True for the global pack key and every account-scoped variant of it. */
export function isResearchPackStorageKey(key: string): boolean {
  return key === StorageKeys.RESEARCH_PACK || key.startsWith(`${StorageKeys.RESEARCH_PACK}:acct:`);
}

export interface ResearchPackApplyResult {
  pack: ResearchPack;
  outcome: AddItemOutcome | null;
}

/**
 * The pack under one storage key. The key is always passed in by the caller,
 * bound when the user acted, never looked up later.
 */
export interface ResearchPackStore {
  load(key: string): Promise<ResearchPack>;
  apply(key: string, op: ResearchPackOp): Promise<ResearchPackApplyResult>;
}

export async function loadResearchPack(
  area: ResearchPackStorageArea,
  key: string,
): Promise<ResearchPack> {
  if (!isResearchPackStorageKey(key)) throw new Error('Invalid research pack key');
  const stored = await area.get(key);
  return parsePack(stored?.[key]);
}

/** The error an edit fails with when the stored pack was written by a newer build. */
export const RESEARCH_PACK_UNSUPPORTED_VERSION = 'unsupported_version';

/**
 * The single writer. Ops are applied one at a time against the freshly read
 * pack and the write is skipped when nothing changed. Each write sets the
 * revision one past the stored one, so a recreated pack starts again from 1;
 * tabs tell a removal apart themselves. A pack written by a newer build is
 * never edited: the op fails rather than reporting a result that was not saved.
 */
export function createResearchPackOwner(options: {
  area: ResearchPackStorageArea;
  now?: () => number;
}): ResearchPackStore {
  const now = options.now ?? Date.now;
  let queue: Promise<unknown> = Promise.resolve();

  const serialize = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  };

  return {
    load: (key) => loadResearchPack(options.area, key),
    apply(key, op) {
      return serialize(async () => {
        if (!isResearchPackStorageKey(key)) throw new Error('Invalid research pack key');
        const stored = await options.area.get(key);
        const raw = stored?.[key];
        if (isNewerPackVersion(raw)) throw new Error(RESEARCH_PACK_UNSUPPORTED_VERSION);
        const current = parsePack(raw);
        const next = applyResearchPackOp(current, op, now());
        if (next.pack === current) return next;
        const pack = { ...next.pack, revision: current.revision + 1 };
        await options.area.set({ [key]: pack });
        return { pack, outcome: next.outcome };
      });
    },
  };
}
