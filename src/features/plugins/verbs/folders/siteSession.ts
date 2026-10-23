/**
 * The folder data session a site's folders runtime leases while it runs: one
 * store and its commands per site and page (`createFolderSessions`). Turning
 * the folders off releases the lease; the store closes and its accepted
 * writes drain before the site's next store starts, so an off/on never loads
 * the bucket while a save is still landing.
 *
 * The store reports load and save problems to the newest runtime holding a
 * lease, the one whose view is on screen.
 */
import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import type { FolderPlatform } from '@/features/folder/platforms';
import type { SiteFolderNotify } from '@/pages/content/folder/SiteFolderStore';
import {
  type FolderSessionStore,
  type FolderSessions,
  createFolderSessions,
} from '@/pages/content/folder/session/folderSessions';

import type { SiteFoldersAdapter, SiteFoldersStore } from './types';

interface SiteSessionStore extends FolderSessionStore {
  readonly store: SiteFoldersStore;
  readonly commands: FolderCommands;
}

interface SiteSessions {
  readonly sessions: FolderSessions<SiteSessionStore>;
  /** The notices of each runtime holding a lease, oldest first. */
  readonly sinks: SiteFolderNotify[];
}

export interface SiteFolderLease {
  readonly store: SiteFoldersStore;
  readonly commands: FolderCommands;
  /** Resolves once the store loaded, after any earlier store of the site drained. */
  readonly ready: Promise<void>;
  /** Drops the lease; the last one resolves once the store's writes drained. Idempotent. */
  release(): Promise<void>;
}

const bySite = new Map<FolderPlatform, SiteSessions>();

function sessionsOf(site: SiteFoldersAdapter): SiteSessions {
  const known = bySite.get(site.platform);
  if (known) return known;
  const sinks: SiteFolderNotify[] = [];
  const sessions = createFolderSessions<SiteSessionStore>(() => {
    const { store, commands } = site.createFolders((message, tone) =>
      sinks.at(-1)?.(message, tone),
    );
    return { store, commands, init: () => store.init(), close: () => store.close() };
  });
  const created = { sessions, sinks };
  bySite.set(site.platform, created);
  return created;
}

/** Leases `site`'s folder session; `notify` shows its storage notices while this lease is newest. */
export function openSiteFolderSession(
  site: SiteFoldersAdapter,
  notify: SiteFolderNotify,
): SiteFolderLease {
  const { sessions, sinks } = sessionsOf(site);
  const lease = sessions.open(site.platform);
  sinks.push(notify);
  let released = false;
  return {
    store: lease.store.store,
    commands: lease.store.commands,
    ready: lease.ready,
    release: () => {
      if (!released) {
        released = true;
        const index = sinks.lastIndexOf(notify);
        if (index !== -1) sinks.splice(index, 1);
      }
      return lease.release();
    },
  };
}

/** How many leases `site`'s folder session has on this page. */
export function siteFolderLeases(site: FolderPlatform): number {
  return bySite.get(site)?.sessions.leases(site) ?? 0;
}
