import { customWebsitesIncludeHost } from '@/core/utils/customWebsites';

interface VisualEffectsAvailabilityInput {
  isPluginSite: boolean;
  activeSiteDomain: string;
  customWebsites: readonly string[];
  /** A plugin that is on holds this site's host access (see useSitePluginRuns). */
  sitePluginRuns: boolean;
  /** The tab's content script answered with the effect's plugin status. */
  pageRunsEffect: boolean;
}

/**
 * Native sites already ship with host access. A third-party site can show the
 * effect once Voyager's content script runs there: Prompt Manager covers it, or
 * a plugin that is on, by choice or by default, holds the site's host access.
 * Being on is not enough by itself: a builtin on by default may have no access,
 * and then no content script runs there to show the effect. A page whose
 * content script still runs keeps the row after its last plugin is turned off,
 * so an effect already falling there can still be switched off.
 */
export function canUseVisualEffects({
  isPluginSite,
  activeSiteDomain,
  customWebsites,
  sitePluginRuns,
  pageRunsEffect,
}: VisualEffectsAvailabilityInput): boolean {
  if (!isPluginSite) return true;
  if (!activeSiteDomain) return false;
  if (pageRunsEffect) return true;
  if (customWebsitesIncludeHost(customWebsites, activeSiteDomain)) return true;
  return sitePluginRuns;
}
