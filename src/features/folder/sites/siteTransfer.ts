import type { FolderData } from '@/core/types/folder';
/**
 * A plugin site's folder file: the shared folder format marked with the site,
 * validated so that only that site's own conversations go in. Used by the
 * panel's import and export and by cloud restore (`FOLDER_PLATFORMS[..].folderExport`).
 */
import type { FolderExportPlatform } from '@/core/types/sync';
import { FolderImportExportService } from '@/features/folder/services/FolderImportExportService';
import type {
  FolderExportPayload,
  ImportResult,
  ImportStrategy,
} from '@/features/folder/types/import-export';

export type SiteFolderExportPayload<P extends FolderExportPlatform = FolderExportPlatform> =
  FolderExportPayload & { platform: P };

export type SiteImportOutcome =
  | { ok: true; data: FolderData; stats: ImportResult }
  | { ok: false; reason: 'invalid' | 'wrong-site' | 'failed'; message?: string };

export type SiteExportRead =
  | { ok: true; payload: FolderExportPayload }
  | { ok: false; reason: 'invalid' | 'wrong-site'; message?: string };

export interface SiteTransferSpec<P extends FolderExportPlatform> {
  readonly platform: P;
  /** The canonical origin an imported entry's link must start with, e.g. `https://claude.ai`. */
  readonly origin: string;
  /** The stored id and canonical link of the conversation `url` names, or `null`. */
  readonly read: (url: string) => { conversationId: string; url: string } | null;
}

export interface SiteTransfer<P extends FolderExportPlatform> {
  export(data: FolderData): SiteFolderExportPayload<P>;
  filename(now?: Date): string;
  /** Validates a folder file before an import or cloud restore can write it. */
  read(raw: unknown, strategy?: ImportStrategy): SiteExportRead;
  /** Merges a folder file into `current`. Nothing is written; the caller persists `data`. */
  importInto(raw: unknown, current: FolderData): Promise<SiteImportOutcome>;
}

export function createSiteTransfer<P extends FolderExportPlatform>(
  spec: SiteTransferSpec<P>,
): SiteTransfer<P> {
  /**
   * Whether every entry in `data` is this site's conversation keyed by its own
   * URL. One foreign entry (another site's export) rejects the whole file: a
   * partial import would silently drop the user's folders' contents.
   */
  const holdsOnlyOwnConversations = (data: FolderData): boolean =>
    Object.values(data.folderContents).every((bucket) =>
      bucket.every((entry) => {
        const identity = typeof entry.url === 'string' ? spec.read(entry.url) : null;
        // Imports require the canonical host, even where navigation accepts a legacy one.
        return (
          identity !== null &&
          identity.url.startsWith(`${spec.origin}/`) &&
          identity.conversationId === entry.conversationId
        );
      }),
    );

  const read = (raw: unknown, strategy: ImportStrategy = 'merge'): SiteExportRead => {
    const platform =
      raw && typeof raw === 'object' ? (raw as { platform?: unknown }).platform : null;
    if (platform !== undefined && platform !== null && platform !== spec.platform) {
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
    if (!holdsOnlyOwnConversations(validated.data.data)) {
      return { ok: false, reason: 'wrong-site' };
    }
    return { ok: true, payload: validated.data };
  };

  return {
    export: (data) => ({
      ...FolderImportExportService.exportToPayload(data),
      platform: spec.platform,
    }),
    filename: (now = new Date()) => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const date = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
      const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      return `voyager-${spec.platform}-folders-${date}-${time}.json`;
    },
    read,
    importInto: async (raw, current) => {
      const validated = read(raw);
      if (!validated.ok) return validated;
      // Merge only, and no sessionStorage backup: the repository keeps its own
      // recovery copies, and a merge never removes an existing folder or entry.
      const imported = await FolderImportExportService.importFromPayload(
        validated.payload,
        current,
        { strategy: 'merge', createBackup: false },
      );
      if (!imported.success) {
        return { ok: false, reason: 'failed', message: imported.error.message };
      }
      return { ok: true, data: imported.data.data, stats: imported.data.stats };
    },
  };
}
