/**
 * Platform-adaptive accent for Voyager UI (currently the Prompt Manager).
 *
 * On a small set of host platforms we re-skin Voyager's Gemini-green accent to
 * the host's brand color — a cosmetic adaptation, NOT a user-customizable theme.
 * This module only sets a `gv-platform-<id>` class on <body>; the actual color
 * overrides live in `public/contentStyle.css` (scoped under that class). Gemini /
 * AI Studio get no class and keep the green.
 *
 * Platform detection reuses the plugin SiteRegistry adapters so there's a single
 * source of truth for "which site am I on".
 */
import { SiteRegistry } from '@/features/plugins/sites/registry';

/** Platforms that get a re-skinned accent. Intentionally just these two for now. */
export const PLATFORM_THEME_SITE_IDS: ReadonlySet<string> = new Set(['claude', 'chatgpt']);

/** Returns the platform id to theme for this URL, or null if it shouldn't be themed. */
export function resolvePlatformThemeId(url: string): string | null {
  const adapter = SiteRegistry.createDefault().resolveByUrl(url);
  return adapter && PLATFORM_THEME_SITE_IDS.has(adapter.id) ? adapter.id : null;
}

/** Add the `gv-platform-<id>` class to <body> when on a themed platform. */
export function applyPlatformThemeClass(url: string = location.href, doc: Document = document): void {
  const id = resolvePlatformThemeId(url);
  if (!id) return;
  const className = `gv-platform-${id}`;
  const apply = (): void => {
    doc.body?.classList.add(className);
  };
  if (doc.body) apply();
  else doc.addEventListener('DOMContentLoaded', apply, { once: true });
}
