import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

/** Called before the normal initialization gate, on every already-injected page. */
export function admitVisualEffectsForPage(
  admission: OfficialAdmissionController,
  isPluginSubframe: boolean,
): void {
  if (!isPluginSubframe) admission.admitShared('visualEffects');
}
