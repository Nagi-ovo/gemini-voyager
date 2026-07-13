import { customWebsitesIncludeHost } from '@/core/utils/customWebsites';
import type { PluginStateMap } from '@/features/plugins/storage/pluginState';

interface VisualEffectsAvailabilityInput {
  isPluginSite: boolean;
  activeSiteDomain: string;
  customWebsites: readonly string[];
  sitePluginIds: readonly string[];
  pluginState: PluginStateMap;
}

/**
 * Native sites already ship with host access. Third-party sites become eligible
 * only after Prompt Manager or at least one matching plugin has been enabled,
 * which mirrors the two paths that dynamically inject Voyager's content script.
 */
export function canUseVisualEffects({
  isPluginSite,
  activeSiteDomain,
  customWebsites,
  sitePluginIds,
  pluginState,
}: VisualEffectsAvailabilityInput): boolean {
  if (!isPluginSite) return true;
  if (!activeSiteDomain) return false;
  if (customWebsitesIncludeHost(customWebsites, activeSiteDomain)) return true;
  return sitePluginIds.some((id) => pluginState[id]?.enabled === true);
}
