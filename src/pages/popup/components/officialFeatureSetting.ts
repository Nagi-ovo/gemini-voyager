import {
  type OwnedFeatureId,
  ownedFeatureByPluginId,
} from '@/features/plugins/sites/featureOwners';
import type { TranslationKey } from '@/utils/translations';

/**
 * Where a packaged official plugin not yet listed in the popup's Plugins card
 * is switched on and off: a native settings card. A listed plugin's switch is
 * its row there (`officialPluginRegistry.ts`).
 */
export interface OfficialSettingLocation {
  /** The switch's label. */
  readonly setting: TranslationKey;
  /** The title of the settings card holding it. */
  readonly card: TranslationKey;
}

const LOCATIONS: Readonly<Partial<Record<OwnedFeatureId, OfficialSettingLocation>>> = {
  timeline: { setting: 'timelineEnable', card: 'timelineOptions' },
};

/** The native setting behind a packaged official plugin id, or null for any other plugin. */
export function officialSettingLocation(pluginId: string): OfficialSettingLocation | null {
  const owned = ownedFeatureByPluginId(pluginId);
  return owned ? (LOCATIONS[owned.feature] ?? null) : null;
}
