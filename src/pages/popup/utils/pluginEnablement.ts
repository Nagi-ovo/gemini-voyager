import browser from 'webextension-polyfill';

import {
  isFirefox,
  supportsDynamicContentScriptRegistration,
  supportsOptionalHostPermissions,
} from '@/core/utils/browser';
import { isLocalPluginId } from '@/features/plugins/local/localPluginId';
import { enableLocalPluginIfUnchanged } from '@/features/plugins/local/localPluginStore';
import { PLUGIN_CONTENT_SCRIPT_SYNC_MESSAGE } from '@/features/plugins/runtime/messages';
import { pluginToOriginPatternsForActiveUrl } from '@/features/plugins/runtime/siteRegistration';
import { setPluginEnabled } from '@/features/plugins/storage/pluginState';
import type { PluginManifest } from '@/features/plugins/types';

/**
 * Ask the background service to reconcile dynamic plugin content scripts after
 * an optional host permission grant. This is best-effort because Chrome may
 * close the popup while displaying its permission prompt; the background
 * permissions listener remains the fallback in that case. Returns whether the
 * background confirmed that reconciliation completed.
 */
export async function requestPluginContentScriptSync(): Promise<boolean> {
  try {
    const response = (await browser.runtime.sendMessage({
      type: PLUGIN_CONTENT_SCRIPT_SYNC_MESSAGE,
    })) as { ok?: unknown } | null;
    return response?.ok === true;
  } catch {
    // Chrome may close the popup while showing the optional-host prompt. The
    // background permissions.onAdded listener remains the fallback in that case.
    return false;
  }
}

/** Whether this browser can grant and inject the optional host access plugins need. */
export function canGrantPluginSiteAccess(): boolean {
  return (
    !!browser.permissions?.request &&
    supportsOptionalHostPermissions() &&
    supportsDynamicContentScriptRegistration()
  );
}

/**
 * Whether the plugin already holds the optional host access it needs on the
 * active site. An enabled plugin can still lack it: Chrome closes the popup
 * while its permission prompt is open, after the enable was persisted. Unknown
 * answers count as granted so a check failure never hides a working plugin.
 */
export async function hasPluginSiteAccess(
  plugin: PluginManifest,
  activeUrl: string | undefined,
): Promise<boolean> {
  const origins = pluginToOriginPatternsForActiveUrl(plugin, activeUrl);
  if (!origins.length || !browser.permissions?.contains) return true;
  try {
    return await browser.permissions.contains({ origins });
  } catch {
    return true;
  }
}

/**
 * `enabled` / `disabled`: the requested state was saved. `denied`: the user
 * refused (or the browser failed) the host-access prompt. `unsupported`: this
 * browser cannot grant or inject the access the plugin needs on this site.
 * `changed`: a local plugin's content changed (re-imported elsewhere) after the
 * user saw it, so it stays off until they review the new content.
 * `write_failed`: a local plugin's enable could not be stored; it stays off.
 */
export type PluginToggleOutcome =
  | 'enabled'
  | 'disabled'
  | 'denied'
  | 'unsupported'
  | 'changed'
  | 'write_failed';

/**
 * Persist the enable state. A local plugin is switched on only while its
 * stored content is still the manifest the user saw; otherwise this returns
 * why it stayed off.
 */
async function persistEnabled(
  plugin: PluginManifest,
  enabled: boolean,
): Promise<'saved' | 'changed' | 'write_failed'> {
  if (enabled && isLocalPluginId(plugin.id)) {
    const result = await enableLocalPluginIfUnchanged(plugin);
    return result === 'enabled' ? 'saved' : result;
  }
  await setPluginEnabled(plugin.id, enabled);
  return 'saved';
}

/**
 * Turn a plugin on or off from a popup gesture, requesting the optional host
 * access it needs on the active site first. `onEnabledChange` mirrors every
 * persisted state change into the caller's UI as it happens, including the
 * optimistic enable written before Chrome's permission prompt.
 */
export async function setPluginEnabledWithSiteAccess(
  plugin: PluginManifest,
  next: boolean,
  activeUrl: string | undefined,
  onEnabledChange: (enabled: boolean) => void,
): Promise<PluginToggleOutcome> {
  if (next) {
    const origins = pluginToOriginPatternsForActiveUrl(plugin, activeUrl);
    if (origins.length > 0) {
      // This plugin needs host access on a site Voyager reaches only via dynamic
      // content-script registration. If the platform can't grant or inject that
      // (an old Safari/build without the required APIs, or Firefox < 128 which
      // ignores optional_host_permissions), enabling would be a silent no-op —
      // so refuse and explain, instead of a misleading toggle.
      if (!canGrantPluginSiteAccess()) return 'unsupported';
      try {
        // Firefox requires permissions.request to be the first await in the
        // user gesture, so skip the contains() pre-check there.
        if (!isFirefox() && browser.permissions.contains) {
          const alreadyGranted = await browser.permissions.contains({ origins });
          if (!alreadyGranted) {
            // Chrome closes extension popups while showing an optional-host
            // prompt. Persist the user's intent BEFORE opening it so a
            // successful grant can be completed by the background even if
            // the popup is closed before permissions.request resolves.
            onEnabledChange(true);
            const persisted = await persistEnabled(plugin, true);
            if (persisted !== 'saved') {
              onEnabledChange(false);
              return persisted;
            }
            const granted = await browser.permissions.request({ origins });
            if (!granted) {
              onEnabledChange(false);
              await setPluginEnabled(plugin.id, false);
              return 'denied';
            }
            // Edge can resolve the request without reliably delivering the
            // permissions.onAdded event that normally performs registration.
            // Reconcile explicitly while retaining onAdded as Chrome's
            // popup-close fallback.
            await requestPluginContentScriptSync();
            return 'enabled';
          }
        } else if (!(await browser.permissions.request({ origins }))) {
          return 'denied';
        }
      } catch {
        onEnabledChange(false);
        await setPluginEnabled(plugin.id, false);
        return 'denied';
      }
    }
  }
  onEnabledChange(next);
  const persisted = await persistEnabled(plugin, next);
  if (persisted !== 'saved') {
    onEnabledChange(false);
    return persisted;
  }
  return next ? 'enabled' : 'disabled';
}
