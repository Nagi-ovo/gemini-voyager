/**
 * ChatGPT's folders as the `folders` primitive builds them: from the `folders`
 * section of ChatGPT's bundled `site.json` and ChatGPT's row in the core folder
 * table (`siteData.ts`), run by the primitive's runtime (`activate.ts`). The
 * suites here drive that runtime on a scope of their own; the plugin as the page
 * mounts it, through `PluginHost`, is `../chatgptHarness.ts`.
 */
import type { FolderCommands } from '@/features/folder/commands/folderCommands';
import { requireBundledSiteAdapter } from '@/features/plugins/catalog/sites';
import type { PluginScope } from '@/features/plugins/runtime/pluginScope';
import type { PluginSettings, SiteAdapter } from '@/features/plugins/types';
import type { SiteFolderNotify } from '@/pages/content/folder/SiteFolderStore';

import { startSiteFolders } from '../../activate';
import { siteFoldersFromData } from '../../siteData';
import type { SiteFoldersAdapter, SiteFoldersStore } from '../../types';

export const CHATGPT_FOLDERS_GUIDE_ID = 'chatgpt-folders-sidebar-intro-v1';
/** `document.dispatchEvent(new Event(...))` shows the guide again, seen or not. */
export const CHATGPT_FOLDERS_GUIDE_DEBUG_EVENT = 'gv:debug:chatgptFoldersCoachmark';
export const FILED_ROW_ATTRIBUTE = 'data-gv-chatgpt-filed';

/** ChatGPT's folders from its bundled site data, as a page on chatgpt.com builds them. */
export function chatgptSite(): SiteFoldersAdapter {
  const site = siteFoldersFromData(requireBundledSiteAdapter('chatgpt'), 'https://chatgpt.com/');
  if (!site) throw new Error("ChatGPT's site.json carries no usable folders section");
  return site;
}

/**
 * Starts ChatGPT's folders on `scope` and settles once they started. Without
 * `adapter` no sends are tracked, so the header has no Activity view.
 */
export function activateChatGptFolders(
  scope: PluginScope,
  settings: PluginSettings = {},
  adapter: SiteAdapter | null = null,
): Promise<void> {
  return startSiteFolders(scope, chatgptSite(), settings, adapter).started;
}

const COMMANDS = new WeakMap<SiteFoldersStore, FolderCommands>();

/** ChatGPT's folder store as the runtime creates it; `commandsOf` gives the commands that edit it. */
export function createChatGptStore(notify: SiteFolderNotify = () => {}): SiteFoldersStore {
  const { store, commands } = chatgptSite().createFolders(notify);
  COMMANDS.set(store, commands);
  return store;
}

/** The commands created with `store`. */
export function commandsOf(store: SiteFoldersStore): FolderCommands {
  const commands = COMMANDS.get(store);
  if (!commands) throw new Error('not a store from createChatGptStore');
  return commands;
}
