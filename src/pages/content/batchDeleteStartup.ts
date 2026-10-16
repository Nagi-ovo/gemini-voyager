import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import type { PackagedSiteId } from '@/features/plugins/sites/featureOwners';

import { VALID_PATH } from './aistudioSidebarPaths';

/** Called beside native folders, after the page's coverage and master-switch exits. */
export function admitBatchDelete(
  admission: OfficialAdmissionController,
  site: PackagedSiteId,
  lifetime?: AbortSignal,
): void {
  if (lifetime?.aborted) return;
  if (site === 'aistudio' && location.pathname !== '/' && !VALID_PATH.test(location.pathname))
    return;
  admission.admit(site, 'batchDelete');
}
