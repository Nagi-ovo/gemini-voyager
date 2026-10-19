/**
 * ChatGPT folders on the shared folder core: a folder section in ChatGPT's
 * sidebar (introduced once by a guide), the shared floating panel, and "Move to
 * folder" in a row's menu, or a row dragged onto a folder. The store is the
 * shared site folder store with ChatGPT's own bucket. The site-agnostic half
 * lives in `../siteFolders`; ChatGPT's half is `CHATGPT_SITE_FOLDERS`.
 */
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';

import { activateSiteFolders } from '../siteFolders/activate';
import { CHATGPT_SITE_FOLDERS } from './chatgptSiteFolders';

export function activateChatGptFolders(
  scope: PluginScope,
  settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): Promise<void> {
  return activateSiteFolders(scope, CHATGPT_SITE_FOLDERS, settings, adapter);
}
