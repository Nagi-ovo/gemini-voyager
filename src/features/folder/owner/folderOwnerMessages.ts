import type { FolderData } from '@/core/types/folder';

import type { StoredOutcome } from './folderOps';
import type { AdoptJournalReply, HeldDecision, HeldReply } from './ownerHeld';

/** `gvFolderOwner:pending:<clientId>:<seq>`: written once by the client, deleted once by the owner. */
export interface PendingOpEntry {
  v: 1;
  key: string;
  epoch: string;
  clientId: string;
  seq: number;
  at: number;
  op: unknown;
}

/** A client whose drained ops wait for the user (§7.8). */
export interface HeldClient {
  clientId: string;
  from: number;
  reason: 'foreign_write' | 'epoch_changed';
}

interface OpenBase {
  epoch: string;
  rev: number;
  applied: number;
  held: HeldClient[];
  legacySync: boolean;
  /** The pending allowance's lifetime, counted from when the client sent this request (R3.2). */
  allowanceTtlMs: number;
}

export type OpenReply =
  | ({ kind: 'ready'; data: FolderData; dataHash: string } & OpenBase)
  | ({ kind: 'empty' } & OpenBase)
  | ({ kind: 'invalid' } & OpenBase)
  /** A re-open of an id this epoch does not know: take the `unknown_client` path (§6.3). */
  | { kind: 'unknown_client'; epoch: string }
  | { kind: 'refused'; reason: 'read_failed' | 'not_owner' | 'write_failed' };

export type ApplyReply =
  | {
      kind: 'ok';
      epoch: string;
      rev: number;
      applied: number;
      outcomes: Record<number, StoredOutcome>;
      allowanceTtlMs: number;
    }
  | { kind: 'seq_gap'; applied: number }
  | { kind: 'bad_batch' }
  | { kind: 'unknown_client'; epoch: string }
  | { kind: 'refused'; reason: 'read_failed' | 'invalid_state' | 'write_failed' | 'not_owner' };

export interface OpenRequest {
  key: string;
  clientId: string;
  ackedThrough: number;
  /** The epoch a client got from an earlier `open`; absent for a new client. */
  epoch?: string;
}

export interface ApplyRequest {
  key: string;
  clientId: string;
  epoch: string;
  ops: Array<{ seq: number; body: unknown }>;
  ackedThrough: number;
}

/** A read of the consistent `(K, meta)` pair, produced inside a turn after resolution (§7.3). */
export interface SnapshotRequest {
  key: string;
  clientId: string;
}

interface SnapshotBase {
  epoch: string;
  rev: number;
  /** The requesting client's watermark; 0 when the epoch does not know it. */
  applied: number;
}

export type SnapshotReply =
  | ({ kind: 'ready'; data: FolderData; dataHash: string } & SnapshotBase)
  | ({ kind: 'empty' } & SnapshotBase)
  | ({ kind: 'invalid' } & SnapshotBase)
  | { kind: 'refused'; reason: 'read_failed' | 'not_owner' | 'write_failed' };

/** The user's decision on one held client's ops (§7.8). */
export interface HeldRequest {
  key: string;
  clientId: string;
  heldClientId: string;
  decision: HeldDecision;
}

/** Ops a dead page journaled, which the user chose to apply (§6.5). */
export interface AdoptJournalRequest {
  key: string;
  clientId: string;
  journalClientId: string;
  ops: Array<{ seq: number; body: unknown }>;
}

/** Outcomes the client delivered; held in memory and folded into the next commit of `key`. */
export interface AckRequest {
  key: string;
  clientId: string;
  ackedThrough: number;
}

export const FOLDER_OWNER_MESSAGE = {
  open: 'gv.folderOwner.open',
  apply: 'gv.folderOwner.apply',
  snapshot: 'gv.folderOwner.snapshot',
  ack: 'gv.folderOwner.ack',
  held: 'gv.folderOwner.held',
  adoptJournal: 'gv.folderOwner.adoptJournal',
} as const;

export type FolderOwnerRequest =
  | ({ type: typeof FOLDER_OWNER_MESSAGE.open } & OpenRequest)
  | ({ type: typeof FOLDER_OWNER_MESSAGE.apply } & ApplyRequest)
  | ({ type: typeof FOLDER_OWNER_MESSAGE.snapshot } & SnapshotRequest)
  | ({ type: typeof FOLDER_OWNER_MESSAGE.ack } & AckRequest)
  | ({ type: typeof FOLDER_OWNER_MESSAGE.held } & HeldRequest)
  | ({ type: typeof FOLDER_OWNER_MESSAGE.adoptJournal } & AdoptJournalRequest);

/** The sender gate's refusal (§6.8), sent before any turn runs. */
export interface GateRefusal {
  kind: 'refused';
  reason: 'sender_not_allowed' | 'not_owner';
}

export type FolderOwnerResponse =
  | OpenReply
  | ApplyReply
  | SnapshotReply
  | HeldReply
  | AdoptJournalReply
  | { kind: 'acknowledged' }
  /** A message of ours whose fields do not parse. */
  | { kind: 'bad_request' }
  | GateRefusal;
