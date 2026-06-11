/**
 * Optional "notifications" permission helpers.
 *
 * The permission lives in manifest `optional_permissions`, not `permissions`:
 * shipping it as a new REQUIRED permission in v1.4.7 made Firefox silently
 * hold automatic updates until users approved the change (see #753 fallout),
 * stranding them on old versions. Keeping it optional means future updates
 * never re-trigger that gate, and installs that granted it while it was
 * required keep the grant after migration.
 */
import browser from 'webextension-polyfill';

import { isFirefox, isSafari } from './browser';

export async function hasNotificationsPermission(): Promise<boolean> {
  try {
    if (!browser.permissions?.contains) return false;
    return await browser.permissions.contains({ permissions: ['notifications'] });
  } catch {
    return false;
  }
}

/**
 * Ensure the notifications permission is granted, requesting it if needed.
 * MUST be called from a user gesture (e.g. the popup toggle click): Firefox
 * requires `permissions.request` to be the first await in the gesture, so
 * the `contains` pre-check is skipped there.
 *
 * Returns `true` on platforms without a usable permission prompt (Safari,
 * builds without `permissions.request`) so the feature's existing
 * platform-specific messaging stays the single source of truth.
 */
export async function ensureNotificationsPermission(): Promise<boolean> {
  if (isSafari()) return true;
  if (!browser.permissions?.request) return true;
  try {
    if (!isFirefox() && browser.permissions.contains) {
      if (await browser.permissions.contains({ permissions: ['notifications'] })) {
        return true;
      }
    }
    return await browser.permissions.request({ permissions: ['notifications'] });
  } catch {
    return false;
  }
}
