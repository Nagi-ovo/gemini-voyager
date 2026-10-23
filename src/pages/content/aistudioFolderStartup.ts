import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

import { VALID_PATH } from './aistudioSidebarPaths';
import { openAIStudioFolderSession } from './folder/session/aistudioFolderSessions';

/** The playground (/), saved prompts and the library: where AI Studio's folders ever ran. */
function onFolderPath(): boolean {
  return location.pathname === '/' || VALID_PATH.test(location.pathname);
}

/**
 * Admits AI Studio's folders plugin, which follows the Voyager master switch
 * live, so it is admitted with the master off too. With the master on, the
 * page also holds AI Studio's folder session for its lifetime: the sync →
 * local migration, the account scope and the popup's cloud-sync answers run
 * with folders switched off, as they always have. Elsewhere on AI Studio the
 * session only migrates, and the plugin is not admitted.
 */
export function admitAIStudioFolders(
  admission: OfficialAdmissionController,
  options: { masterOn: boolean; lifetime: AbortSignal },
): void {
  if (options.lifetime.aborted) return;
  if (onFolderPath()) admission.admit('aistudio', 'folders');
  if (!options.masterOn) return;
  const lease = openAIStudioFolderSession();
  lease.ready.catch((error) => console.error('[AIStudioFolderManager] Start error:', error));
  options.lifetime.addEventListener('abort', () => void lease.release(), { once: true });
}
