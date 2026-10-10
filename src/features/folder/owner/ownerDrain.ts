import type { PendingOpEntry } from './folderOwnerMessages';
import type { FolderSitePolicy } from './folderOwnerPolicy';
import { type ClientRecord, type ReadyState, pendingOpKey } from './folderOwnerState';
import {
  INVALID_BODY,
  type OwnerTurnContext,
  type Processed,
  processOps,
  revive,
  seqRange,
  withClient,
} from './ownerProcess';

export const DRAIN_CHUNK = 32;

export function isPendingEntry(
  value: unknown,
  clientId: string,
  seq: number,
): value is PendingOpEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    entry.v === 1 &&
    entry.clientId === clientId &&
    entry.seq === seq &&
    typeof entry.key === 'string' &&
    typeof entry.epoch === 'string' &&
    typeof entry.at === 'number'
  );
}

type Held = ClientRecord['held'];
type HoldReason = NonNullable<Held>['reason'];

/** Why a drained op waits for the user instead of applying (§6.5), if it does. */
function holdReason(entry: PendingOpEntry, state: ReadyState): HoldReason | null {
  if (entry.epoch !== state.meta.epoch) return 'epoch_changed';
  if ((state.meta.foreignAt ?? 0) > entry.at) return 'foreign_write';
  return null;
}

/** The gap-free prefix of `found`, cut at the first op that must be held. */
function readChunk(
  key: string,
  clientId: string,
  seqs: number[],
  found: Record<string, unknown>,
  state: ReadyState,
): { ops: Array<{ seq: number; body: unknown }>; held: Held } {
  const ops: Array<{ seq: number; body: unknown }> = [];
  for (const seq of seqs) {
    const entry = found[pendingOpKey(clientId, seq)];
    if (entry === undefined) break;
    const valid = isPendingEntry(entry, clientId, seq);
    const reason = valid ? holdReason(entry, state) : null;
    if (reason) return { ops, held: { from: seq, reason } };
    ops.push({ seq, body: valid && entry.key === key ? entry.op : INVALID_BODY });
  }
  return { ops, held: undefined };
}

/** Accepted ops of one client, from its watermark on, in chunks; stops at a held op. */
export async function drainClient(
  ctx: OwnerTurnContext,
  key: string,
  start: ReadyState,
  clientId: string,
  policy: FolderSitePolicy,
): Promise<ReadyState> {
  let state = start;
  for (;;) {
    const client = state.meta.clients[clientId];
    if (!client || client.held) return state;
    const seqs = seqRange(client.applied + 1, DRAIN_CHUNK);
    let found: Record<string, unknown>;
    try {
      found = await ctx.area.get(seqs.map((seq) => pendingOpKey(clientId, seq)));
    } catch {
      return state;
    }
    const { ops, held } = readChunk(key, clientId, seqs, found, state);
    if (ops.length === 0 && !held) return state;
    const from = state;
    const processed = await ctx.guardPreBulk(key, from, (refuseDestructive) =>
      processOps(from, from.meta, clientId, ops, policy, ctx.now(), null, { refuseDestructive }),
    );
    if (held) {
      const heldClient = { ...processed.meta.clients[clientId], held };
      processed.meta = withClient(processed.meta, clientId, heldClient);
    }
    const settled = await ctx.settle(key, state, processed);
    if (!settled) return state;
    state = settled;
    const applied = state.meta.clients[clientId]?.applied ?? 0;
    await ctx.removePending(
      clientId,
      ops.map((op) => op.seq),
      applied,
    );
    // A chunk the durable watermark does not cover stays in its pending keys for a later turn.
    if (held || ops.length < DRAIN_CHUNK || applied < ops[ops.length - 1].seq) return state;
  }
}

/** Revives every tombstoned client with an accepted op at its next seq (addendum P0 §1). */
async function reviveTombstones(
  ctx: OwnerTurnContext,
  key: string,
  start: ReadyState,
): Promise<ReadyState> {
  const tombstones = Object.entries(start.meta.retired);
  if (tombstones.length === 0) return start;
  let found: Record<string, unknown>;
  try {
    found = await ctx.area.get(tombstones.map(([id, t]) => pendingOpKey(id, t.applied + 1)));
  } catch {
    return start;
  }
  let state = start;
  for (const [id, tombstone] of tombstones) {
    if (found[pendingOpKey(id, tombstone.applied + 1)] === undefined) continue;
    const revived: Processed = {
      data: state.data,
      meta: revive(state.meta, id, ctx.now()),
      outcomes: {},
    };
    state = (await ctx.settle(key, state, revived)) ?? state;
  }
  return state;
}

/** Startup and `open` drain of every registered or retired client's accepted ops for `key`. */
export async function drainKey(
  ctx: OwnerTurnContext,
  key: string,
  start: ReadyState,
  policy: FolderSitePolicy,
): Promise<ReadyState> {
  let state = await reviveTombstones(ctx, key, start);
  for (const clientId of Object.keys(state.meta.clients)) {
    state = await drainClient(ctx, key, state, clientId, policy);
  }
  return state;
}
