/**
 * The catalog sites whose folder entries are keyed by their route alone
 * (`<site>:conv:<id>` from the site's `conversationIdPattern`) on one
 * canonical origin, with the folder file each imports and exports. These are
 * what the `folders` primitive can run from a site's data; ChatGPT, which also
 * accepts a legacy host, keeps its own identity until it moves there too.
 */
import type { FolderPlatform } from '@/features/folder/platforms';

import { CLAUDE_IDENTITY, CLAUDE_TRANSFER } from './claudeIdentity';
import { DEEPSEEK_IDENTITY, DEEPSEEK_TRANSFER } from './deepseekIdentity';
import type { SiteIdentity } from './siteIdentity';
import type { SiteTransfer } from './siteTransfer';

export interface RouteFolderSite {
  readonly identity: SiteIdentity;
  readonly transfer: SiteTransfer<'claude' | 'deepseek'>;
}

const ROUTE_FOLDER_SITES: Partial<Readonly<Record<FolderPlatform, RouteFolderSite>>> = {
  claude: { identity: CLAUDE_IDENTITY, transfer: CLAUDE_TRANSFER },
  deepseek: { identity: DEEPSEEK_IDENTITY, transfer: DEEPSEEK_TRANSFER },
};

/** The route identity and folder file of `site`, or `null` for a site keyed otherwise. */
export function routeFolderSiteOf(site: FolderPlatform): RouteFolderSite | null {
  return ROUTE_FOLDER_SITES[site] ?? null;
}
