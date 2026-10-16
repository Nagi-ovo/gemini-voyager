import { useEffect } from 'react';

import { StorageKeys } from '@/core/types/common';

import { writePopupSyncStorage } from '../utils/popupStorage';
import { FOLDER_SETTINGS_STORAGE_DEFAULTS } from './useFolderPopupSettings';
import { GENERAL_SETTINGS_STORAGE_DEFAULTS } from './useGeneralPopupSettings';
import { SECTION_LAYOUT_STORAGE_DEFAULTS } from './usePopupSections';
import { PROMPT_MANAGER_STORAGE_DEFAULTS } from './usePromptManagerSettings';
import { VISUAL_EFFECT_STORAGE_DEFAULTS } from './useVisualEffectPopupSettings';

type HydrateSettings = (raw: Record<string, unknown>) => void;

/** One startup snapshot shared by all setting owners; callbacks remain stable across UI changes. */
export function usePopupSettingsHydration({
  folder,
  general,
  promptManager,
  visualEffect,
  sections,
  aiStudio,
}: {
  folder: HydrateSettings;
  general: HydrateSettings;
  promptManager: HydrateSettings;
  visualEffect: HydrateSettings;
  sections: HydrateSettings;
  aiStudio: (enabled: boolean) => void;
}) {
  useEffect(() => {
    try {
      chrome.storage?.sync?.get(
        {
          ...FOLDER_SETTINGS_STORAGE_DEFAULTS,
          ...GENERAL_SETTINGS_STORAGE_DEFAULTS,
          ...PROMPT_MANAGER_STORAGE_DEFAULTS,
          ...VISUAL_EFFECT_STORAGE_DEFAULTS,
          ...SECTION_LAYOUT_STORAGE_DEFAULTS,
          [StorageKeys.GV_AISTUDIO_ENABLED]: true,
          [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: false,
        },
        (result) => {
          const raw = result ?? {};
          folder(raw);
          general(raw);
          promptManager(raw);
          visualEffect(raw);
          sections(raw);
          aiStudio(raw[StorageKeys.GV_AISTUDIO_ENABLED] !== false);
          // The retired title setting still needs its compatibility cleanup.
          if (raw[StorageKeys.TAB_TITLE_UPDATE_ENABLED] !== false) {
            void writePopupSyncStorage({ [StorageKeys.TAB_TITLE_UPDATE_ENABLED]: false });
          }
        },
      );
    } catch {
      // Keep initial values when the extension storage context is unavailable.
    }
  }, [folder, general, promptManager, visualEffect, sections, aiStudio]);
}
