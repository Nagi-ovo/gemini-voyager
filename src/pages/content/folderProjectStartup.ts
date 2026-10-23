import { packagedPluginRunsHere } from '@/features/plugins/runtime/packagedFormFactor';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';

import { type FolderProjectFolders, startFolderProject } from './folderProject/index';

export interface FolderProjectStartOptions {
  /** The page's retirement boundary (`PageSteps.settle`): nothing starts on a retired page. */
  readonly settle?: <T>(work: Promise<T>) => Promise<T>;
  /** Test seam: whether Gemini's folders plugin runs on this device. */
  readonly runsHere?: () => Promise<boolean>;
}

/**
 * Starts Folder-as-Project over Gemini's folder session where Gemini's folders
 * plugin runs. It sits outside that plugin, so on a phone, where the plugin is
 * refused, it would still show its picker, add folder instructions to a send
 * and file the chat: it stays off with the plugin instead. The session keeps
 * the folder data, its migration and the popup's sync answers either way.
 */
export async function startFolderProjectWhereFoldersRun(
  folders: FolderProjectFolders,
  {
    settle = (work) => work,
    runsHere = () => packagedPluginRunsHere(OFFICIAL_PLUGIN_IDS.geminiFolders),
  }: FolderProjectStartOptions = {},
): Promise<void> {
  if (await settle(runsHere())) startFolderProject(folders);
}
