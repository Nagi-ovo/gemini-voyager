/**
 * The catalog sites whose folder entries are keyed by their route alone
 * (`<site>:conv:<id>` from the site's `conversationIdPattern`), with the folder
 * file each imports and exports and any edit it has always stored in a shape
 * of its own. These are what the `folders` primitive can run from a site's data.
 */
import type { FolderPlatform } from '@/features/folder/platforms';
import type { SiteFolderCommandsOptions } from '@/pages/content/folder/siteFolderCommands';

import { CHATGPT_IDENTITY } from './chatgptIdentity';
import { CHATGPT_TRANSFER } from './chatgptTransfer';
import { CLAUDE_IDENTITY, CLAUDE_TRANSFER } from './claudeIdentity';
import { DEEPSEEK_IDENTITY, DEEPSEEK_TRANSFER } from './deepseekIdentity';
import type { SiteIdentity } from './siteIdentity';
import type { SiteTransfer } from './siteTransfer';

export interface RouteFolderSite {
  readonly identity: SiteIdentity;
  readonly transfer: SiteTransfer<'chatgpt' | 'claude' | 'deepseek'>;
  /** Edits the site stores in its own shape; the shared commands handle the rest. */
  readonly overrides?: SiteFolderCommandsOptions['overrides'];
}

const ROUTE_FOLDER_SITES: Partial<Readonly<Record<FolderPlatform, RouteFolderSite>>> = {
  chatgpt: {
    identity: CHATGPT_IDENTITY,
    transfer: CHATGPT_TRANSFER,
    overrides: (applyOp) => ({
      // ChatGPT has always stored a cleared colour as 'default'; keep its records in that shape.
      setFolderColor: ({ folderId, color }) =>
        applyOp({ kind: 'setFolderColor', folderId, color: color ?? 'default' }),
    }),
  },
  claude: { identity: CLAUDE_IDENTITY, transfer: CLAUDE_TRANSFER },
  deepseek: { identity: DEEPSEEK_IDENTITY, transfer: DEEPSEEK_TRANSFER },
};

/** The route identity and folder file of `site`, or `null` for a site keyed otherwise. */
export function routeFolderSiteOf(site: FolderPlatform): RouteFolderSite | null {
  return ROUTE_FOLDER_SITES[site] ?? null;
}
