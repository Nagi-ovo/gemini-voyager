import { siteFoldersManifest } from '../siteFolders/manifest';

export const CHATGPT_FOLDERS_PLUGIN_ID = 'voyager.chatgpt-folders';

/** On by default (`pluginDefaults.ts`). */
export const CHATGPT_FOLDERS_MANIFEST = siteFoldersManifest(CHATGPT_FOLDERS_PLUGIN_ID, 'ChatGPT', [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
]);
