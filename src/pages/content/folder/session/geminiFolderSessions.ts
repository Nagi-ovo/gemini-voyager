/**
 * The page's one Gemini folder session, shared by refcounted leases
 * (`folderSessions.ts`): the content script's start point holds one for the
 * page's lifetime. The last release closes the session once its accepted
 * writes drained, and a session opened after that starts only then.
 */
import { createFolderSessions } from './folderSessions';
import { GeminiFolderSession } from './geminiFolderSession';

export interface GeminiFolderLease {
  readonly session: GeminiFolderSession;
  /** Resolves once the session started: account bound, folders loaded, answering the popup. */
  readonly ready: Promise<void>;
  /** Drops the lease; the last one resolves once the session's writes drained. Idempotent. */
  release(): Promise<void>;
}

const sessions = createFolderSessions(() => new GeminiFolderSession());

export function openGeminiFolderSession(): GeminiFolderLease {
  const lease = sessions.open('gemini');
  return { session: lease.store, ready: lease.ready, release: lease.release };
}

/** How many leases Gemini's folder session has on this page. */
export function geminiFolderLeases(): number {
  return sessions.leases('gemini');
}
