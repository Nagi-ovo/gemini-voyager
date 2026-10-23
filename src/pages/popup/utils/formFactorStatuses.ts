import type { FormFactor } from '@/core/types/formFactor';
import { type PluginStatus, runsOnFormFactor } from '@/features/plugins/runtime/pluginStatus';
import type { PluginManifest } from '@/features/plugins/types';

/**
 * The page's statuses, with `needs-form-factor` for every listed plugin that
 * does not run on `formFactor`. The page reports the same, but on Firefox for
 * Android the popup is its own tab and the page may not answer at all.
 * Unknown form factor (still reading): the page's statuses as they are.
 */
export function withFormFactorStatuses(
  statuses: readonly PluginStatus[],
  manifests: readonly PluginManifest[],
  formFactor: FormFactor | null,
): readonly PluginStatus[] {
  if (!formFactor) return statuses;
  const refused = new Map<string, PluginStatus>();
  for (const manifest of manifests) {
    if (runsOnFormFactor(manifest, formFactor)) continue;
    refused.set(manifest.id, {
      id: manifest.id,
      version: manifest.version,
      kind: 'needs-form-factor',
      formFactor,
    });
  }
  if (refused.size === 0) return statuses;
  const kept = statuses.filter((status) => !refused.has(status.id));
  return [...kept, ...refused.values()];
}
