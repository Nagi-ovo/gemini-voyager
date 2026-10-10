import type { FolderAuthority } from './authority';
import type { FolderOwnerCore } from './folderOwnerCore';
import { type FolderSite, siteOfFolderKey } from './folderOwnerPolicy';
import { type FolderOwnerStorageArea, OWNER_INDEX_KEY } from './folderOwnerState';

type Authority = Readonly<Record<FolderSite, FolderAuthority>>;

export const hasOwnerSite = (authority: Authority): boolean =>
  Object.values(authority).includes('owner');

/**
 * The startup authority gate (REVIEW-v2, required before P1 ships): the owner
 * resolves and drains only keys whose site this build owns. With every site
 * legacy it does not touch storage at all, so sidecars an owner build left
 * behind stay frozen under a legacy writer after a rollback.
 */
export async function drainOwnedKeys(
  area: FolderOwnerStorageArea,
  core: Pick<FolderOwnerCore, 'drain'>,
  authority: Authority,
): Promise<void> {
  if (!hasOwnerSite(authority)) return;
  let index: unknown;
  try {
    index = (await area.get([OWNER_INDEX_KEY]))[OWNER_INDEX_KEY];
  } catch {
    return; // The first `open` of each key drains it.
  }
  if (!Array.isArray(index)) return;
  for (const key of index) {
    if (typeof key !== 'string') continue;
    const site = siteOfFolderKey(key);
    if (site && authority[site] === 'owner') await core.drain(key);
  }
}
