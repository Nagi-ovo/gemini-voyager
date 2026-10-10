import {
  cloneFolderData,
  cutFolderCycles,
  findInheritedFolderKey,
  findRepeatedFolderId,
  ownBucket,
  setBucket,
  validateFolderData,
} from '@/features/folder/model/folderData';
import { FolderImportExportService } from '@/features/folder/services/FolderImportExportService';
import type { ImportResult } from '@/features/folder/types/import-export';

import { createFolderWriter, type FolderWriter } from './storage/folderWriter';
import type { FolderData } from './types';

export type AIStudioImportFile =
  | { ok: true; data: FolderData }
  | { ok: false; messageKey: 'folder_import_wrong_site' | 'folder_import_invalid_format' };

/**
 * Read the folders from a parsed AI Studio folder file (`{ data }` or the bare
 * data). A file another site marked as its own, as ChatGPT marks its exports,
 * holds conversations AI Studio cannot open, so it is refused whatever its shape.
 */
export function readAIStudioImportFile(json: unknown): AIStudioImportFile {
  if (FolderImportExportService.exportedPlatform(json) !== null) {
    return { ok: false, messageKey: 'folder_import_wrong_site' };
  }
  const file = json && typeof json === 'object' ? (json as { data?: unknown }) : null;
  const next = (file && (file.data || file)) as FolderData | null;
  if (
    !next ||
    !Array.isArray(next.folders) ||
    typeof next.folderContents !== 'object' ||
    (next.folderContents && findInheritedFolderKey(next.folders, next.folderContents) !== null) ||
    findRepeatedFolderId(next.folders) !== null
  ) {
    return { ok: false, messageKey: 'folder_import_invalid_format' };
  }
  return { ok: true, data: { ...next, folders: cutFolderCycles(next.folders) } };
}

/**
 * Import the legacy sync bucket at most once for this target. Valid local data
 * is authoritative: missing legacy items may be deletions. Keep the sync bytes
 * untouched for recovery, including when an existing local bucket skips import.
 */
export async function migrateAIStudioLegacySync(
  targetKey: string,
  write: FolderWriter = createFolderWriter(),
): Promise<void> {
  const markerKey = `${targetKey}:legacySyncImported`;
  const migrate = async () => {
    const local = await chrome.storage.local.get([targetKey, markerKey]);
    if (local[markerKey] === true) return;
    if (!validateFolderData(local[targetKey])) {
      const sync = await chrome.storage.sync.get(targetKey);
      if (!validateFolderData(sync[targetKey])) return;
      // A different tab may have saved or deleted items while sync was read.
      const latest = await chrome.storage.local.get([targetKey, markerKey]);
      if (latest[markerKey] === true) return;
      if (!validateFolderData(latest[targetKey])) {
        await write(targetKey, () => chrome.storage.local.set({ [targetKey]: sync[targetKey] }));
      }
    }
    // Separate from the data write: never mark a failed import as complete.
    await write(targetKey, () => chrome.storage.local.set({ [markerKey]: true }));
  };
  // ponytail: Web Locks serialize per origin; cross-origin writers need a background owner.
  if (navigator.locks?.request) await navigator.locks.request(markerKey, migrate);
  else await migrate();
}

/**
 * Merge an imported AI Studio file into a copy of the current data: imported
 * folders are appended, and only their buckets are read, so the file's
 * Uncategorized and orphan buckets are ignored. A new folder's bucket replaces
 * any orphan bucket left under its id; an existing folder gains the prompts it
 * lacks. The stats count what the merge added.
 */
export function mergeAIStudioImport(
  current: FolderData,
  file: FolderData,
): { data: FolderData; stats: ImportResult } {
  const existing = cloneFolderData(current);
  const existingIds = new Set(existing.folders.map((folder) => folder.id));
  const imported: FolderData = { folders: file.folders, folderContents: {} };
  for (const folder of file.folders) {
    if (!existingIds.has(folder.id)) delete existing.folderContents[folder.id];
    setBucket(imported.folderContents, folder.id, ownBucket(file.folderContents, folder.id) ?? []);
  }
  const { merged, stats } = FolderImportExportService.mergeData(existing, imported);
  return { data: merged, stats };
}
