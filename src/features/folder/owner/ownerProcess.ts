import type { FolderData } from '@/core/types/folder';

import { applyFolderOp } from './applyFolderOp';
import {
  type FolderOpBody,
  type OpOutcome,
  type StoredOutcome,
  parseFolderOpBody,
  rejected,
} from './folderOps';
import type { FolderSitePolicy } from './folderOwnerPolicy';
import type {
  ClientRecord,
  FolderOwnerMeta,
  FolderOwnerStorageArea,
  ReadyState,
} from './folderOwnerState';
import { dropsEnoughForPreBulk } from './ownerBackups';

/** A drained body that failed the envelope checks: processed as `rejected: invalid_payload`. */
export const INVALID_BODY = Symbol('invalid pending body');

export interface Processed {
  data: FolderData | null;
  meta: FolderOwnerMeta;
  outcomes: Record<number, StoredOutcome>;
  /** A bulk op already wrote `preBulk` for this commit. */
  preBulkWritten?: boolean;
  /** Some op of the turn removes enough to need a `preBulk` copy first (§6.6). */
  destructive?: boolean;
}

export interface ProcessOptions {
  /** An outcome that replaces applying a valid body: the user's held/journal decisions (§7.8). */
  refuse?: (body: FolderOpBody) => OpOutcome | null;
  /** The `preBulk` copy failed: every op that needs it is refused `backup_failed`, unapplied. */
  refuseDestructive?: boolean;
}

/** What the drain and collection steps share with the turn that runs them. */
export interface OwnerTurnContext {
  area: FolderOwnerStorageArea;
  now: () => number;
  /** Commits `next` over `state`; the durable state, or `null` when nothing is known durable. */
  settle(key: string, state: ReadyState, next: Processed): Promise<ReadyState | null>;
  /**
   * Runs `run` and, when an op needs `preBulk`, writes it from `state` first;
   * if that copy fails, runs again refusing those ops (§6.6).
   */
  guardPreBulk(
    key: string,
    state: ReadyState,
    run: (refuseDestructive: boolean) => Processed,
  ): Promise<Processed>;
  /** Best effort removal of a client's pending keys at or below `applied`. */
  removePending(clientId: string, seqs: number[], applied: number): Promise<void>;
}

export const seqRange = (from: number, count: number): number[] =>
  Array.from({ length: count }, (_, index) => from + index);

/** A revived client resumes at its tombstone's watermark; outcomes were dropped at retirement. */
export function revive(meta: FolderOwnerMeta, clientId: string, now: number): FolderOwnerMeta {
  const tombstone = meta.retired[clientId];
  const retired = { ...meta.retired };
  delete retired[clientId];
  const client: ClientRecord = {
    applied: tombstone.applied,
    acked: tombstone.applied,
    outcomes: {},
    lastSeenAt: now,
  };
  return { ...meta, retired, clients: { ...meta.clients, [clientId]: client } };
}

/**
 * Drops outcomes the client has delivered and records the contact. A
 * `bundle_pending` outcome was never delivered, so an ack never drops it (R4.1).
 */
export function acknowledge(client: ClientRecord, ackedThrough: number, at: number): ClientRecord {
  const acked = Math.max(client.acked, Math.min(ackedThrough, client.applied));
  const outcomes = Object.fromEntries(
    Object.entries(client.outcomes).filter(
      ([seq, outcome]) => Number(seq) > acked || outcome.kind === 'bundle_pending',
    ),
  );
  return { ...client, acked, outcomes, lastSeenAt: at };
}

export function withClient(
  meta: FolderOwnerMeta,
  clientId: string,
  client: ClientRecord,
): FolderOwnerMeta {
  return { ...meta, clients: { ...meta.clients, [clientId]: client } };
}

/**
 * The exactly-once rule (§6.3): a seq at or below the watermark is a duplicate
 * and returns its stored outcome; the next seq is applied and advances the
 * watermark whatever its outcome, so a retry can never apply it again.
 * `contact` is the client's own request; a drain passes `null` and keeps
 * every outcome for the client to collect (addendum P0 §2).
 */
export function processOps(
  state: ReadyState,
  meta: FolderOwnerMeta,
  clientId: string,
  ops: ReadonlyArray<{ seq: number; body: unknown }>,
  policy: FolderSitePolicy,
  now: number,
  contact: { ackedThrough: number } | null,
  options: ProcessOptions = {},
): Processed {
  const client: ClientRecord = { ...meta.clients[clientId] };
  const stored = { ...client.outcomes };
  const outcomes: Record<number, StoredOutcome> = {};
  let data = state.data;
  let destructive = false;
  for (const op of ops) {
    if (op.seq <= client.applied) {
      outcomes[op.seq] = stored[op.seq] ?? { kind: 'expired' };
      continue;
    }
    const body = op.body === INVALID_BODY ? null : parseFolderOpBody(op.body);
    const refused = body && options.refuse?.(body);
    let result =
      body && !refused
        ? applyFolderOp(data ?? { folders: [], folderContents: {} }, body, policy, now)
        : { data, outcome: refused || rejected('invalid_payload') };
    if (result.outcome.kind === 'saved' && dropsEnoughForPreBulk(data, result.data)) {
      destructive = true;
      if (options.refuseDestructive) result = { data, outcome: rejected('backup_failed') };
    }
    if (result.outcome.kind === 'saved') data = result.data;
    client.applied = op.seq;
    stored[op.seq] = result.outcome;
    outcomes[op.seq] = result.outcome;
  }
  client.outcomes = stored;
  const final = contact ? acknowledge(client, contact.ackedThrough, now) : client;
  return { data, meta: withClient(meta, clientId, final), outcomes, destructive };
}
