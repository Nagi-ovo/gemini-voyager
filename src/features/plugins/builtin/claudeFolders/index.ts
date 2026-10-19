/**
 * Claude folders on the shared folder core: a folder section above Recents in
 * Claude's sidebar (introduced once by a guide), the shared floating panel,
 * and "Move to folder" in a row's menu, or a row dragged onto a folder.
 * Claude's half is `CLAUDE_SITE_FOLDERS`; the rest lives in `../siteFolders`.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';

import { activateSiteFolders } from '../siteFolders/activate';
import { CLAUDE_SITE_FOLDERS } from './claudeSiteFolders';

export function activateClaudeFolders(
  scope: PluginScope,
  settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): Promise<void> {
  return activateSiteFolders(scope, CLAUDE_SITE_FOLDERS, settings, adapter);
}
