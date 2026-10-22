/**
 * One folder data session per site and page, shared by refcounted leases.
 *
 * On Gemini and AI Studio the native start point will hold a lease for the
 * page's lifetime, so migrations, cloud sync answers and Folder-as-Project keep
 * their data with folders switched off; the folders primitive takes a second
 * lease for its UI. On catalog sites the primitive's lease is the only one.
 *
 * The last release closes the store and resolves only after its accepted writes
 * drained (`FolderRepository.destroy`). A site opened again meanwhile builds
 * its new store at once but starts it only after that drain, so two
 * repositories never read or write one bucket at the same time: an off/on of
 * the plugin cannot load stale data over a write still landing.
 */
import { logger } from '@/core/services/LoggerService';
import type { FolderPlatform } from '@/features/folder/platforms';

/** A site's folder store as a session holds it. */
export interface FolderSessionStore {
  init(): Promise<void>;
  /** Stops the store; resolves once its accepted writes drained. */
  close(): Promise<void>;
}

export interface FolderSessionLease<S extends FolderSessionStore> {
  readonly store: S;
  /** Resolves once the store started: after any previous session of the site drained. */
  readonly ready: Promise<void>;
  /** Drops this lease. The last one closes the store and resolves after its drain. Idempotent. */
  release(): Promise<void>;
}

export interface FolderSessions<S extends FolderSessionStore> {
  open(site: FolderPlatform): FolderSessionLease<S>;
  /** The number of leases open on `site`. */
  leases(site: FolderPlatform): number;
}

interface Session<S> {
  readonly store: S;
  readonly ready: Promise<void>;
  leases: number;
  closed: boolean;
}

export function createFolderSessions<S extends FolderSessionStore>(
  create: (site: FolderPlatform) => S,
): FolderSessions<S> {
  const open = new Map<FolderPlatform, Session<S>>();
  /** The drain of the site's last closed session, until it settles. */
  const draining = new Map<FolderPlatform, Promise<void>>();

  function start(site: FolderPlatform): Session<S> {
    const previous = draining.get(site) ?? Promise.resolve();
    const store = create(site);
    const session: Session<S> = {
      store,
      leases: 0,
      closed: false,
      // Released before the previous drain settled: never started, so nothing to load.
      ready: previous.then(() => (session.closed ? undefined : store.init())),
    };
    open.set(site, session);
    return session;
  }

  function close(site: FolderPlatform, session: Session<S>): Promise<void> {
    session.closed = true;
    if (open.get(site) === session) open.delete(site);
    const previous = draining.get(site) ?? Promise.resolve();
    const drain = previous
      .then(() => session.store.close())
      .catch((error: unknown) => {
        logger.warn('Folder session drain failed', { site, error: String(error) });
      });
    draining.set(site, drain);
    void drain.then(() => {
      if (draining.get(site) === drain) draining.delete(site);
    });
    return drain;
  }

  return {
    open(site) {
      const session = open.get(site) ?? start(site);
      session.leases += 1;
      let released: Promise<void> | null = null;
      return {
        store: session.store,
        ready: session.ready,
        release: () => {
          if (released) return released;
          session.leases -= 1;
          released = session.leases > 0 ? Promise.resolve() : close(site, session);
          return released;
        },
      };
    },
    leases: (site) => open.get(site)?.leases ?? 0,
  };
}
