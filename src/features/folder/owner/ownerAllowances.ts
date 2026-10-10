/**
 * Pending allowances (addendum P3P4 R3.2): every registered client of an
 * owner K may hold up to 16 KiB of accepted but unapplied pending keys, and the
 * background budget counts those bytes as reserved `data`. The count lives in
 * persisted meta, so it is rebuilt from storage at every background start;
 * only a retirement commit (the client leaving `meta.clients`) ends it.
 */
import type { FolderAuthority } from './authority';
import { type FolderSite, siteOfFolderKey } from './folderOwnerPolicy';
import {
  type FolderOwnerMeta,
  type FolderOwnerStorageArea,
  OWNER_INDEX_KEY,
  isMeta,
  ownerMetaKey,
} from './folderOwnerState';

export const ALLOWANCE_BYTES = 16 * 1024;
/** How long an allowance stays usable after the request that granted it was sent. */
export const ALLOWANCE_TTL_MS = 30 * 60 * 1000;

type Authority = Readonly<Record<FolderSite, FolderAuthority>>;

export interface AllowanceLedger {
  /** Records the clients a resolved or committed meta of `key` registers. */
  observe(key: string, meta: FolderOwnerMeta): void;
  /** Bytes reserved for every registered client; rebuilt from storage on first use. */
  reservedBytes(): Promise<number>;
}

async function readClientCounts(area: FolderOwnerStorageArea, authority: Authority) {
  const counts = new Map<string, number>();
  if (!Object.values(authority).includes('owner')) return counts;
  const index = (await area.get([OWNER_INDEX_KEY]))[OWNER_INDEX_KEY];
  const keys = (Array.isArray(index) ? index : []).filter(
    (key): key is string => typeof key === 'string' && isOwned(key, authority),
  );
  if (keys.length === 0) return counts;
  const metas = await area.get(keys.map(ownerMetaKey));
  for (const key of keys) {
    const meta = metas[ownerMetaKey(key)];
    if (isMeta(meta)) counts.set(key, Object.keys(meta.clients).length);
  }
  return counts;
}

function isOwned(key: string, authority: Authority): boolean {
  const site = siteOfFolderKey(key);
  return site !== null && authority[site] === 'owner';
}

/**
 * Reads storage only (never the budget or the write queue), so a budget step
 * may await it without waiting on itself. A failed read is retried next time,
 * and the admission that asked fails as unmeasurable.
 */
export function createAllowanceLedger(
  area: FolderOwnerStorageArea,
  authority: Authority,
): AllowanceLedger {
  const observed = new Map<string, number>();
  let stored: Promise<Map<string, number>> | null = null;
  return {
    observe(key, meta) {
      if (isOwned(key, authority)) observed.set(key, Object.keys(meta.clients).length);
    },
    async reservedBytes() {
      stored ??= readClientCounts(area, authority).catch((error: unknown) => {
        stored = null;
        throw error;
      });
      const counts = new Map([...(await stored), ...observed]);
      let clients = 0;
      for (const count of counts.values()) clients += count;
      return clients * ALLOWANCE_BYTES;
    },
  };
}
