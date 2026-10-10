import { StorageKeys } from '@/core/types/common';
import { ROOT_CONVERSATIONS_ID } from '@/features/folder/constants';
import { normalizeFolderData } from '@/features/folder/model/folderData';
import type { PlatformFolderConfig } from '@/pages/content/folder/platformFolderConfig';
import type { FolderData } from '@/pages/content/folder/types';

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
