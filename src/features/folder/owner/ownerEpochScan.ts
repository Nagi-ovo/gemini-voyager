import type { ClientRecord } from './folderOwnerState';

const PENDING_PREFIX = 'gvFolderOwner:pending:';

/**
 * The clients whose accepted ops for `key` outlived its meta (§7.8 "Epoch
 * creation"): each is registered just below its lowest pending seq and held
 * for the user, so a meta loss never orphans an accepted op and never replays
 * one silently. `all` is one full read of the storage area.
 */
export function orphanedClients(
  all: Record<string, unknown>,
  key: string,
  now: number,
): Record<string, ClientRecord> {
  const lowest = new Map<string, number>();
  for (const [storageKey, value] of Object.entries(all)) {
    if (!storageKey.startsWith(PENDING_PREFIX)) continue;
    const rest = storageKey.slice(PENDING_PREFIX.length);
    const split = rest.lastIndexOf(':');
    const clientId = rest.slice(0, split);
    const seq = Number(rest.slice(split + 1));
    const entry = value as { key?: unknown } | null;
    if (split <= 0 || !Number.isInteger(seq) || seq < 1 || entry?.key !== key) continue;
    lowest.set(clientId, Math.min(lowest.get(clientId) ?? seq, seq));
  }
  return Object.fromEntries(
    [...lowest].map(([clientId, from]): [string, ClientRecord] => [
      clientId,
      {
        applied: from - 1,
        acked: from - 1,
        outcomes: {},
        lastSeenAt: now,
        held: { from, reason: 'epoch_changed' },
      },
    ]),
  );
}
