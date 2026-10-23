import { CleanupPositions } from '@/core/types/cleanupPositions';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

import type { GeminiFolderSession } from './folder/session/geminiFolderSession';
import { openGeminiFolderSession } from './folder/session/geminiFolderSessions';

/**
 * Admits Gemini's folders plugin and holds Gemini's folder session for the
 * page's lifetime: the account scope and its `/u/<n>/` route, the popup's
 * cloud-sync answers and the legacy migration run with folders switched off,
 * as they always have, and Folder-as-Project files new chats through the
 * session. Resolves the session once its start-up settled (a failed one is
 * reported and the session kept, as before), or `null` once the page retired.
 */
export async function admitGeminiFolders(
  admission: OfficialAdmissionController,
  options: { cleanupManager: CleanupManager; lifetime: AbortSignal },
): Promise<GeminiFolderSession | null> {
  if (options.lifetime.aborted) return null;
  admission.admit('gemini', 'folders');
  const lease = openGeminiFolderSession();
  options.cleanupManager.registerCleanupFunction(
    () => void lease.release(),
    CleanupPositions.DestroyFolderManagerInstance,
  );
  await lease.ready.catch((error) => console.error('[FolderManager] Initialization error:', error));
  return options.lifetime.aborted ? null : lease.session;
}
