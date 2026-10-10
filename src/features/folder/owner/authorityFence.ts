import type { FolderAuthority } from './authority';
import type { FolderSite } from './folderOwnerPolicy';
import type { FolderOwnerStorageArea } from './folderOwnerState';

export const AUTHORITY_FENCE_KEY = 'gvFolderOwner:authority';

/** Every build publishes its authority, including rollback builds with all sites legacy (§3.3). */
export async function writeAuthorityFence(
  area: Pick<FolderOwnerStorageArea, 'set'>,
  build: string,
  sites: Readonly<Record<FolderSite, FolderAuthority>>,
): Promise<void> {
  await area.set({ [AUTHORITY_FENCE_KEY]: { build, sites } });
}

const AUTHORITY_READ_TIMEOUT_MS = 1000;

/** An absent fence predates ownership; a published fence must name the requested site. */
export function authorityForSite(value: unknown, site: FolderSite | null): FolderAuthority {
  if (value === undefined || site === null) return 'legacy';
  const authority = (value as { sites?: Record<string, unknown> } | null)?.sites?.[site];
  // Every publisher includes all sites, so a missing entry cannot authorize a writer.
  if (authority !== 'legacy' && authority !== 'owner')
    throw new Error('Folder authority is unreadable');
  return authority;
}

/** UI-free authority read shared by content and the background physical writer. */
export async function readAuthorityFence(
  area: { get(key: string): Promise<Record<string, unknown>> },
  site: FolderSite | null,
): Promise<FolderAuthority> {
  let deadline: ReturnType<typeof setTimeout> | undefined;
  try {
    const stored = await Promise.race([
      area.get(AUTHORITY_FENCE_KEY),
      new Promise<never>((_, reject) => {
        deadline = setTimeout(
          () => reject(new Error('Folder authority read timed out')),
          AUTHORITY_READ_TIMEOUT_MS,
        );
      }),
    ]);
    return authorityForSite(stored[AUTHORITY_FENCE_KEY], site);
  } finally {
    clearTimeout(deadline);
  }
}
