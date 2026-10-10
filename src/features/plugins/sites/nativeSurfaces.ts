/**
 * Voyager's native surfaces, Gemini and AI Studio, as data.
 *
 * Their content script is declared statically in the extension manifest, with
 * matching `host_permissions`, so they never need a dynamic registration or an
 * optional host grant. They are also outside the remote plugin catalog: no
 * catalog file is ever looked up for them (the zero-request promise for Gemini).
 * Only user-imported local plugins may target them.
 *
 * Keep these in step with `manifest.json`'s first `content_scripts` entry.
 */
import type { PluginManifest } from '../types';

export const GEMINI_MATCHES: readonly string[] = [
  'https://gemini.google.com/*',
  'https://business.gemini.google/*',
];

export const AISTUDIO_MATCHES: readonly string[] = [
  'https://aistudio.google.com/*',
  'https://aistudio.google.cn/*',
];

export const NATIVE_SURFACE_MATCHES: readonly string[] = [...GEMINI_MATCHES, ...AISTUDIO_MATCHES];

const NATIVE_SURFACE_HOSTS: ReadonlySet<string> = new Set(
  NATIVE_SURFACE_MATCHES.map((pattern) => pattern.replace(/^https:\/\//, '').replace(/\/.*$/, '')),
);

/** True for gemini.google.com, business.gemini.google, aistudio.google.com/.cn. */
export function isNativeSurfaceHost(host: string): boolean {
  return NATIVE_SURFACE_HOSTS.has(host.trim().toLowerCase());
}

/** True when `url` is on a native surface, judged by its actual hostname. */
export function isNativeSurfaceUrl(url: string): boolean {
  try {
    return isNativeSurfaceHost(new URL(url).hostname);
  } catch {
    return false;
  }
}

/**
 * What no plugin may bring to a native surface: a `theme` (Gemini and AI Studio
 * keep Voyager's own accent) or a `native` op (every shipped primitive already
 * runs there as a native Voyager feature). `validateLocalManifest` rejects these
 * at import by pattern; the runtime refuses them again by the page's real host.
 */
export function conflictsWithNativeSurface(
  manifest: Pick<PluginManifest, 'theme' | 'contributes'>,
): boolean {
  if (manifest.theme) return true;
  return (manifest.contributes.domOps ?? []).some((op) => op.op === 'native');
}
