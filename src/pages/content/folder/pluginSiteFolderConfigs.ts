/**
 * The folder bucket configs of the catalog sites (ChatGPT, Claude, DeepSeek):
 * one unscoped bucket per browser profile each. Core data policy, read by the
 * site table (`features/folder/sites/folderSiteTable.ts`) and the sites' stores.
 */
import { StorageKeys } from '@/core/types/common';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { normalizeFolderData } from '@/features/folder/model/folderData';
import { FOLDER_PLATFORMS } from '@/features/folder/platforms';

import type { PlatformFolderConfig } from './platformFolderConfig';
import type { FolderData } from './types';

/**
 * ChatGPT's folder bucket. Keys, the backup namespace and the root bucket id are
 * serialized user data: freeze them.
 *
 * `platform: null` keeps account isolation off without consulting Gemini's or the
 * legacy switch, so the bucket stays the plain key. ChatGPT has no `/u/<N>/` and
 * shares one email across Personal and Team workspaces; its isolation is design P4.
 * There is no legacy global ChatGPT bucket, so nothing is ever inherited.
 */
export const CHATGPT_FOLDER_CONFIG: PlatformFolderConfig = {
  platform: null,
  storageKey: StorageKeys.FOLDER_DATA_CHATGPT,
  backupNamespace: 'chatgpt-folders',
  rootBucketId: ROOT_CONVERSATIONS_ID,
  isolationSettingKeys: [],
  migrateLegacyData: (): FolderData => ({ folders: [], folderContents: {} }),
  logPrefix: '[ChatGptFolderStore]',
  debugFlag: 'gvChatGptFolderDebug',
  normalize: normalizeFolderData,
  pruneOrphanBuckets: true,
  recoverMissingData: false,
  retryFailedSave: true,
  checkEmptyOverwrite: true,
};

/**
 * A plugin site's bucket config, as ChatGPT's (`CHATGPT_FOLDER_CONFIG`):
 * `platform: null` keeps account isolation off, so the bucket stays the plain
 * key, and there is no legacy global bucket to inherit from. The key, the
 * backup namespace and the root bucket id are serialized user data.
 */
export function pluginSiteFolderConfig(options: {
  storageKey: string;
  backupNamespace: string;
  logPrefix: string;
  debugFlag: string;
}): PlatformFolderConfig {
  return {
    platform: null,
    ...options,
    rootBucketId: ROOT_CONVERSATIONS_ID,
    isolationSettingKeys: [],
    migrateLegacyData: () => ({ folders: [], folderContents: {} }),
    normalize: normalizeFolderData,
    pruneOrphanBuckets: true,
    recoverMissingData: false,
    retryFailedSave: true,
    checkEmptyOverwrite: true,
  };
}

export const CLAUDE_FOLDER_CONFIG = pluginSiteFolderConfig({
  storageKey: StorageKeys.FOLDER_DATA_CLAUDE,
  backupNamespace: FOLDER_PLATFORMS.claude.backupNamespace,
  logPrefix: '[ClaudeFolderStore]',
  debugFlag: 'gvClaudeFolderDebug',
});

export const DEEPSEEK_FOLDER_CONFIG = pluginSiteFolderConfig({
  storageKey: StorageKeys.FOLDER_DATA_DEEPSEEK,
  backupNamespace: FOLDER_PLATFORMS.deepseek.backupNamespace,
  logPrefix: '[DeepSeekFolderStore]',
  debugFlag: 'gvDeepSeekFolderDebug',
});
