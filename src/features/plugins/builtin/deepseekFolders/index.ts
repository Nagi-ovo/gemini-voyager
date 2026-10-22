/**
 * DeepSeek folders on the shared folder core: a folder section above the history in
 * DeepSeek's sidebar (introduced once by a guide), the shared floating panel,
 * and a row dragged onto a folder (its row menu takes no entry; see
 * `deepseekSidebarDom.ts`). DeepSeek's half is `DEEPSEEK_SITE_FOLDERS`.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';
import { activateSiteFolders } from '@/features/plugins/verbs/folders/activate';

import { DEEPSEEK_SITE_FOLDERS } from './deepseekSiteFolders';

export function activateDeepSeekFolders(
  scope: PluginScope,
  settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): Promise<void> {
  return activateSiteFolders(scope, DEEPSEEK_SITE_FOLDERS, settings, adapter);
}
