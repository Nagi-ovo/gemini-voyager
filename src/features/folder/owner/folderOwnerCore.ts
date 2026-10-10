import { canonicalJson } from '@/core/utils/canonicalHash';
import type { StorageBudget } from '@/features/storage/storageBudget';
import { type Serialize, createWriteQueue } from '@/features/storage/writeQueue';

import type { FolderAuthority } from './authority';
import { resolveBundleIntent } from './bundleIntent';
import type { StoredOutcome } from './folderOps';
import type {
  AckRequest,
  AdoptJournalRequest,
  ApplyReply,
  ApplyRequest,
  HeldClient,
  HeldRequest,
  OpenReply,
  OpenRequest,
  SnapshotReply,
  SnapshotRequest,
} from './folderOwnerMessages';
import {
  FOLDER_SITE_POLICIES,
  type FolderSite,
  type FolderSitePolicy,
  siteOfFolderKey,
} from './folderOwnerPolicy';
import {
  type ClientRecord,
  type FolderOwnerMeta,
  type FolderOwnerStorageArea,
  type OwnerState,
  type ReadyState,
  commitOwnerState,
  hashStored,
  ownerMetaKey,
  pendingOpKey,
  resolveOwnerState,
} from './folderOwnerState';
import { ALLOWANCE_TTL_MS, type AllowanceLedger } from './ownerAllowances';
import {
  directCopy,
  keepForeignCopy,
  removeFreedSlot,
  rotateBackups,
  writePreBulk,
} from './ownerBackups';
import { budgetedCommit, budgetedCopy } from './ownerBudget';
import { bulkProcessed, isBulkBody, newBulkOp, runBulkOp } from './ownerBulk';
import { GC_INTERVAL_MS, collect } from './ownerCollect';
import { drainKey } from './ownerDrain';
import {
  type AdoptJournalReply,
  type HeldReply,
  type TurnRefusal,
  adoptJournal,
  resolveHeld,
} from './ownerHeld';
import {
  type OwnerTurnContext,
  type Processed,
  acknowledge,
  processOps,
  revive,
  withClient,
} from './ownerProcess';

export const MAX_BATCH_OPS = 256;
export const MAX_BATCH_BYTES = 32 * 1024 * 1024;
const OWN_HASHES_KEPT = 8;

export interface FolderOwnerCoreOptions {
  area: FolderOwnerStorageArea;
  /**
   * The running build's authority (addendum P3P4 R5.1): every owner action
   * touches only keys of `owner` sites; a legacy site's K and sidecars stay frozen.
   */
  authority: Readonly<Record<FolderSite, FolderAuthority>>;
  now?: () => number;
  newId?: () => string;
  /**
   * The background's StorageBudget (addendum P3P4 R6.1): each backup copy is a
   * `copy` step and each commit a `data` step. Without it nothing is budgeted.
   */
  budget?: Pick<StorageBudget, 'run'>;
  /** Told each durable meta, so the budget reserves every registered client's allowance (R3.2). */
  allowances?: Pick<AllowanceLedger, 'observe'>;
  /** The shared in-process write queue; defaults to a private one. */
  serialize?: Serialize;
}

export interface FolderOwnerCore {
  open(request: OpenRequest): Promise<OpenReply>;
  apply(request: ApplyRequest): Promise<ApplyReply>;
  /** Startup and `open` drain of every registered or retired client's accepted ops for `key`. */
  drain(key: string): Promise<void>;
  snapshot(request: SnapshotRequest): Promise<SnapshotReply>;
  /** Never writes on its own: the ack rides on the next commit of its key (§6.3). */
  ack(request: AckRequest): void;
  held(request: HeldRequest): Promise<HeldReply>;
  adoptJournal(request: AdoptJournalRequest): Promise<AdoptJournalReply>;
  /** `storage.onChanged` for K: copies a foreign value, then resolves K (the detector, §6.4). */
  observe(key: string, value: unknown): Promise<void>;
}

const isContiguous = (ops: ReadonlyArray<{ seq: number }>): boolean =>
  ops.every((op, index) => Number.isInteger(op.seq) && op.seq === ops[0].seq + index);

const isBadBatch = (ops: ApplyRequest['ops']): boolean =>
  ops.length === 0 ||
  (ops.length > 1 && ops.some((op) => isBulkBody(op.body))) ||
  ops.length > MAX_BATCH_OPS ||
  !isContiguous(ops) ||
  canonicalJson(ops).length > MAX_BATCH_BYTES;

const heldClients = (meta: FolderOwnerMeta): HeldClient[] =>
  Object.entries(meta.clients).flatMap(([clientId, client]) =>
    client.held ? [{ clientId, ...client.held }] : [],
  );

/** The meta with `clientId` registered or revived, or `null` when the id is unknown to this epoch. */
function registered(meta: FolderOwnerMeta, request: OpenRequest, at: number) {
  if (meta.clients[request.clientId]) return meta;
  if (meta.retired[request.clientId]) return revive(meta, request.clientId, at);
  if (request.epoch !== undefined) return null;
  const client: ClientRecord = { applied: 0, acked: 0, outcomes: {}, lastSeenAt: at };
  return withClient(meta, request.clientId, client);
}

/** Outcomes for every seq of a batch: fresh ones, then stored ones, else `expired`. */
function replyOutcomes(ops: ApplyRequest['ops'], processed: Processed, stored: ClientRecord) {
  const outcomes: Record<number, StoredOutcome> = {};
  for (const { seq } of ops) {
    outcomes[seq] = processed.outcomes[seq] ?? stored.outcomes[seq] ?? { kind: 'expired' };
  }
  return outcomes;
}

function openReply(
  state: Exclude<OwnerState, { kind: 'read_failed' | 'write_failed' }>,
  committed: ReadyState,
  clientId: string,
): OpenReply {
  const base = {
    epoch: committed.meta.epoch,
    rev: committed.meta.rev,
    applied: committed.meta.clients[clientId].applied,
    held: heldClients(committed.meta),
    legacySync: false,
    allowanceTtlMs: ALLOWANCE_TTL_MS,
  };
  if (state.kind === 'invalid') return { kind: 'invalid', ...base };
  return committed.data
    ? { kind: 'ready', data: committed.data, dataHash: committed.hash, ...base }
    : { kind: 'empty', ...base };
}

export function createFolderOwnerCore(options: FolderOwnerCoreOptions): FolderOwnerCore {
  const { area } = options;
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => crypto.randomUUID());
  const serialize = options.serialize ?? createWriteQueue();
  const writeCopy = options.budget ? budgetedCopy(options.budget, area) : directCopy(area);
  const gate = options.budget ? budgetedCommit(options.budget) : undefined;
  const lastGcAt = new Map<string, number>();
  const acks = new Map<string, Map<string, number>>();
  /** Hashes of K this process committed recently: their change events are not foreign. */
  const ownHashes = new Map<string, string[]>();
  const remember = (key: string, hash: string) =>
    ownHashes.set(key, [hash, ...(ownHashes.get(key) ?? [])].slice(0, OWN_HASHES_KEPT));

  /** The policy of `key`'s site when this build owns it; `null` refuses with no storage access. */
  const policyFor = (key: string): FolderSitePolicy | null => {
    const site = siteOfFolderKey(key);
    return site && options.authority[site] === 'owner' ? FOLDER_SITE_POLICIES[site] : null;
  };

  const resolve = async (key: string): Promise<OwnerState> => {
    const state = await resolveOwnerState(area, key, now(), newId, options.authority);
    if (state.kind === 'ready' || state.kind === 'invalid') {
      options.allowances?.observe(key, state.meta);
    }
    return state;
  };

  /**
   * Commits `processed` and returns the durable state, or `null` when nothing
   * the turn decided is known to be durable. After an unknown outcome the
   * state is resolved again, so callers judge by the stored watermark only.
   */
  async function settle(key: string, state: ReadyState, next: Processed) {
    const pending = new Map(acks.get(key));
    const folded = await backUp(key, state, next, foldAcks(pending, next.meta));
    const result = await commitOwnerState(
      area,
      key,
      state,
      { ...next, meta: folded },
      newId(),
      gate,
    );
    if (result.kind === 'committed') {
      options.allowances?.observe(key, result.state.meta);
      remember(key, result.state.hash);
      forgetAcks(key, pending);
      await removeFreedSlot(area, key, state.meta.backups, result.state.meta.backups);
      return result.state;
    }
    if (result.kind === 'failed') return null;
    const resolved = await resolve(key);
    return resolved.kind === 'ready' ? resolved : null;
  }

  /** Optional copies before a data commit; their failure never fails the commit (§6.6). */
  async function backUp(key: string, state: ReadyState, next: Processed, meta: FolderOwnerMeta) {
    if (next.data === state.data) return meta;
    return rotateBackups(area, writeCopy, key, state, meta, now());
  }

  /** The required `preBulk` before a destructive op; a failed copy refuses that op unapplied. */
  async function guardPreBulk(
    key: string,
    state: ReadyState,
    run: (refuseDestructive: boolean) => Processed,
  ): Promise<Processed> {
    const first = run(false);
    if (!first.destructive || first.preBulkWritten || !state.data) return first;
    if (await writePreBulk(writeCopy, key, state, now())) {
      return { ...first, preBulkWritten: true };
    }
    return run(true);
  }

  /** Pending acks applied to every still-registered client. */
  function foldAcks(pending: Map<string, number>, meta: FolderOwnerMeta): FolderOwnerMeta {
    let folded = meta;
    for (const [clientId, ackedThrough] of pending) {
      const client = folded.clients[clientId];
      if (client) folded = withClient(folded, clientId, acknowledge(client, ackedThrough, now()));
    }
    return folded;
  }

  /** Drops the acks a commit carried, keeping any that arrived during it. */
  function forgetAcks(key: string, carried: Map<string, number>) {
    const forKey = acks.get(key);
    if (!forKey) return;
    for (const [clientId, ackedThrough] of carried) {
      if (forKey.get(clientId) === ackedThrough) forKey.delete(clientId);
    }
    if (forKey.size === 0) acks.delete(key);
  }

  async function removePending(clientId: string, seqs: number[], applied: number) {
    const keys = seqs.filter((seq) => seq <= applied).map((seq) => pendingOpKey(clientId, seq));
    if (keys.length === 0) return;
    try {
      await area.remove(keys);
    } catch {
      // Left for a later drain or tombstone drop.
    }
  }

  const ctx: OwnerTurnContext = { area, now, settle, guardPreBulk, removePending };

  async function collectIfDue(key: string, meta: FolderOwnerMeta, at: number) {
    if (at - (lastGcAt.get(key) ?? -Infinity) < GC_INTERVAL_MS) return meta;
    lastGcAt.set(key, at);
    return collect(ctx, meta, at);
  }

  async function openTurn(request: OpenRequest, policy: FolderSitePolicy): Promise<OpenReply> {
    const { key, clientId } = request;
    let state = await resolve(key);
    if (state.kind === 'read_failed' || state.kind === 'write_failed') {
      return { kind: 'refused', reason: state.kind };
    }
    if (state.kind === 'ready') state = await drainKey(ctx, key, state, policy);
    const at = now();
    const known = request.epoch === undefined || request.epoch === state.meta.epoch;
    const meta = known ? registered(state.meta, request, at) : null;
    if (!meta) return { kind: 'unknown_client', epoch: state.meta.epoch };
    const contacted = withClient(
      meta,
      clientId,
      acknowledge(meta.clients[clientId], request.ackedThrough, at),
    );
    const next = await collectIfDue(key, contacted, at);
    // Registration is a meta-only commit; an invalid K is never rewritten here.
    const base: ReadyState =
      state.kind === 'ready'
        ? state
        : { kind: 'ready', data: null, hash: state.meta.dataHash, meta: state.meta };
    const committed = await settle(key, base, { data: base.data, meta: next, outcomes: {} });
    if (!committed?.meta.clients[clientId]) return { kind: 'refused', reason: 'write_failed' };
    return openReply(state, committed, clientId);
  }

  /** The meta ready for `request`'s ops, or the reply that refuses them. */
  function admit(state: ReadyState, request: ApplyRequest): FolderOwnerMeta | ApplyReply {
    const { clientId, ops } = request;
    if (request.epoch !== state.meta.epoch) {
      return { kind: 'unknown_client', epoch: state.meta.epoch };
    }
    let meta = state.meta;
    if (!meta.clients[clientId]) {
      if (!meta.retired[clientId]) return { kind: 'unknown_client', epoch: meta.epoch };
      meta = revive(meta, clientId, now());
    }
    if (isBadBatch(ops)) return { kind: 'bad_batch' };
    const client = meta.clients[clientId];
    if (ops[0].seq > client.applied + 1) return { kind: 'seq_gap', applied: client.applied };
    // A live client's own ops apply onto the current value and clear a racing drain's hold.
    const { held: _cleared, ...rest } = client;
    return withClient(meta, clientId, rest);
  }

  async function applyTurn(request: ApplyRequest, policy: FolderSitePolicy): Promise<ApplyReply> {
    const { key, clientId, ops } = request;
    const state = await resolve(key);
    if (state.kind === 'read_failed' || state.kind === 'write_failed') {
      return { kind: 'refused', reason: state.kind };
    }
    if (state.kind === 'invalid') return { kind: 'refused', reason: 'invalid_state' };
    const meta = admit(state, request);
    if ('kind' in meta) return meta;
    const contact = { ackedThrough: request.ackedThrough };
    const bulk = newBulkOp(ops, meta.clients[clientId].applied);
    const result = bulk && (await runBulkOp(ctx, writeCopy, key, policy.site, state, bulk.body));
    if (result === 'read_failed') return { kind: 'refused', reason: 'read_failed' };
    const processed =
      bulk && result
        ? bulkProcessed(meta, clientId, bulk.seq, result, contact, now())
        : await guardPreBulk(key, state, (refuseDestructive) =>
            processOps(state, meta, clientId, ops, policy, now(), contact, { refuseDestructive }),
          );
    const durable = await settle(key, state, processed);
    const stored = durable?.meta.clients[clientId];
    if (!durable || !stored || stored.applied < ops[ops.length - 1].seq) {
      return { kind: 'refused', reason: 'write_failed' };
    }
    await removePending(
      clientId,
      ops.map((op) => op.seq),
      stored.applied,
    );
    return {
      kind: 'ok',
      epoch: durable.meta.epoch,
      rev: durable.meta.rev,
      applied: stored.applied,
      outcomes: replyOutcomes(ops, processed, stored),
      allowanceTtlMs: ALLOWANCE_TTL_MS,
    };
  }

  /** A resolved, valid state for a recovery-panel turn, or why there is none. */
  async function readyFor(key: string): Promise<ReadyState | TurnRefusal> {
    const state = await resolve(key);
    if (state.kind === 'invalid') return 'invalid_state';
    return state.kind === 'ready' ? state : state.kind;
  }

  async function snapshotTurn(request: SnapshotRequest): Promise<SnapshotReply> {
    const state = await resolve(request.key);
    if (state.kind === 'read_failed' || state.kind === 'write_failed') {
      return { kind: 'refused', reason: state.kind };
    }
    const base = {
      epoch: state.meta.epoch,
      rev: state.meta.rev,
      applied: state.meta.clients[request.clientId]?.applied ?? 0,
    };
    if (state.kind === 'invalid') return { kind: 'invalid', ...base };
    return state.data
      ? { kind: 'ready', data: state.data, dataHash: state.hash, ...base }
      : { kind: 'empty', ...base };
  }

  return {
    snapshot(request) {
      if (!policyFor(request.key)) return Promise.resolve({ kind: 'refused', reason: 'not_owner' });
      return serialize(() => snapshotTurn(request), [request.key, ownerMetaKey(request.key)]);
    },
    ack({ key, clientId, ackedThrough }) {
      const forKey = acks.get(key) ?? new Map<string, number>();
      forKey.set(clientId, Math.max(forKey.get(clientId) ?? 0, ackedThrough));
      acks.set(key, forKey);
    },
    open(request) {
      const policy = policyFor(request.key);
      if (!policy) return Promise.resolve({ kind: 'refused', reason: 'not_owner' });
      return serialize(() => openTurn(request, policy), [request.key, ownerMetaKey(request.key)]);
    },
    apply(request) {
      const policy = policyFor(request.key);
      if (!policy) return Promise.resolve({ kind: 'refused', reason: 'not_owner' });
      return serialize(() => applyTurn(request, policy), [request.key, ownerMetaKey(request.key)]);
    },
    held(request) {
      const policy = policyFor(request.key);
      if (!policy) return Promise.resolve({ kind: 'refused', reason: 'not_owner' });
      return serialize(async () => {
        const state = await readyFor(request.key);
        if (typeof state === 'string') return { kind: 'refused', reason: state };
        const { key, heldClientId, decision } = request;
        return resolveHeld(ctx, key, state, heldClientId, decision, policy);
      }, [request.key, ownerMetaKey(request.key)]);
    },
    adoptJournal(request) {
      const policy = policyFor(request.key);
      if (!policy) return Promise.resolve({ kind: 'refused', reason: 'not_owner' });
      return serialize(async () => {
        const state = await readyFor(request.key);
        if (typeof state === 'string') return { kind: 'refused', reason: state };
        return adoptJournal(ctx, request.key, state, request, policy, newId);
      }, [request.key, ownerMetaKey(request.key)]);
    },
    observe(key, value) {
      if (!policyFor(key)) return Promise.resolve();
      return serialize(async () => {
        const bundle = await resolveBundleIntent(area, options.authority, now, {
          readKeys: [key, ownerMetaKey(key)],
        });
        if (bundle !== 'ok') return;
        const hash = await hashStored(value);
        if (value !== undefined && !ownHashes.get(key)?.includes(hash)) {
          await keepForeignCopy(area, key, value, hash, now());
        }
        await resolve(key);
      }, [key, ownerMetaKey(key)]);
    },
    async drain(key) {
      const policy = policyFor(key);
      if (!policy) return;
      await serialize(async () => {
        const state = await resolve(key);
        if (state.kind === 'ready') await drainKey(ctx, key, state, policy);
      }, [key, ownerMetaKey(key)]);
    },
  };
}
