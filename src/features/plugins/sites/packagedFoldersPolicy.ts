/**
 * Folders on Gemini and AI Studio are Voyager's own: their data session,
 * migrations, sync answers and Folder-as-Project outlive any plugin, and only
 * the official plugin is admitted at the native start point. In v1 a local
 * plugin may call `folders` on catalog sites only. Without this rule an owner
 * entry that opens `folders` to its official plugin (`featureOwners.ts`) would
 * open it to every local plugin on the site too (`hostPolicy.ts`), and one
 * could mount a second folders runtime before admission.
 *
 * Checked on import by pattern and again on the page by its real host, since
 * stored plugins are re-read with the host policy deferred.
 */
import { isLocalPluginId } from '../local/localPluginId';
import type { ManifestIssue } from '../manifest/validate';
import type { PluginManifest } from '../types';
import type { PackagedSiteId } from './featureOwners';

export const FOLDERS_HANDLER = 'folders';

/** Import policy for a local manifest reaching `sites` (the packaged sites its patterns reach). */
export function packagedFoldersPolicyIssues(
  manifest: Pick<PluginManifest, 'contributes'>,
  sites: readonly PackagedSiteId[],
): ManifestIssue[] {
  if (sites.length === 0) return [];
  const issues: ManifestIssue[] = [];
  (manifest.contributes.domOps ?? []).forEach((op, index) => {
    if (op.op !== 'native' || op.handler !== FOLDERS_HANDLER) return;
    issues.push({
      path: `contributes.domOps[${index}]`,
      message:
        'Gemini and AI Studio folders are Voyager’s own: a local plugin may call `folders` only on Claude, ChatGPT or DeepSeek',
    });
  });
  return issues;
}

/** Whether the page refuses this plugin's `handler` op: a local `folders` op on a packaged site. */
export function refusesLocalFolders(
  pluginId: string | undefined,
  handler: string,
  site: PackagedSiteId | null,
): boolean {
  return (
    site !== null &&
    handler === FOLDERS_HANDLER &&
    pluginId !== undefined &&
    isLocalPluginId(pluginId)
  );
}
