/**
 * The owner's backup slots of one K (DESIGN-v2 §6.6). Optional copies (`last`,
 * `prior`) never block or fail an edit; `preBulk` is required before a bulk op.
 * Every copy goes through `writeCopy`, which in the background admits and
 * writes it in one StorageBudget step (addendum P3P4 R6.1).
 */
import type { FolderData } from '@/core/types/folder';

import {
  type BackupSlot,
  type FolderOwnerMeta,
  type FolderOwnerStorageArea,
  type ReadyState,
  type RotationRef,
  type RotationSlot,
  hashStored,
  ownerBackupKey,
  parseStoredData,
} from './folderOwnerState';

export const ROTATE_LAST_MS = 10 * 60 * 1000;
export const ROTATE_PRIOR_MS = 24 * 60 * 60 * 1000;
/** A commit that drops this many conversation references takes a `preBulk` first. */
export const PRE_BULK_REFERENCE_DROP = 20;

export interface BackupEntry {
  savedAt: number;
  rev: number;
  reason: 'rotation' | 'preBulk' | 'foreign';
  sourceHash: string;
  value: unknown;
}

/** Writes one backup slot item; `false` when the copy was not admitted. May throw. */
export type WriteCopy = (slotKey: string, entry: BackupEntry) => Promise<boolean>;

/** Writes every copy, unbudgeted: the default outside the background. */
export const directCopy =
  (area: FolderOwnerStorageArea): WriteCopy =>
  async (slotKey, entry) => {
    await area.set({ [slotKey]: entry });
    return true;
  };

async function writeSlot(writeCopy: WriteCopy, slotKey: string, entry: BackupEntry) {
  try {
    return await writeCopy(slotKey, entry);
  } catch {
    return false;
  }
}

/** A slot's entry; `null` when absent or malformed, `undefined` when unreadable. */
async function readEntry(
  area: FolderOwnerStorageArea,
  slotKey: string,
): Promise<Partial<BackupEntry> | null | undefined> {
  let stored: Record<string, unknown>;
  try {
    stored = await area.get([slotKey]);
  } catch {
    return undefined;
  }
  const entry = stored[slotKey];
  return entry && typeof entry === 'object' ? (entry as Partial<BackupEntry>) : null;
}

/**
 * The slot's data; `null` when it is absent, not folder data, or (for `last`
 * and `prior`) not the copy meta names; `undefined` when unreadable.
 */
export async function readSlot(
  area: FolderOwnerStorageArea,
  key: string,
  slot: BackupSlot,
  meta: FolderOwnerMeta,
): Promise<FolderData | null | undefined> {
  const named = slot === 'last' || slot === 'prior' ? meta.backups?.[slot] : null;
  if (named === undefined) return null;
  const entry = await readEntry(area, ownerBackupKey(key, named ? named.slot : slot));
  if (!entry) return entry;
  if (named && (await hashStored(entry.value)) !== named.hash) return null;
  return parseStoredData(entry.value);
}

const entryOf = (state: ReadyState, reason: BackupEntry['reason'], now: number): BackupEntry => ({
  savedAt: now,
  rev: state.meta.rev,
  reason,
  sourceHash: state.hash,
  value: state.data,
});

/** Writes `preBulk` = the state before the bulk op; `false` refuses the op (`backup_failed`). */
export function writePreBulk(
  writeCopy: WriteCopy,
  key: string,
  state: ReadyState,
  now: number,
): Promise<boolean> {
  return writeSlot(writeCopy, ownerBackupKey(key, 'preBulk'), entryOf(state, 'preBulk', now));
}

const ROTATION_SLOTS: readonly RotationSlot[] = ['a', 'b', 'c'];

/** Writes `entry` to the rotation slot and reads it back; the hash it verified, else `null`. */
async function writeVerified(
  area: FolderOwnerStorageArea,
  writeCopy: WriteCopy,
  key: string,
  slot: RotationSlot,
  entry: BackupEntry,
): Promise<string | null> {
  const hash = await hashStored(entry.value);
  if (!(await writeSlot(writeCopy, ownerBackupKey(key, slot), entry))) return null;
  const back = await readEntry(area, ownerBackupKey(key, slot));
  return back && (await hashStored(back.value)) === hash ? hash : null;
}

/**
 * Time-based rotation before a data commit: `last` at most every 10 min and
 * `prior` (the old `last`) at most daily; the deadlines live in meta, so a
 * worker restart neither forces nor skips a rotation (§6.6).
 *
 * Crash safety (addendum P0 §3): the new copy goes only into the slot meta
 * names neither `last` nor `prior`, and `prior` takes over the old `last` by
 * name, without a copy. The names flip in the returned meta, which commits
 * with the edit, so until that commit lands meta still names the untouched
 * copies; a half-written free slot is simply rewritten by the next rotation.
 */
export async function rotateBackups(
  area: FolderOwnerStorageArea,
  writeCopy: WriteCopy,
  key: string,
  state: ReadyState,
  meta: FolderOwnerMeta,
  now: number,
): Promise<FolderOwnerMeta> {
  const backups = meta.backups ?? {};
  if (!state.data || now < (backups.lastAt ?? -Infinity) + ROTATE_LAST_MS) return meta;
  const named = new Set([backups.last?.slot, backups.prior?.slot]);
  const free = ROTATION_SLOTS.find((slot) => !named.has(slot)) ?? 'a';
  const hash = await writeVerified(area, writeCopy, key, free, entryOf(state, 'rotation', now));
  if (!hash) return meta; // optional: the edit commits without it
  const last: RotationRef = { slot: free, hash, savedAt: now };
  const priorDue = now >= (backups.priorAt ?? -Infinity) + ROTATE_PRIOR_MS;
  const next =
    priorDue && backups.last
      ? { ...backups, prior: backups.last, priorAt: now, last, lastAt: now }
      : { ...backups, last, lastAt: now };
  return { ...meta, backups: next };
}

/** After a committed rotation: removes the slot meta stopped naming, so K keeps at most two copies. */
export async function removeFreedSlot(
  area: FolderOwnerStorageArea,
  key: string,
  before: FolderOwnerMeta['backups'],
  after: FolderOwnerMeta['backups'],
): Promise<void> {
  const named = new Set([after?.last?.slot, after?.prior?.slot]);
  const freed = [before?.last?.slot, before?.prior?.slot].filter(
    (slot): slot is RotationSlot => slot !== undefined && !named.has(slot),
  );
  if (freed.length === 0) return;
  try {
    await area.remove(freed.map((slot) => ownerBackupKey(key, slot)));
  } catch {
    // Unnamed, so never restored; the next rotation overwrites it.
  }
}

/**
 * Keeps a copy of a value a foreign writer put in K (§6.4, T1c). The event's
 * value is captured before the owner's next commit can overwrite it; an owner
 * commit, recognised by its hash, is never copied.
 */
export async function keepForeignCopy(
  area: FolderOwnerStorageArea,
  key: string,
  value: unknown,
  sourceHash: string,
  now: number,
): Promise<void> {
  const entry: BackupEntry = { savedAt: now, rev: -1, reason: 'foreign', sourceHash, value };
  try {
    await area.set({ [ownerBackupKey(key, 'foreign')]: entry });
  } catch {
    // Best effort: the next resolution still adopts or quarantines what K holds.
  }
}

const referenceCount = (data: FolderData): number =>
  Object.values(data.folderContents).reduce((sum, bucket) => sum + bucket.length, 0);

/** Whether `next` removes a folder that holds conversations, or 20 or more references (§6.6). */
export function dropsEnoughForPreBulk(prev: FolderData | null, next: FolderData | null): boolean {
  if (!prev || !next) return false;
  const kept = new Set(next.folders.map((folder) => folder.id));
  const removedFull = prev.folders.some(
    (folder) => !kept.has(folder.id) && (prev.folderContents[folder.id]?.length ?? 0) > 0,
  );
  return removedFull || referenceCount(prev) - referenceCount(next) >= PRE_BULK_REFERENCE_DROP;
}
