import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

import { VALID_PATH } from './aistudioSidebarPaths';

/** Admit layout separately so disabling it never disables AI Studio's folder manager. */
export function startAIStudioSidebarLayout(
  admission: OfficialAdmissionController,
  lifetime?: AbortSignal,
): void {
  if (lifetime?.aborted) return;
  // The old folder entry only started layout on the playground, prompts and library.
  if (location.pathname !== '/' && !VALID_PATH.test(location.pathname)) return;
  admission.admit('aistudio', 'aistudioSidebarWidth');
}
