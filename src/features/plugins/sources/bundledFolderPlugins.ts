import { isPackagedOfficialPluginId } from '../sites/featureOwners';
import { bundledNativePluginIds } from './bundledNativePluginIds';

/**
 * The folders plugins of the catalog sites, from this build's actual callers.
 * Remote records must neither change how stored folders are reached nor delist them.
 * Gemini and AI Studio folders are packaged official ids already; leaving them out
 * keeps the document-start key guard off pages whose folders sit in the light DOM.
 */
export const FOLDERS_PLUGIN_IDS: ReadonlySet<string> = new Set(
  [...bundledNativePluginIds('folders')].filter((id) => !isPackagedOfficialPluginId(id)),
);
