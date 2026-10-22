/**
 * The page's one AI Studio folder session, shared by refcounted leases
 * (`folderSessions.ts`): the content script's start point holds one for the
 * page's lifetime, and the folders plugin holds another while it runs. The last
 * release closes the session once its accepted writes drained, and a session
 * opened after that starts only then.
 */
import {
  type AIStudioFolderSession as Session,
  AIStudioFolderSession,
} from './aistudioFolderSession';
import { createFolderSessions } from './folderSessions';

export interface AIStudioFolderLease {
  readonly session: Session;
  /** Resolves once the session started: migrated, account bound, listening. */
  readonly ready: Promise<void>;
  /** Drops the lease; the last one resolves once the session's writes drained. Idempotent. */
  release(): Promise<void>;
}

const sessions = createFolderSessions(() => new AIStudioFolderSession());

export function openAIStudioFolderSession(): AIStudioFolderLease {
  const lease = sessions.open('aistudio');
  return { session: lease.store, ready: lease.ready, release: lease.release };
}

/** How many leases AI Studio's folder session has on this page. */
export function aistudioFolderLeases(): number {
  return sessions.leases('aistudio');
}
