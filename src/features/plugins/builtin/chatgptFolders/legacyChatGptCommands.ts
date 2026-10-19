/**
 * ChatGPT's `FolderCommands`: the shared plugin-site commands over
 * `ChatGptFolderStore`, with ChatGPT's stored colour shape and its file import.
 */
import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import { FOLDER_SITE_POLICIES } from '@/features/folder/owner/folderOwnerPolicy';

import { createPluginSiteCommands } from '../siteFolders/siteStore';
import type { ChatGptFolderStore } from './ChatGptFolderStore';
import { importChatGptFolders } from './transfer';

export function createLegacyChatGptCommands(store: ChatGptFolderStore): FolderCommands {
  return createPluginSiteCommands({
    store,
    policy: FOLDER_SITE_POLICIES.chatgpt,
    importInto: importChatGptFolders,
    overrides: (applyOp) => ({
      // ChatGPT has always stored a cleared colour as 'default'; keep its records in that shape.
      setFolderColor: ({ folderId, color }) =>
        applyOp({ kind: 'setFolderColor', folderId, color: color ?? 'default' }),
    }),
  });
}
