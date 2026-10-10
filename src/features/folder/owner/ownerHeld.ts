/**
 * The user's decisions from the recovery panel (DESIGN-v2 §6.5, §7.8), P3
 * dormant. Held ops and journal entries run under their original client's
 * watermark, so an op that was already applied is a duplicate, and a
 * destructive op is never re-applied from either source.
 */
import {
  DESTRUCTIVE_OP_KINDS,
  type FolderOpBody,
  type OpOutcome,
  type StoredOutcome,
  rejected,
} from './folderOps';
import type { FolderSitePolicy } from './folderOwnerPolicy';
import { type ReadyState, pendingOpKey } from './folderOwnerState';
import { drainClient, isPendingEntry } from './ownerDrain';
import {
  INVALID_BODY,
  type OwnerTurnContext,
  processOps,
  revive,
  seqRange,
  withClient,
} from './ownerProcess';

export const HELD_CHUNK = 32;

export type HeldDecision = 'apply' | 'discard';

export type HeldReply =
  | { kind: 'resolved'; applied: number; outcomes: Record<number, StoredOutcome> }
  | { kind: 'refused'; reason: 'not_held' | TurnRefusal };

export type AdoptJournalReply =
  | { kind: 'adopted'; clientId: string; outcomes: Record<number, StoredOutcome> }
  | { kind: 'seq_gap'; applied: number }
  | { kind: 'bad_batch' }
  | { kind: 'refused'; reason: TurnRefusal };

/** Why a turn could not start or finish. */
export type TurnRefusal = 'read_failed' | 'write_failed' | 'invalid_state' | 'not_owner';

const notReapplied = (body: FolderOpBody): OpOutcome | null =>
  DESTRUCTIVE_OP_KINDS.has(body.kind) ? rejected('not_reapplied') : null;

const decide = (decision: HeldDecision) =>
  decision === 'discard' ? () => rejected('discarded_by_user') : notReapplied;

/** One client's stored ops from `from` on: the gap-free prefix, malformed entries marked invalid. */
async function readPending(
  ctx: OwnerTurnContext,
  key: string,
  clientId: string,
  from: number,
): Promise<Array<{ seq: number; body: unknown }> | null> {
  const seqs = seqRange(from, HELD_CHUNK);
  let found: Record<string, unknown>;
  try {
    found = await ctx.area.get(seqs.map((seq) => pendingOpKey(clientId, seq)));
  } catch {
    return null;
  }
  const ops: Array<{ seq: number; body: unknown }> = [];
  for (const seq of seqs) {
    const entry = found[pendingOpKey(clientId, seq)];
    if (entry === undefined) break;
    const valid = isPendingEntry(entry, clientId, seq) && entry.key === key;
    ops.push({ seq, body: valid ? entry.op : INVALID_BODY });
  }
  return ops;
}

/** Applies or discards a held client's accepted ops and clears its hold. */
export async function resolveHeld(
  ctx: OwnerTurnContext,
  key: string,
  start: ReadyState,
  clientId: string,
  decision: HeldDecision,
  policy: FolderSitePolicy,
): Promise<HeldReply> {
  const held = start.meta.clients[clientId];
  if (!held?.held) return { kind: 'refused', reason: 'not_held' };
  const { held: _cleared, ...unheld } = held;
  let state = start;
  let meta = withClient(start.meta, clientId, unheld);
  const outcomes: Record<number, StoredOutcome> = {};
  for (;;) {
    const ops = await readPending(ctx, key, clientId, meta.clients[clientId].applied + 1);
    if (!ops) return { kind: 'refused', reason: 'read_failed' };
    const [from, fromMeta] = [state, meta];
    const next = await ctx.guardPreBulk(key, from, (refuseDestructive) =>
      processOps(from, fromMeta, clientId, ops, policy, ctx.now(), null, {
        refuse: decide(decision),
        refuseDestructive,
      }),
    );
    const settled = await ctx.settle(key, state, next);
    const durable = settled?.meta.clients[clientId];
    const seqs = ops.map((op) => op.seq);
    // Only outcomes the durable watermark covers are reported (as in `drainClient`).
    if (!settled || !durable || durable.applied < (seqs[seqs.length - 1] ?? 0)) {
      return { kind: 'refused', reason: 'write_failed' };
    }
    for (const seq of seqs) outcomes[seq] = durable.outcomes[seq] ?? { kind: 'expired' };
    state = settled;
    meta = state.meta;
    await ctx.removePending(clientId, seqs, durable.applied);
    if (ops.length < HELD_CHUNK) return { kind: 'resolved', applied: durable.applied, outcomes };
  }
}

const isContiguous = (ops: ReadonlyArray<{ seq: number }>): boolean =>
  ops.length > 0 && ops.every((op, index) => op.seq === ops[0].seq + index);

/** The state with the journal's client ready to take its ops, and the ops renumbered for it. */
async function journalClient(
  ctx: OwnerTurnContext,
  key: string,
  start: ReadyState,
  journalClientId: string,
  ops: ReadonlyArray<{ seq: number; body: unknown }>,
  policy: FolderSitePolicy,
  newId: () => string,
) {
  const { meta } = start;
  if (!meta.clients[journalClientId] && !meta.retired[journalClientId]) {
    // An id this epoch never saw: a merge the user confirmed, under a fresh one-shot client.
    const clientId = newId();
    const client = { applied: 0, acked: 0, outcomes: {}, lastSeenAt: ctx.now() };
    const renumbered = ops.map((op, index) => ({ seq: index + 1, body: op.body }));
    return { state: start, meta: withClient(meta, clientId, client), clientId, ops: renumbered };
  }
  let state = start;
  if (!meta.clients[journalClientId]) {
    const revived = {
      data: state.data,
      meta: revive(meta, journalClientId, ctx.now()),
      outcomes: {},
    };
    state = (await ctx.settle(key, state, revived)) ?? state;
  }
  // Its accepted lower seqs drain first, so the journal never skips one.
  state = await drainClient(ctx, key, state, journalClientId, policy);
  return { state, meta: state.meta, clientId: journalClientId, ops };
}

/** Applies a dead page's journal under its client's watermark, never a destructive op. */
export async function adoptJournal(
  ctx: OwnerTurnContext,
  key: string,
  start: ReadyState,
  request: { journalClientId: string; ops: ReadonlyArray<{ seq: number; body: unknown }> },
  policy: FolderSitePolicy,
  newId: () => string,
): Promise<AdoptJournalReply> {
  if (!isContiguous(request.ops)) return { kind: 'bad_batch' };
  const target = await journalClient(
    ctx,
    key,
    start,
    request.journalClientId,
    request.ops,
    policy,
    newId,
  );
  const client = target.meta.clients[target.clientId];
  if (!client) return { kind: 'refused', reason: 'write_failed' };
  const last = target.ops[target.ops.length - 1].seq;
  if (last > client.applied && target.ops[0].seq > client.applied + 1) {
    return { kind: 'seq_gap', applied: client.applied };
  }
  const { state, meta, clientId, ops } = target;
  const next = await ctx.guardPreBulk(key, state, (refuseDestructive) =>
    processOps(state, meta, clientId, ops, policy, ctx.now(), null, {
      refuse: notReapplied,
      refuseDestructive,
    }),
  );
  const settled = await ctx.settle(key, state, next);
  if (!settled || (settled.meta.clients[clientId]?.applied ?? 0) < last) {
    return { kind: 'refused', reason: 'write_failed' };
  }
  return { kind: 'adopted', clientId, outcomes: next.outcomes };
}
