import { useEffect, useMemo, useState } from 'react';

import browser from 'webextension-polyfill';

import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { isPluginEnabled } from '@/features/plugins/storage/pluginDefaults';
import type { PluginStateMap } from '@/features/plugins/storage/pluginState';
import type { PluginManifest } from '@/features/plugins/types';

export interface SitePluginRunsInput {
  readonly activeUrl: string;
  /** Plugins whose matches cover the active tab. */
  readonly manifests: readonly PluginManifest[];
  readonly pluginState: PluginStateMap;
}

/**
 * Whether the main page holds host access. The background registers the page
 * script for a granted origin even when a plugin's companion frame origin is
 * not granted, so only the page's own origin decides. Unknown answers count as
 * granted, as in hasPluginSiteAccess.
 */
async function hasPageOriginAccess(activeUrl: string): Promise<boolean> {
  let origin: string;
  try {
    const url = new URL(activeUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    origin = `${url.protocol}//${url.hostname}/*`;
  } catch {
    return false;
  }
  if (!browser.permissions?.contains) return true;
  try {
    return await browser.permissions.contains({ origins: [origin] });
  } catch {
    return true;
  }
}

/**
 * Whether a plugin that is on (by choice or by default) covers the active site
 * and the page's origin is granted, so Voyager's page script is registered there. Rechecked when the
 * plugins' state changes and when access is granted or removed, so a grant made
 * from the plugin list shows its effect without reopening the popup.
 */
export function useSitePluginRuns({
  activeUrl,
  manifests,
  pluginState,
}: SitePluginRunsInput): boolean {
  // Visual effects rides on another plugin's page script; its own row never registers one.
  const enabled = useMemo(
    () =>
      manifests.filter(
        (plugin) =>
          plugin.id !== OFFICIAL_PLUGIN_IDS.visualEffects &&
          isPluginEnabled(pluginState, plugin.id),
      ),
    [manifests, pluginState],
  );
  const [runs, setRuns] = useState(false);
  const [accessRevision, setAccessRevision] = useState(0);

  useEffect(() => {
    const permissions = browser.permissions;
    const bump = () => setAccessRevision((revision) => revision + 1);
    permissions?.onAdded?.addListener(bump);
    permissions?.onRemoved?.addListener(bump);
    return () => {
      permissions?.onAdded?.removeListener(bump);
      permissions?.onRemoved?.removeListener(bump);
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (enabled.length === 0) {
      setRuns(false);
      return;
    }
    void hasPageOriginAccess(activeUrl).then((granted) => {
      if (active) setRuns(granted);
    });
    return () => {
      active = false;
    };
  }, [enabled.length, activeUrl, accessRevision]);

  return runs;
}
