import { useCallback, useMemo, useState } from 'react';

import {
  type AccountPlatform,
  getAccountIsolationStorageKey,
} from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import {
  FOLDER_PLATFORMS,
  FOLDER_PLATFORM_IDS,
  supportsAccountIsolation,
} from '@/features/folder/platforms';

import type { FolderSettingsValues } from '../components/FolderSettingsCard';
import { type SettingSetters, applySettingsPatch } from '../utils/settingsPatch';

export const FOLDER_SETTINGS_STORAGE_DEFAULTS = {
  geminiFolderEnabled: true,
  [StorageKeys.FOLDER_FLOATING_MODE_ENABLED]: false,
  [StorageKeys.FOLDER_FLOATING_OPEN_ON_START]: true,
  geminiFolderHideArchivedConversations: false,
  [StorageKeys.FOLDER_SEARCH_ENABLED]: true,
  [StorageKeys.FORK_ENABLED]: false,
  [StorageKeys.FOLDER_PROJECT_ENABLED]: false,
  [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED]: false,
  [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_GEMINI]: null,
  [StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED_AISTUDIO]: null,
};

export function useFolderPopupSettings({
  activeAccountPlatform,
  writeSyncStorage,
}: {
  /** `null` on tabs without a folder bucket: isolation reads as off and is never written. */
  activeAccountPlatform: AccountPlatform | null;
  writeSyncStorage: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [folderEnabled, setFolderEnabled] = useState(true);
  const [floatingModeEnabled, setFloatingModeEnabled] = useState(false);
  const [floatingOpenOnStart, setFloatingOpenOnStart] = useState(true);
  const [hideArchivedConversations, setHideArchivedConversations] = useState(false);
  const [folderSearchEnabled, setFolderSearchEnabled] = useState(true);
  const [forkEnabled, setForkEnabled] = useState(false);
  const [folderProjectEnabled, setFolderProjectEnabled] = useState(false);
  const [accountIsolationByPlatform, setAccountIsolationByPlatform] = useState<
    Record<AccountPlatform, boolean>
  >({ gemini: false, aistudio: false });

  const setters = useMemo<SettingSetters<FolderSettingsValues>>(
    () => ({
      folderEnabled: setFolderEnabled,
      floatingModeEnabled: setFloatingModeEnabled,
      floatingOpenOnStart: setFloatingOpenOnStart,
      hideArchivedConversations: setHideArchivedConversations,
      folderSearchEnabled: setFolderSearchEnabled,
      forkEnabled: setForkEnabled,
      folderProjectEnabled: setFolderProjectEnabled,
    }),
    [],
  );

  const hydrateFromStorage = useCallback((stored: Record<string, unknown>) => {
    setFolderEnabled(stored.geminiFolderEnabled !== false);
    setFloatingModeEnabled(stored[StorageKeys.FOLDER_FLOATING_MODE_ENABLED] === true);
    setFloatingOpenOnStart(stored[StorageKeys.FOLDER_FLOATING_OPEN_ON_START] !== false);
    setHideArchivedConversations(!!stored.geminiFolderHideArchivedConversations);
    setFolderSearchEnabled(stored[StorageKeys.FOLDER_SEARCH_ENABLED] !== false);
    setForkEnabled(stored[StorageKeys.FORK_ENABLED] === true);
    setFolderProjectEnabled(stored[StorageKeys.FOLDER_PROJECT_ENABLED] === true);

    const legacyIsolationEnabled = stored[StorageKeys.GV_ACCOUNT_ISOLATION_ENABLED] === true;
    const resolveIsolation = (platform: AccountPlatform): boolean => {
      const raw = stored[FOLDER_PLATFORMS[platform].accountIsolationStorageKey];
      return typeof raw === 'boolean' ? raw : legacyIsolationEnabled;
    };
    setAccountIsolationByPlatform(
      Object.fromEntries(
        FOLDER_PLATFORM_IDS.filter(supportsAccountIsolation).map((platform) => [
          platform,
          resolveIsolation(platform),
        ]),
      ) as Record<AccountPlatform, boolean>,
    );
  }, []);

  const onChange = useCallback(
    (patch: Partial<FolderSettingsValues>) => {
      applySettingsPatch(setters, patch);
      const payload: Record<string, unknown> = {};
      if (typeof patch.folderEnabled === 'boolean')
        payload.geminiFolderEnabled = patch.folderEnabled;
      if (typeof patch.floatingModeEnabled === 'boolean')
        payload[StorageKeys.FOLDER_FLOATING_MODE_ENABLED] = patch.floatingModeEnabled;
      if (typeof patch.floatingOpenOnStart === 'boolean')
        payload[StorageKeys.FOLDER_FLOATING_OPEN_ON_START] = patch.floatingOpenOnStart;
      if (typeof patch.hideArchivedConversations === 'boolean')
        payload.geminiFolderHideArchivedConversations = patch.hideArchivedConversations;
      if (typeof patch.folderSearchEnabled === 'boolean')
        payload[StorageKeys.FOLDER_SEARCH_ENABLED] = patch.folderSearchEnabled;
      if (typeof patch.forkEnabled === 'boolean')
        payload[StorageKeys.FORK_ENABLED] = patch.forkEnabled;
      if (typeof patch.folderProjectEnabled === 'boolean')
        payload[StorageKeys.FOLDER_PROJECT_ENABLED] = patch.folderProjectEnabled;
      void writeSyncStorage(payload);
    },
    [setters, writeSyncStorage],
  );

  const onAccountIsolationChange = useCallback(
    (enabled: boolean) => {
      if (!activeAccountPlatform) return;
      setAccountIsolationByPlatform((prev) => ({ ...prev, [activeAccountPlatform]: enabled }));
      void writeSyncStorage({ [getAccountIsolationStorageKey(activeAccountPlatform)]: enabled });
    },
    [activeAccountPlatform, writeSyncStorage],
  );

  return {
    values: {
      folderEnabled,
      floatingModeEnabled,
      floatingOpenOnStart,
      hideArchivedConversations,
      folderSearchEnabled,
      forkEnabled,
      folderProjectEnabled,
    },
    accountIsolationEnabled: activeAccountPlatform
      ? accountIsolationByPlatform[activeAccountPlatform]
      : false,
    hydrateFromStorage,
    onChange,
    onAccountIsolationChange,
  };
}
