import type { FolderSite } from './folderOwnerPolicy';

export type FolderAuthority = 'legacy' | 'owner';

/** Changed only by a release (or the dev override), never by a runtime flag a live tab reads. */
export const FOLDER_WRITE_AUTHORITY: Readonly<Record<FolderSite, FolderAuthority>> = {
  chatgpt: 'legacy',
  aistudio: 'legacy',
  gemini: 'legacy',
};
