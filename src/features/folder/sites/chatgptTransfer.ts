import type { FolderData } from '@/core/types/folder';
import type { ImportStrategy } from '@/features/folder/types/import-export';

import { readChatGptConversation } from './chatgptIdentity';
import {
  type SiteExportRead,
  type SiteFolderExportPayload,
  type SiteImportOutcome,
  createSiteTransfer,
} from './siteTransfer';

export const CHATGPT_EXPORT_PLATFORM = 'chatgpt';

/** The shared folder file format, marked with the site it came from. */
export type ChatGptFolderExportPayload = SiteFolderExportPayload<typeof CHATGPT_EXPORT_PLATFORM>;

export type ChatGptImportOutcome = SiteImportOutcome;

const TRANSFER = createSiteTransfer({
  platform: CHATGPT_EXPORT_PLATFORM,
  // Imports require the canonical host, even though navigation accepts the legacy redirect.
  origin: 'https://chatgpt.com',
  read: readChatGptConversation,
});

export function exportChatGptFolders(data: FolderData): ChatGptFolderExportPayload {
  return TRANSFER.export(data);
}

export function chatgptFolderExportFilename(now: Date = new Date()): string {
  return TRANSFER.filename(now);
}

/** Validates a ChatGPT folder file before an import or cloud restore can write it. */
export function readChatGptFolderExport(
  raw: unknown,
  strategy: ImportStrategy = 'merge',
): SiteExportRead {
  return TRANSFER.read(raw, strategy);
}

/** Merges a folder file into `current`. Nothing is written here; the caller persists `data`. */
export function importChatGptFolders(
  raw: unknown,
  current: FolderData,
): Promise<ChatGptImportOutcome> {
  return TRANSFER.importInto(raw, current);
}
