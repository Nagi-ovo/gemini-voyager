import { siteFoldersManifest } from '../siteFolders/manifest';

export const CLAUDE_FOLDERS_PLUGIN_ID = 'voyager.claude-folders';

/** Off by default (not in `pluginDefaults.ts`), unlike ChatGPT's. */
export const CLAUDE_FOLDERS_MANIFEST = siteFoldersManifest(CLAUDE_FOLDERS_PLUGIN_ID, 'Claude', [
  'https://claude.ai/*',
]);
