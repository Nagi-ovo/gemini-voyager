/**
 * The start points of Gemini / AI Studio features that are moving to packaged
 * official plugins. Each one asks the owner table who runs the feature: the
 * native module starts here as before, or the plugin is admitted here, so
 * `PluginHost` mounts it no earlier than the native module would have started
 * and only on pages that reached this point (custom-website coverage and
 * Gemini Enterprise return before it).
 */
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import {
  type FeatureOwner,
  type OwnedFeatureId,
  type PackagedSiteId,
  featureOwner,
} from '@/features/plugins/sites/featureOwners';

export type OwnerOf = (site: PackagedSiteId, feature: OwnedFeatureId) => FeatureOwner;

/**
 * Start the native module when it still owns the feature; otherwise admit the
 * official plugin. `startLegacy` registers its own cleanup (for example through
 * `mountNativeFeature`).
 */
export async function startOwnedFeature(
  admission: OfficialAdmissionController,
  site: PackagedSiteId,
  feature: OwnedFeatureId,
  startLegacy: () => Promise<void>,
  ownerOf: OwnerOf = featureOwner,
): Promise<void> {
  if (ownerOf(site, feature) === 'legacy') {
    await startLegacy();
    return;
  }
  admission.admit(site, feature);
}

/**
 * Admit the official plugin at a point where the native module would not
 * start (AI Studio with its master switch off): nothing for a feature the
 * native module still owns, which stays off as before.
 */
export function admitPluginOwnedFeature(
  admission: OfficialAdmissionController,
  site: PackagedSiteId,
  feature: OwnedFeatureId,
  ownerOf: OwnerOf = featureOwner,
): void {
  if (ownerOf(site, feature) === 'plugin') admission.admit(site, feature);
}
