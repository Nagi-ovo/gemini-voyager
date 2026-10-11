/**
 * Compatibility names for Voyager's native surfaces, Gemini and AI Studio.
 * The policy itself lives in `hostPolicy.ts`, which splits the questions these
 * names bundled together (static injection, remote catalog, theme, primitives);
 * new code asks it directly.
 */
import type { PluginManifest } from '../types';
import {
  AISTUDIO_MATCHES,
  GEMINI_MATCHES,
  PACKAGED_HOST_POLICIES,
  allowsNativeHandler,
  allowsPluginThemeForSite,
  isStaticallyInjectedHost,
  packagedSiteForUrl,
} from './hostPolicy';

export { AISTUDIO_MATCHES, GEMINI_MATCHES };

export const NATIVE_SURFACE_MATCHES: readonly string[] = [...GEMINI_MATCHES, ...AISTUDIO_MATCHES];

/** True for gemini.google.com, business.gemini.google, aistudio.google.com/.cn. */
export function isNativeSurfaceHost(host: string): boolean {
  return isStaticallyInjectedHost(host);
}

/** True when `url` is on a native surface, judged by its actual hostname. */
export function isNativeSurfaceUrl(url: string): boolean {
  return packagedSiteForUrl(url) !== null;
}

/**
 * True when any native surface would refuse this manifest: its `theme`, or a
 * `native` op whose primitive a surface keeps for its own feature. Use
 * `hostPolicyRefusal` to judge one page.
 */
export function conflictsWithNativeSurface(
  manifest: Pick<PluginManifest, 'theme' | 'contributes'>,
): boolean {
  if (manifest.theme && !allowsPluginThemeForSite({ matches: NATIVE_SURFACE_MATCHES })) {
    return true;
  }
  return (manifest.contributes.domOps ?? []).some(
    (op) =>
      op.op === 'native' &&
      PACKAGED_HOST_POLICIES.some(({ siteId }) => !allowsNativeHandler(siteId, op.handler)),
  );
}
