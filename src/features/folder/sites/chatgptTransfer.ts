import type { FolderData } from '@/core/types/folder';
import type { ImportStrategy } from '@/features/folder/types/import-export';

import { CHATGPT_IDENTITY, CHATGPT_ORIGIN } from './chatgptIdentity';
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

/** ChatGPT's folder file; imports require the canonical host, though navigation accepts the legacy one. */
export const CHATGPT_TRANSFER = createSiteTransfer({
  platform: CHATGPT_EXPORT_PLATFORM,
  origin: CHATGPT_ORIGIN,
  read: CHATGPT_IDENTITY.read,
});

export function exportChatGptFolders(data: FolderData): ChatGptFolderExportPayload {
  return CHATGPT_TRANSFER.export(data);
}

export function chatgptFolderExportFilename(now: Date = new Date()): string {
  return CHATGPT_TRANSFER.filename(now);
}

/** Validates a ChatGPT folder file before an import or cloud restore can write it. */
export function readChatGptFolderExport(
  raw: unknown,
  strategy: ImportStrategy = 'merge',
): SiteExportRead {
  return CHATGPT_TRANSFER.read(raw, strategy);
}

/** Merges a folder file into `current`. Nothing is written here; the caller persists `data`. */
export function importChatGptFolders(
  raw: unknown,
  current: FolderData,
): Promise<ChatGptImportOutcome> {
  return CHATGPT_TRANSFER.importInto(raw, current);
}
