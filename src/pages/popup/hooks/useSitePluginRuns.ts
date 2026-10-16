import { useEffect, useMemo, useState } from 'react';

import browser from 'webextension-polyfill';

import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';
import { isPluginEnabled } from '@/features/plugins/storage/pluginDefaults';
import type { PluginStateMap } from '@/features/plugins/storage/pluginState';
import type { PluginManifest } from '@/features/plugins/types';

import { hasPluginSiteAccess } from '../utils/pluginEnablement';

export interface SitePluginRunsInput {
  readonly activeUrl: string;
  /** Plugins whose matches cover the active tab. */
  readonly manifests: readonly PluginManifest[];
  readonly pluginState: PluginStateMap;
}

/**
 * Whether a plugin that is on (by choice or by default) holds the active site's
 * host access, so Voyager's page script is registered there. Rechecked when the
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
    void Promise.all(enabled.map((plugin) => hasPluginSiteAccess(plugin, activeUrl))).then(
      (granted) => {
        if (active) setRuns(granted.some(Boolean));
      },
    );
    return () => {
      active = false;
    };
  }, [enabled, activeUrl, accessRevision]);

  return runs;
}
