import { bareConversationId } from '@/features/folder/sites/chatgptIdentity';
import { SiteFolderStore, type SiteFolderNotify } from '@/pages/content/folder/SiteFolderStore';
import { CHATGPT_FOLDER_CONFIG } from '@/pages/content/folder/pluginSiteFolderConfigs';
import type { IFolderStorageAdapter } from '@/pages/content/folder/storage/FolderStorageAdapter';

import { filedIdsOf, filingsOf } from '../siteFolders/filings';

/**
 * ChatGPT's folder bucket on the shared site store, plus the reads ChatGPT's
 * sidebar makes by bare conversation id. Its recovery backups use the
 * `chatgpt-folders` namespace in chatgpt.com's localStorage.
 */
export class ChatGptFolderStore extends SiteFolderStore {
  constructor(storage?: IFolderStorageAdapter, notify?: SiteFolderNotify) {
    super(CHATGPT_FOLDER_CONFIG, storage, notify);
  }

  /** Bare ids of every filed conversation, for one pass over the sidebar. */
  filedIds(): Set<string> {
    return filedIdsOf(this.references(), bareConversationId);
  }

  /** See `filingsOf`: a key new to this tab is a new reference. */
  filings(): Map<string, string> {
    return filingsOf(this.data, bareConversationId);
  }
}
