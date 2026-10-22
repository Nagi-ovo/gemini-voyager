import { FolderManager } from './manager';
import type { GeminiFolderSession } from './session/geminiFolderSession';
import { openGeminiFolderSession } from './session/geminiFolderSessions';

/** Gemini's folders on this page: the session the page holds, and their teardown. */
export interface GeminiFolders {
  /** Gemini's folder data, which Folder-as-Project files new chats into. */
  readonly session: GeminiFolderSession;
  /** Removes the folders and drops the page's lease, once. */
  destroy(): void;
}

/**
 * Holds Gemini's folder session for the page's lifetime (the account scope,
 * the popup's cloud-sync answers and the legacy migration run with folders
 * off, as they always have) and starts the folder manager over it.
 */
export async function startFolderManager(): Promise<GeminiFolders | null> {
  const lease = openGeminiFolderSession();
  try {
    const manager = new FolderManager(lease);
    await manager.init();
    let destroyed = false;
    return {
      session: lease.session,
      destroy: () => {
        if (destroyed) return;
        destroyed = true;
        manager.destroy();
        void lease.release();
      },
    };
  } catch (error) {
    console.error('[FolderManager] Start error:', error);
    // The manager reports a failed start itself; this one has no other reader.
    lease.ready.catch(() => {});
    void lease.release();
    return null;
  }
}
