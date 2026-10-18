import type { FolderData } from '@/core/types/folder';
import { MAX_FOLDER_DEPTH } from '@/features/folder/constants';

import { getFolderDepth } from './folderData';

/**
 * Whether a folder at `depth` (0 is the top level, -1 the root itself) may get
 * a new subfolder. Only creation is capped: moves, imports and synced data keep
 * whatever depth they bring.
 */
export function canCreateChildAtDepth(depth: number): boolean {
  return depth < MAX_FOLDER_DEPTH;
}

/** Whether a new folder may be created under `parentId` (`null` is the top level). */
export function canCreateFolderUnder(data: FolderData, parentId: string | null): boolean {
  return parentId === null || canCreateChildAtDepth(getFolderDepth(data, parentId));
}
