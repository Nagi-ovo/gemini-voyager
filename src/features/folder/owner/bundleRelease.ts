/** Safe space release while an owned bundle is open (addendum P3P4 R3.6). */
import type { FolderAuthority } from './authority';
import { type FolderSite, siteOfFolderKey } from './folderOwnerPolicy';
import {
  type FolderOwnerStorageArea,
  hashStored,
  isMeta,
  ownerBackupKey,
  pendingOpKey,
} from './folderOwnerState';
import { isPendingEntry } from './ownerDrain';

type Authority = Readonly<Record<FolderSite, FolderAuthority>>;
const META_PREFIX = 'gvFolderOwner:meta:';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * One deletion stage per call: durable pending keys at or below a proven
 * watermark, then `last` copies, then `prior` copies. `participants` are the
 * open bundle's keys, which are never removed. Resolves `false` once nothing
 * releasable is left.
 */
export function createBundleSpaceRelease(
  area: FolderOwnerStorageArea,
  authority: Authority,
  participants: readonly string[],
) {
  let stage = 0;
  return async (): Promise<boolean> => {
    while (stage < 3) {
      // Re-read each stage: a prior failed removal or queue-external publisher may have changed it.
      const all = await area.getAll();
      const metas = Object.entries(all).flatMap(([storageKey, value]) => {
        if (!storageKey.startsWith(META_PREFIX) || !isMeta(value)) return [];
        const key = storageKey.slice(META_PREFIX.length);
        const site = siteOfFolderKey(key);
        return site && authority[site] === 'owner' ? [{ key, meta: value }] : [];
      });
      const keys: string[] = [];
      if (stage === 0) {
        const cleanMetas = new Map<string, (typeof metas)[number]['meta']>();
        for (const { key, meta } of metas) {
          // A meta-only partial landing can still roll its watermark back; retain its pending ops.
          if (meta.dataHash === (await hashStored(all[key]))) cleanMetas.set(key, meta);
        }
        for (const [storageKey, value] of Object.entries(all)) {
          if (!isRecord(value) || typeof value.clientId !== 'string') continue;
          if (typeof value.seq !== 'number') continue;
          if (storageKey !== pendingOpKey(value.clientId, value.seq)) continue;
          if (!isPendingEntry(value, value.clientId, value.seq)) continue;
          const meta = cleanMetas.get(value.key);
          if (!meta || value.epoch !== meta.epoch) continue;
          const applied =
            meta.clients[value.clientId]?.applied ?? meta.retired[value.clientId]?.applied;
          if (Number.isInteger(applied) && applied >= value.seq) keys.push(storageKey);
        }
      } else {
        const name = stage === 1 ? 'last' : 'prior';
        for (const { key, meta } of metas) {
          const ref: unknown = meta.backups?.[name];
          // Never let a malformed reference alias preBulk, foreign or quarantine.
          if (!isRecord(ref)) continue;
          const slot = ref.slot;
          if (slot !== 'a' && slot !== 'b' && slot !== 'c') continue;
          const physical = ownerBackupKey(key, slot);
          if (all[physical] !== undefined) keys.push(physical);
        }
      }
      const removable = [...new Set(keys)].filter((key) => !participants.includes(key));
      // Do not rewrite meta pointers: changing a participating meta breaks the bundle's hashes.
      if (removable.length > 0) await area.remove(removable);
      // Only a stage that completed is passed: a failed removal is tried again by the next call.
      stage += 1;
      if (removable.length > 0) return true;
    }
    return false;
  };
}
