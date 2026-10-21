/**
 * What a `PluginHost` is built from, and the defaults it falls back to outside
 * tests: the catalog-refresh message to the background and the top-frame check.
 */
import type { SiteRegistry } from '../sites/registry';
import type { EntitlementProvider, PluginSource } from '../types';
import type { LegacySettingsSource } from './legacySnapshotFeed';
import { PLUGIN_CATALOG_REFRESH_MESSAGE } from './messages';
import type { OfficialAdmission } from './officialAdmission';
import type { SurfaceSwitch } from './surfaceSwitch';

export interface PluginHostOptions {
  readonly url?: string;
  readonly registry?: SiteRegistry;
  readonly sources?: readonly PluginSource[];
  readonly entitlement?: EntitlementProvider;
  readonly doc?: Document;
  /** Injectable for tests; defaults to a runtime message to the background. */
  readonly requestCatalogRefresh?: (host: string) => void;
  /** Injectable for tests; defaults to `window.top === window`. */
  readonly isTopFrame?: boolean;
  /**
   * The site's master switch (AI Studio's "Voyager on AI Studio"); while it is
   * off only the shared visual effects may mount, preserving their early native
   * lifetime. Defaults to `surfaceSwitchForUrl(url)`.
   */
  readonly surfaceSwitch?: SurfaceSwitch | null;
  /**
   * When the content script lets each packaged official plugin start
   * (`officialAdmission.ts`). Defaults to `CLOSED_ADMISSION`: none ever does.
   */
  readonly admission?: OfficialAdmission;
  /** Injectable for tests; native surfaces read every binding, other pages only shared visual keys. */
  readonly legacySettings?: LegacySettingsSource;
}

/** Fire-and-forget: the background decides whether a network request is due. */
export function sendCatalogRefreshRequest(host: string): void {
  const runtime = (globalThis as { chrome?: typeof chrome }).chrome?.runtime;
  if (!runtime?.sendMessage) return;
  try {
    runtime.sendMessage({ type: PLUGIN_CATALOG_REFRESH_MESSAGE, payload: { host } }, () => {
      // Read lastError so a missing receiver never logs "Unchecked runtime.lastError".
      void runtime.lastError;
    });
  } catch {
    // Extension context gone; nothing to refresh.
  }
}

export function detectTopFrame(): boolean {
  try {
    return typeof window === 'undefined' || window.top === window;
  } catch {
    return false;
  }
}
