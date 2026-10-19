import { siteFoldersManifest } from '../siteFolders/manifest';

export const DEEPSEEK_FOLDERS_PLUGIN_ID = 'voyager.deepseek-folders';

/** Off by default (not in `pluginDefaults.ts`), unlike ChatGPT's. */
export const DEEPSEEK_FOLDERS_MANIFEST = siteFoldersManifest(
  DEEPSEEK_FOLDERS_PLUGIN_ID,
  'DeepSeek',
  ['https://chat.deepseek.com/*'],
);
