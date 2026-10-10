import { type FolderOwnerMeta, pendingOpKey } from './folderOwnerState';
import { type OwnerTurnContext, seqRange } from './ownerProcess';

export const GC_INTERVAL_MS = 60 * 60 * 1000;
/** A client idle this long, with no held mark and no accepted op left, is retired. */
export const CLIENT_IDLE_MS = 60 * 60 * 1000;
/** A tombstone lives at least this long; clients re-open before publishing well inside it (addendum P0 §1). */
export const TOMBSTONE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/**
 * Pending keys a dropped tombstone clears on each side of its watermark: above
 * it, left by a writer that broke the one-key-per-set rule; at or below it,
 * left by a crash between a commit and the key's removal.
 */
const STRAY_SCAN = 256;

/** Removes the pending keys around each dropped tombstone's watermark; `false` if any may remain. */
async function removeStrays(
  ctx: OwnerTurnContext,
  dropped: Array<[string, { applied: number }]>,
): Promise<boolean> {
  const strays = dropped.flatMap(([id, { applied }]) => {
    const from = Math.max(1, applied - STRAY_SCAN + 1);
    return seqRange(from, applied + STRAY_SCAN - from + 1).map((seq) => pendingOpKey(id, seq));
  });
  try {
    await ctx.area.remove(strays);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retires idle clients (always leaving a tombstone) and drops tombstones past
 * their TTL. Neither step trusts one absent probe to mean "no later
 * publisher": a tombstone stays revivable, and a client re-opens before
 * publishing long before its tombstone can be dropped (addendum P0 §1).
 */
export async function collect(
  ctx: OwnerTurnContext,
  meta: FolderOwnerMeta,
  at: number,
): Promise<FolderOwnerMeta> {
  const idle = Object.entries(meta.clients).filter(
    ([, client]) => !client.held && at - client.lastSeenAt >= CLIENT_IDLE_MS,
  );
  const expired = Object.entries(meta.retired).filter(([, t]) => at - t.at >= TOMBSTONE_TTL_MS);
  if (idle.length === 0 && expired.length === 0) return meta;
  let found: Record<string, unknown>;
  try {
    found = await ctx.area.get(
      [...idle, ...expired].map(([id, entry]) => pendingOpKey(id, entry.applied + 1)),
    );
  } catch {
    return meta;
  }
  const absent = ([id, entry]: [string, { applied: number }]) =>
    found[pendingOpKey(id, entry.applied + 1)] === undefined;
  const clients = { ...meta.clients };
  const retired = { ...meta.retired };
  const dropped = expired.filter(absent);
  // A tombstone is dropped only once its strays are gone: it is their only cleanup owner.
  if (dropped.length > 0 && (await removeStrays(ctx, dropped))) {
    for (const [id] of dropped) delete retired[id];
  }
  for (const [id, client] of idle.filter(absent)) {
    delete clients[id];
    retired[id] = { applied: client.applied, at };
  }
  return { ...meta, clients, retired };
}
