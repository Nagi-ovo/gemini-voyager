import type { FolderData } from '@/core/types/folder';

import { applyFolderOp } from '../applyFolderOp';
import type { FolderOpBody } from '../folderOps';
import type { FolderSitePolicy } from '../folderOwnerPolicy';
import { isFolderData, isMeta, ownerMetaKey } from '../folderOwnerState';

/** A consistent `(K, meta)` pair as one client sees it (§7.3). */
export interface ClientBase {
  data: FolderData | null;
  epoch: string;
  rev: number;
  dataHash: string;
  /** This client's watermark in that meta. */
  applied: number;
}

export interface StorageChange {
  newValue?: unknown;
  oldValue?: unknown;
}

export type BaseChange =
  | { kind: 'adopt'; base: ClientBase }
  | { kind: 'epoch_changed'; epoch: string }
  /** An anomaly (partial or foreign write): ask the owner for a snapshot. */
  | { kind: 'reconcile' }
  | { kind: 'ignore' };

const EMPTY: FolderData = { folders: [], folderContents: {} };

/**
 * What a `storage.onChanged` event means for `base` (§7.3). Only a pair from
 * one `set`, or a meta-only commit that keeps the data hash, moves the base.
 */
export function classifyChange(
  base: ClientBase,
  key: string,
  clientId: string,
  changes: Record<string, StorageChange>,
): BaseChange {
  const dataChange = changes[key];
  const metaChange = changes[ownerMetaKey(key)];
  if (!metaChange) return dataChange ? { kind: 'reconcile' } : { kind: 'ignore' };
  const meta = metaChange.newValue;
  if (!isMeta(meta)) return { kind: 'reconcile' };
  if (meta.epoch !== base.epoch) return { kind: 'epoch_changed', epoch: meta.epoch };
  if (meta.rev <= base.rev) return { kind: 'ignore' };
  const applied = meta.clients[clientId]?.applied ?? base.applied;
  const next = { epoch: meta.epoch, rev: meta.rev, dataHash: meta.dataHash, applied };
  if (dataChange) {
    const data = dataChange.newValue;
    return isFolderData(data) ? { kind: 'adopt', base: { ...next, data } } : { kind: 'reconcile' };
  }
  return meta.dataHash === base.dataHash
    ? { kind: 'adopt', base: { ...next, data: base.data } }
    : { kind: 'reconcile' };
}

export interface OverlayOp {
  seq: number;
  body: FolderOpBody;
  rejected: boolean;
}

/** The base with every op it does not yet include applied on top, by the owner's own function. */
export function overlay(
  base: ClientBase | null,
  ops: readonly OverlayOp[],
  policy: FolderSitePolicy,
  now: number,
): FolderData {
  let data = base?.data ?? EMPTY;
  for (const op of ops) {
    if (op.rejected || (base && op.seq <= base.applied)) continue;
    data = applyFolderOp(data, op.body, policy, now).data;
  }
  return data;
}
