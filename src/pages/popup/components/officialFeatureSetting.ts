import {
  type OwnedFeatureId,
  ownedFeatureByPluginId,
} from '@/features/plugins/sites/featureOwners';
import type { TranslationKey } from '@/utils/translations';

/** Where a packaged official plugin is switched on and off: a native setting, not the plugin list. */
export interface OfficialSettingLocation {
  /** The switch's label. */
  readonly setting: TranslationKey;
  /** The title of the settings card holding it. */
  readonly card: TranslationKey;
}

// The halo holds no page-wide runtime, so it never keeps another plugin waiting.
const LOCATIONS: Readonly<Partial<Record<OwnedFeatureId, OfficialSettingLocation>>> = {
  enterSend: { setting: 'aistudioEnterSend', card: 'inputCollapseOptions' },
  draftSave: { setting: 'draftAutoSave', card: 'inputCollapseOptions' },
  ctrlEnterSend: { setting: 'ctrlEnterSend', card: 'inputCollapseOptions' },
  safariEnterFix: { setting: 'safariEnterFix', card: 'inputCollapseOptions' },
  formulaCopy: { setting: 'enableFormulaCopy', card: 'formulaCopyFormat' },
  vimInput: { setting: 'inputVimMode', card: 'inputCollapseOptions' },
  promptHistory: { setting: 'promptHistoryTitle', card: 'promptManagerOptions' },
  inputCollapse: { setting: 'enableInputCollapse', card: 'inputCollapseOptions' },
};

/** The native setting behind a packaged official plugin id, or null for any other plugin. */
export function officialSettingLocation(pluginId: string): OfficialSettingLocation | null {
  const owned = ownedFeatureByPluginId(pluginId);
  return owned ? (LOCATIONS[owned.feature] ?? null) : null;
}
