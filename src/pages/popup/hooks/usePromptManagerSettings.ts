import { useCallback, useState } from 'react';

import { StorageKeys } from '@/core/types/common';

import { type CustomWebsitesOptions, useCustomWebsites } from './useCustomWebsites';

export const PROMPT_MANAGER_STORAGE_DEFAULTS = {
  [StorageKeys.PROMPT_CUSTOM_WEBSITES]: [],
  [StorageKeys.HIDE_PROMPT_MANAGER]: false,
  [StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO]: false,
  [StorageKeys.SLASH_PROMPT_ENABLED]: true,
  [StorageKeys.PROMPT_INSERT_ON_CLICK]: false,
};

export interface PromptManagerSettingsValues {
  hidePromptManager: boolean;
  promptTriggerMascotLogo: boolean;
  slashPromptEnabled: boolean;
  promptInsertOnClickEnabled: boolean;
}

const FLAG_KEYS = {
  hidePromptManager: StorageKeys.HIDE_PROMPT_MANAGER,
  promptTriggerMascotLogo: StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO,
  slashPromptEnabled: StorageKeys.SLASH_PROMPT_ENABLED,
  promptInsertOnClickEnabled: StorageKeys.PROMPT_INSERT_ON_CLICK,
} satisfies Record<keyof PromptManagerSettingsValues, string>;

export type PromptManagerSettings = ReturnType<typeof usePromptManagerSettings>;

/** Popup-owned prompt settings survive section hiding and auxiliary views. */
export function usePromptManagerSettings(options: CustomWebsitesOptions) {
  const { writeSyncStorage } = options;
  const { hydrateFromStorage: hydrateWebsites, ...websites } = useCustomWebsites(options);
  const [values, setValues] = useState<PromptManagerSettingsValues>({
    hidePromptManager: false,
    promptTriggerMascotLogo: false,
    slashPromptEnabled: true,
    promptInsertOnClickEnabled: false,
  });

  const hydrateFromStorage = useCallback(
    (raw: Record<string, unknown>): void => {
      setValues({
        hidePromptManager: !!raw[StorageKeys.HIDE_PROMPT_MANAGER],
        promptTriggerMascotLogo: raw[StorageKeys.PROMPT_TRIGGER_MASCOT_LOGO] === true,
        slashPromptEnabled: raw[StorageKeys.SLASH_PROMPT_ENABLED] !== false,
        promptInsertOnClickEnabled: raw[StorageKeys.PROMPT_INSERT_ON_CLICK] === true,
      });
      hydrateWebsites(raw);
    },
    [hydrateWebsites],
  );

  const onChange = useCallback(
    (patch: Partial<PromptManagerSettingsValues>): void => {
      const next: Partial<PromptManagerSettingsValues> = {};
      const payload: Record<string, unknown> = {};
      for (const key of Object.keys(FLAG_KEYS) as Array<keyof PromptManagerSettingsValues>) {
        const value = patch[key];
        if (typeof value !== 'boolean') continue;
        next[key] = value;
        payload[FLAG_KEYS[key]] = value;
      }
      setValues((current) => ({ ...current, ...next }));
      void writeSyncStorage(payload);
    },
    [writeSyncStorage],
  );

  return { values, onChange, hydrateFromStorage, ...websites };
}
