/**
 * A plugin site's folder bucket and the commands that edit it: the shared site
 * store with the site's own `PlatformFolderConfig`, read by bare conversation
 * id, and the shared site commands with the site's file import.
 */
import type { FolderData } from '@/core/types/folder';
import type { EditOutcome, FolderCommands } from '@/features/folder/commands/folderCommands';
import { failed } from '@/features/folder/commands/folderCommands';
import { cloneFolderData } from '@/features/folder/model/folderData';
import { rejected } from '@/features/folder/owner/folderOps';
import type { FolderSitePolicy } from '@/features/folder/owner/folderOwnerPolicy';
import { SiteFolderStore, type SiteFolderNotify } from '@/pages/content/folder/SiteFolderStore';
import type { PlatformFolderConfig } from '@/pages/content/folder/platformFolderConfig';
import {
  type SiteFolderCommandsOptions,
  createSiteFolderCommands,
} from '@/pages/content/folder/siteFolderCommands';
import type { IFolderStorageAdapter } from '@/pages/content/folder/storage/FolderStorageAdapter';

import { filedIdsOf, filingsOf } from './filings';
import type { SiteImportOutcome } from './siteTransfer';
import type { FiledConversations } from './types';

export class PluginSiteFolderStore extends SiteFolderStore implements FiledConversations {
  constructor(
    config: PlatformFolderConfig,
    private readonly bareIdOf: (conversationId: string) => string,
    storage?: IFolderStorageAdapter,
    notify?: SiteFolderNotify,
  ) {
    super(config, storage, notify);
  }

  filedIds(): Set<string> {
    return filedIdsOf(this.references(), this.bareIdOf);
  }

  /** See `filingsOf`: a key new to this tab is a new reference. */
  filings(): Map<string, string> {
    return filingsOf(this.data, this.bareIdOf);
  }
}

/** Plugin sites' folder ids, `folder_<ms>_<rand9>`. */
export function newSiteFolderId(now: number): string {
  return `folder_${now}_${Math.random().toString(36).slice(2, 11)}`;
}

export interface PluginSiteCommandsOptions {
  store: SiteFolderStore;
  policy: FolderSitePolicy;
  /** The site's file import (`SiteTransfer.importInto`). */
  importInto: (raw: unknown, current: FolderData) => Promise<SiteImportOutcome>;
  overrides?: SiteFolderCommandsOptions['overrides'];
}

/** The shared site commands, with a merge-only import of the site's own folder file. */
export function createPluginSiteCommands({
  store,
  policy,
  importInto,
  overrides,
}: PluginSiteCommandsOptions): FolderCommands {
  async function importFile(payload: unknown): Promise<EditOutcome> {
    if (!store.ready) return failed('not_loaded');
    const outcome = await importInto(payload, cloneFolderData(store.data));
    if (!outcome.ok) {
      if (outcome.reason === 'failed') return failed('storage_error', outcome.message ?? '');
      const messageKey =
        outcome.reason === 'wrong-site'
          ? 'folder_import_wrong_site'
          : 'folder_import_invalid_format';
      return { kind: 'rejected', reason: 'invalid_payload', messageKey };
    }
    if (!(await store.replaceData(outcome.data))) return failed('storage_error');
    return { kind: 'saved', stats: outcome.stats };
  }

  return createSiteFolderCommands({
    store,
    policy,
    newFolderId: newSiteFolderId,
    overrides,
    // Merge only, as the panel's import does; these sites have no backups or Drive merge here.
    runBulk: (body) =>
      body.kind === 'importFile' && body.strategy === 'merge'
        ? importFile(body.payload)
        : Promise.resolve(rejected('unsupported')),
  });
}
