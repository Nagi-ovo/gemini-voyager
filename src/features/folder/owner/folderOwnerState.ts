import type { FolderData } from '@/core/types/folder';
import { canonicalJson, hashValue } from '@/core/utils/canonicalHash';

import type { FolderAuthority } from './authority';
import { interruptStaleBundles, resolveBundleIntent } from './bundleIntent';
import type { StoredOutcome } from './folderOps';
import type { FolderSite } from './folderOwnerPolicy';
import { orphanedClients } from './ownerEpochScan';

/** `chrome.storage.local` (`browser.storage.local` on Safari), injected so faults can be simulated. */
export interface FolderOwnerStorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  /** Every stored item; only the rare epoch-creation scan uses it (§7.8). */
  getAll(): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string[]): Promise<void>;
}

export const OWNER_INDEX_KEY = 'gvFolderOwner:index';
export const ownerMetaKey = (key: string): string => `gvFolderOwner:meta:${key}`;
export const ownerIntentKey = (key: string): string => `gvFolderOwner:intent:${key}`;
export const pendingOpKey = (clientId: string, seq: number): string =>
  `gvFolderOwner:pending:${clientId}:${seq}`;
export type BackupSlot = 'last' | 'prior' | 'preBulk' | 'foreign' | 'quarantine';
/** The fixed rotation slots; meta names which one holds `last` and which `prior` (addendum P0 §3). */
export type RotationSlot = 'a' | 'b' | 'c';
export const ownerBackupKey = (key: string, slot: BackupSlot | RotationSlot): string =>
  `gvFolderOwner:backup:${key}:${slot}`;

/** A rotation copy named by meta: its slot and the hash its value must have. */
export interface RotationRef {
  slot: RotationSlot;
  hash: string;
  savedAt: number;
}

export interface ClientRecord {
  /** Highest seq processed: applied, unchanged or rejected. */
  applied: number;
  /** Highest seq whose outcome the client confirmed seeing. */
  acked: number;
  /** Outcomes for `acked < seq <= applied`. */
  outcomes: Record<number, StoredOutcome>;
  lastSeenAt: number;
  held?: { from: number; reason: 'foreign_write' | 'epoch_changed' };
}

export interface FolderOwnerMeta {
  v: 1;
  epoch: string;
  rev: number;
  /** `H(K)` as of this meta; `'absent'` when K does not exist. */
  dataHash: string;
  foreignAt?: number;
  /** When `last` and `prior` were last written (§6.6); kept here so restarts do not rotate. */
  backups?: { lastAt?: number; priorAt?: number; last?: RotationRef; prior?: RotationRef };
  clients: Record<string, ClientRecord>;
  /** Every retired client's watermark, so its late pending keys or requests revive it (addendum P0 §1). */
  retired: Record<string, { applied: number; at: number }>;
  pageCopyCheckedAt?: number;
}

/** The latest data transaction of K; overwritten by the next one, never deleted. */
interface DataIntent {
  v: 1;
  txId: string;
  epoch: string;
  prevRev: number;
  nextRev: number;
  prevHash: string;
  nextHash: string;
  prevMeta: FolderOwnerMeta;
  nextMeta: FolderOwnerMeta;
}

export type OwnerState =
  | { kind: 'read_failed' }
  | { kind: 'write_failed' }
  /** `data: null`: K is absent and every read succeeded. */
  | { kind: 'ready'; data: FolderData | null; hash: string; meta: FolderOwnerMeta }
  /** K holds something that is not folder data, or was removed by a foreign writer. */
  | { kind: 'invalid'; meta: FolderOwnerMeta };

export type ReadyState = Extract<OwnerState, { kind: 'ready' }>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export function isMeta(value: unknown): value is FolderOwnerMeta {
  return (
    isRecord(value) &&
    value.v === 1 &&
    typeof value.epoch === 'string' &&
    typeof value.rev === 'number' &&
    typeof value.dataHash === 'string' &&
    isRecord(value.clients) &&
    isRecord(value.retired)
  );
}

function isIntent(value: unknown): value is DataIntent {
  return (
    isRecord(value) &&
    value.v === 1 &&
    typeof value.epoch === 'string' &&
    typeof value.prevRev === 'number' &&
    typeof value.nextRev === 'number' &&
    typeof value.prevHash === 'string' &&
    typeof value.nextHash === 'string' &&
    isMeta(value.prevMeta) &&
    isMeta(value.nextMeta)
  );
}

export function isFolderData(value: unknown): value is FolderData {
  return (
    isRecord(value) &&
    Array.isArray(value.folders) &&
    isRecord(value.folderContents) &&
    Object.values(value.folderContents).every(Array.isArray)
  );
}

/** A stored K, string (old Safari, one-time migration) or object, as the value that is hashed. */
function parseStored(raw: unknown): { value: unknown; valid: boolean } {
  if (typeof raw !== 'string') return { value: raw, valid: raw === undefined || isFolderData(raw) };
  try {
    const value: unknown = JSON.parse(raw);
    return { value, valid: isFolderData(value) };
  } catch {
    return { value: raw, valid: false };
  }
}

/** A stored value as folder data, or `null` when it is absent or not folder data. */
export function parseStoredData(raw: unknown): FolderData | null {
  const parsed = parseStored(raw);
  return parsed.valid && parsed.value !== undefined ? (parsed.value as FolderData) : null;
}

/** `H` of a stored value: a stored string and an object of the same data hash alike. */
export async function hashStored(raw: unknown): Promise<string> {
  return hashValue(parseStored(raw).value);
}

/**
 * Reads K and classifies it against its meta and intent (§6.4), finishing any
 * half-done transaction first. Runs at the start of every turn and again after
 * a commit whose outcome is unknown. Assumes only single-key atomicity.
 */
export async function resolveOwnerState(
  area: FolderOwnerStorageArea,
  key: string,
  now: number,
  newId: () => string,
  authority: Readonly<Record<FolderSite, FolderAuthority>>,
): Promise<OwnerState> {
  const bundle = await resolveBundleIntent(area, authority, () => now, {
    readKeys: [key, ownerMetaKey(key)],
  });
  if (bundle !== 'ok') return { kind: bundle };

  const metaKey = ownerMetaKey(key);
  let stored: Record<string, unknown>;
  try {
    stored = await area.get([key, metaKey, ownerIntentKey(key), OWNER_INDEX_KEY]);
  } catch {
    return { kind: 'read_failed' };
  }
  const raw = stored[key];
  const parsed = parseStored(raw);
  const hash = await hashValue(parsed.value);
  const storedMeta = stored[metaKey];
  const storedIntent = stored[ownerIntentKey(key)];
  let meta = isMeta(storedMeta) ? storedMeta : null;
  const intent = isIntent(storedIntent) ? storedIntent : null;

  try {
    // A clean pair is final: an older intent must not undo a later meta-only commit at its nextRev.
    const clean = meta !== null && meta.dataHash === hash;
    if (intent && !clean && (!meta || intent.epoch === meta.epoch)) {
      if (hash === intent.nextHash && (!meta || meta.rev === intent.prevRev)) {
        // K landed, meta lost: roll forward.
        meta = intent.nextMeta;
        await area.set({ [metaKey]: meta });
      } else if (
        meta &&
        hash === intent.prevHash &&
        meta.rev === intent.nextRev &&
        meta.dataHash === intent.nextHash
      ) {
        // Meta landed, K lost: the ops are unapplied; their clients or pending keys still hold them.
        meta = { ...intent.prevMeta, rev: intent.nextRev + 1 };
        await area.set({ [metaKey]: meta });
      }
    }

    if (meta && meta.dataHash !== hash) {
      // Foreign write. A removed or unreadable value goes to recovery (P3), never to "empty".
      if (!parsed.valid || parsed.value === undefined) return { kind: 'invalid', meta };
      const backupKey = ownerBackupKey(key, 'foreign');
      await area.set({
        [backupKey]: {
          savedAt: now,
          rev: meta.rev,
          reason: 'foreign',
          sourceHash: hash,
          value: raw,
        },
      });
      const copy = (await area.get([backupKey]))[backupKey];
      if (!isRecord(copy) || (await hashStored(copy.value)) !== hash)
        return { kind: 'write_failed' };
      meta = { ...meta, rev: meta.rev + 1, dataHash: hash, foreignAt: now };
      await area.set({ [metaKey]: meta });
    }

    if (!meta) {
      // New epoch. The index entry goes first: an index entry without meta is harmless.
      const index = Array.isArray(stored[OWNER_INDEX_KEY]) ? stored[OWNER_INDEX_KEY] : [];
      if (!index.includes(key)) await area.set({ [OWNER_INDEX_KEY]: [...index, key] });
      const clients = orphanedClients(await area.getAll(), key, now);
      meta = { v: 1, epoch: newId(), rev: 1, dataHash: hash, clients, retired: {} };
      await area.set({ [metaKey]: meta });
    }
  } catch {
    return { kind: 'write_failed' };
  }

  // No bundle is open now, so a `bundle_pending` left in this meta can never settle (R4.3).
  const settled = interruptStaleBundles(meta);
  if (settled) {
    try {
      await area.set({ [metaKey]: settled });
    } catch {
      return { kind: 'write_failed' };
    }
    meta = settled;
  }

  if (!parsed.valid) return { kind: 'invalid', meta };
  const data = parsed.value === undefined ? null : (parsed.value as FolderData);
  return { kind: 'ready', data, hash, meta };
}

export type CommitResult =
  /** Everything landed: `state` is the new durable state. */
  | { kind: 'committed'; state: ReadyState }
  /** Nothing the turn decided can have landed. */
  | { kind: 'failed' }
  /** The final `set` threw: resolve again before replying. */
  | { kind: 'uncertain' };

/**
 * Commits a turn (§6.4). A data change writes the intent, then K and meta in
 * one `set`; anything else, including data that hashes the same, is a
 * meta-only commit. `rev` grows by one either way.
 */
/**
 * Runs a commit given every item it will write (the intent, then K and meta);
 * the background admits them as one StorageBudget `data` step (R6.1).
 */
export type CommitGate = (
  writes: Record<string, unknown>,
  commit: () => Promise<CommitResult>,
) => Promise<CommitResult>;

const ungated: CommitGate = (_writes, commit) => commit();

export async function commitOwnerState(
  area: FolderOwnerStorageArea,
  key: string,
  prev: ReadyState,
  next: { data: FolderData | null; meta: FolderOwnerMeta },
  txId: string,
  gate: CommitGate = ungated,
): Promise<CommitResult> {
  const meta: FolderOwnerMeta = { ...next.meta, rev: prev.meta.rev + 1, dataHash: prev.hash };
  const metaKey = ownerMetaKey(key);
  if (next.data && next.data !== prev.data) {
    // Stored exactly as hashed, whatever key order the browser keeps.
    const data = JSON.parse(canonicalJson(next.data)) as FolderData;
    const hash = await hashValue(data);
    if (hash !== prev.hash) {
      meta.dataHash = hash;
      const intent: DataIntent = {
        v: 1,
        txId,
        epoch: meta.epoch,
        prevRev: prev.meta.rev,
        nextRev: meta.rev,
        prevHash: prev.hash,
        nextHash: hash,
        prevMeta: prev.meta,
        nextMeta: meta,
      };
      const intentItem = { [ownerIntentKey(key)]: intent };
      return gate({ ...intentItem, [key]: data, [metaKey]: meta }, async () => {
        try {
          await area.set(intentItem);
        } catch {
          return { kind: 'failed' };
        }
        try {
          await area.set({ [key]: data, [metaKey]: meta });
        } catch {
          return { kind: 'uncertain' };
        }
        return { kind: 'committed', state: { kind: 'ready', data, hash, meta } };
      });
    }
  }
  return gate({ [metaKey]: meta }, async () => {
    try {
      await area.set({ [metaKey]: meta });
    } catch {
      return { kind: 'uncertain' };
    }
    return { kind: 'committed', state: { ...prev, meta } };
  });
}
