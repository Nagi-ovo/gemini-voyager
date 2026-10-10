/**
 * Per-surface master switches that turn Voyager off on a whole site, plugins
 * included. Only AI Studio has one today (`GV_AISTUDIO_ENABLED`, a popup
 * toggle stored in `chrome.storage.sync`, on by default); Gemini has no
 * equivalent and plugin platforms are governed by each plugin's own toggle.
 *
 * `PluginHost` mounts nothing while the switch is off and follows it live:
 * turning it off unmounts every plugin on the page, turning it on mounts the
 * enabled ones again.
 */
import { StorageKeys } from '@/core/types/common';

import { AISTUDIO_MATCHES } from '../sites/nativeSurfaces';

export interface SurfaceSwitch {
  /** Current value; resolves `true` when unset or unreadable (the default). */
  read(): Promise<boolean>;
  /** Called with the new value whenever the switch changes. */
  subscribe(callback: (enabled: boolean) => void): () => void;
}

const AISTUDIO_HOSTS = new Set(
  AISTUDIO_MATCHES.map((pattern) => pattern.replace(/^https:\/\//, '').replace(/\/.*$/, '')),
);

function syncSwitch(key: string): SurfaceSwitch {
  return {
    async read() {
      try {
        const result = await chrome.storage?.sync?.get({ [key]: true });
        return result?.[key] !== false;
      } catch {
        return true; // unreadable (e.g. context gone): keep the default
      }
    },
    subscribe(callback) {
      const onChanged = chrome.storage?.onChanged;
      if (!onChanged) return () => {};
      const listener = (
        changes: Record<string, chrome.storage.StorageChange>,
        area: string,
      ): void => {
        if (area === 'sync' && changes[key]) callback(changes[key].newValue !== false);
      };
      onChanged.addListener(listener);
      return () => {
        try {
          onChanged.removeListener(listener);
        } catch {
          // context may be gone
        }
      };
    },
  };
}

/** The master switch that governs `url`, or null when the site has none. */
export function surfaceSwitchForUrl(url: string): SurfaceSwitch | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  return AISTUDIO_HOSTS.has(host) ? syncSwitch(StorageKeys.GV_AISTUDIO_ENABLED) : null;
}
