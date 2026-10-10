import type { FolderData } from '@/core/types/folder';
import { FolderImportExportService } from '@/features/folder/services/FolderImportExportService';
import type {
  FolderExportPayload,
  ImportResult,
  ImportStrategy,
} from '@/features/folder/types/import-export';

import { readChatGptConversation } from './chatgptIdentity';

export const CHATGPT_EXPORT_PLATFORM = 'chatgpt';

/** The shared folder file format, marked with the site it came from. */
export type ChatGptFolderExportPayload = FolderExportPayload & {
  platform: typeof CHATGPT_EXPORT_PLATFORM;
};

export type ChatGptImportOutcome =
  | { ok: true; data: FolderData; stats: ImportResult }
  | { ok: false; reason: 'invalid' | 'wrong-site' | 'failed'; message?: string };

export function exportChatGptFolders(data: FolderData): ChatGptFolderExportPayload {
  return { ...FolderImportExportService.exportToPayload(data), platform: CHATGPT_EXPORT_PLATFORM };
}

export function chatgptFolderExportFilename(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `voyager-chatgpt-folders-${date}-${time}.json`;
}

/**
 * Whether every entry in `data` is a ChatGPT conversation keyed by its own URL.
 * One foreign entry (a Gemini or AI Studio export) rejects the whole file: a
 * partial import would silently drop the user's folders' contents.
 */
function holdsOnlyChatGptConversations(data: FolderData): boolean {
  return Object.values(data.folderContents).every((bucket) =>
    bucket.every((entry) => {
      const identity = typeof entry.url === 'string' ? readChatGptConversation(entry.url) : null;
      // Imports require the canonical host, even though navigation accepts the legacy redirect.
      return (
        identity !== null &&
        identity.url.startsWith('https://chatgpt.com/') &&
        identity.conversationId === entry.conversationId
      );
    }),
  );
}

/** Validates a ChatGPT folder file before an import or cloud restore can write it. */
export function readChatGptFolderExport(
  raw: unknown,
  strategy: ImportStrategy = 'merge',
):
  | { ok: true; payload: FolderExportPayload }
  | { ok: false; reason: 'invalid' | 'wrong-site'; message?: string } {
  const platform = raw && typeof raw === 'object' ? (raw as { platform?: unknown }).platform : null;
  if (platform !== undefined && platform !== null && platform !== CHATGPT_EXPORT_PLATFORM) {
    return { ok: false, reason: 'wrong-site' };
  }
  const validated = FolderImportExportService.validatePayload(raw);
  if (!validated.success) {
    return { ok: false, reason: 'invalid', message: validated.error.message };
  }
  // Dropping corrupt data is safe for a merge, but an overwrite would silently delete local entries.
  if (strategy === 'overwrite') {
    const contents = (raw as FolderExportPayload).data.folderContents;
    const prototype = Object.getPrototypeOf(contents);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      FolderImportExportService.sanitizeFolderContents(contents).skipped > 0
    ) {
      return { ok: false, reason: 'invalid' };
    }
  }
  if (!holdsOnlyChatGptConversations(validated.data.data)) {
    return { ok: false, reason: 'wrong-site' };
  }
  return { ok: true, payload: validated.data };
}

/** Merges a folder file into `current`. Nothing is written here; the caller persists `data`. */
export async function importChatGptFolders(
  raw: unknown,
  current: FolderData,
): Promise<ChatGptImportOutcome> {
  const validated = readChatGptFolderExport(raw);
  if (!validated.ok) return validated;
  // Merge only, and no sessionStorage backup: the repository keeps its own
  // recovery copies, and a merge never removes an existing folder or entry.
  const imported = await FolderImportExportService.importFromPayload(validated.payload, current, {
    strategy: 'merge',
    createBackup: false,
  });
  if (!imported.success) {
    return { ok: false, reason: 'failed', message: imported.error.message };
  }
  return { ok: true, data: imported.data.data, stats: imported.data.stats };
}
