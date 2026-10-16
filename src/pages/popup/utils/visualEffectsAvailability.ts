import { customWebsitesIncludeHost } from '@/core/utils/customWebsites';

interface VisualEffectsAvailabilityInput {
  isPluginSite: boolean;
  activeSiteDomain: string;
  customWebsites: readonly string[];
  /** A plugin that is on holds this site's host access (see useSitePluginRuns). */
  sitePluginRuns: boolean;
}

/**
 * Native sites already ship with host access. A third-party site can show the
 * effect once Voyager's content script runs there: Prompt Manager covers it, or
 * a plugin that is on, by choice or by default, holds the site's host access.
 * Being on is not enough by itself: a builtin on by default may have no access,
 * and then no content script runs there to show the effect.
 */
export function canUseVisualEffects({
  isPluginSite,
  activeSiteDomain,
  customWebsites,
  sitePluginRuns,
}: VisualEffectsAvailabilityInput): boolean {
  if (!isPluginSite) return true;
  if (!activeSiteDomain) return false;
  if (customWebsitesIncludeHost(customWebsites, activeSiteDomain)) return true;
  return sitePluginRuns;
}
