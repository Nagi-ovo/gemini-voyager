/**
 * Admit the site check on Gemini and AI Studio. It reports on the features
 * that start after it, so it is admitted as soon as initialization passes its
 * coverage checks: a feature that hangs or fails later cannot keep it out.
 */
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import { packagedSiteForUrl } from '@/features/plugins/sites/hostPolicy';

export function admitSiteCheck(admission: OfficialAdmissionController, url: string): void {
  const site = packagedSiteForUrl(url);
  if (site) admission.admit(site, 'siteCheck');
}
