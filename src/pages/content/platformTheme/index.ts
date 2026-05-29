/**
 * Platform-adaptive brand accent for Voyager's OWN UI (Prompt Manager, formula
 * toast, popup) when it runs on a third-party host platform.
 *
 * The accent COLOUR is now data, not hard-coded CSS. It resolves to:
 *   1. a URL-matching, caller-active plugin that declares `theme.brand`, else
 *   2. the URL-matching SiteAdapter's built-in `brandColor` (claude / chatgpt),
 *   3. else null → no theming, Voyager keeps its native green (CSS fallback).
 *
 * `applyBrandTheme` injects the resolved colour into the `--gv-pm-brand` custom
 * property on the document root (<html>) and toggles a `gv-platform-themed`
 * class there. Putting it on the root (not <body>) means the variable is
 * inherited by Voyager UI no matter where it mounts (body subtree, html-level
 * portal, even across a shadow boundary). `contentStyle.css` derives
 * hover/soft/fg from that single variable via `color-mix`, and all Voyager UI
 * reads `var(--gv-pm-brand, <green>)` — so one variable repaints everything, and
 * Gemini (never themed) stays byte-for-byte unchanged.
 *
 * Platform detection reuses the plugin SiteRegistry adapters so there's a single
 * source of truth for "which site am I on".
 */
import { matchesAnyPattern } from '@/features/plugins/sites/matchPattern';
import { SiteRegistry } from '@/features/plugins/sites/registry';
import { loadCachedCatalog, subscribeCatalog } from '@/features/plugins/storage/catalogCache';
import { loadPluginState, subscribePluginState } from '@/features/plugins/storage/pluginState';
import type { PluginManifest } from '@/features/plugins/types';

/** Body class flag: Voyager UI on this page uses a platform brand accent. */
export const PLATFORM_THEME_CLASS = 'gv-platform-themed';
const BRAND_VAR = '--gv-pm-brand';

/**
 * Resolve the brand accent (hex) for Voyager UI on `url`. `manifests` should be
 * the plugins the caller treats as active (enabled + relevant); the first one
 * matching the URL that declares `theme.brand` wins, otherwise the matching
 * `SiteAdapter.brandColor`, otherwise null (keep Voyager green).
 */
export function resolveBrandColor(
  url: string = location.href,
  manifests: readonly PluginManifest[] = [],
): string | null {
  const fromPlugin = manifests.find((m) => m.theme?.brand && matchesAnyPattern(url, m.matches));
  if (fromPlugin?.theme?.brand) return fromPlugin.theme.brand;
  const adapter = SiteRegistry.createDefault().resolveByUrl(url);
  return adapter?.brandColor ?? null;
}

/**
 * Inject (or clear) the platform brand accent on the document root (<html>).
 * Adds the `gv-platform-themed` class + `--gv-pm-brand` when a colour resolves;
 * removes both when none does, so un-themed sites fall back to Voyager green.
 * The root element always exists, so no DOMContentLoaded wait is needed.
 * Idempotent.
 */
export function applyBrandTheme(
  url: string = location.href,
  manifests: readonly PluginManifest[] = [],
  doc: Document = document,
): void {
  const color = resolveBrandColor(url, manifests);
  const root = doc.documentElement;
  if (!root) return;
  if (color) {
    root.classList.add(PLATFORM_THEME_CLASS);
    root.style.setProperty(BRAND_VAR, color);
  } else {
    root.classList.remove(PLATFORM_THEME_CLASS);
    root.style.removeProperty(BRAND_VAR);
  }
}

/**
 * Start live platform theming for the content script: apply the adapter's
 * built-in accent immediately, then re-resolve whenever the plugin catalog or
 * enable-state changes so an enabled plugin's declared `theme.brand` can take
 * over (or step back when disabled). Returns a cleanup that detaches the
 * subscriptions. Used by the content entry; `applyBrandTheme` stays the pure,
 * one-shot primitive for tests and the immediate first paint.
 */
export function startBrandTheme(url: string = location.href, doc: Document = document): () => void {
  applyBrandTheme(url, [], doc); // immediate: adapter built-in colour
  let cancelled = false;
  const recompute = async (): Promise<void> => {
    const [catalog, state] = await Promise.all([loadCachedCatalog(), loadPluginState()]);
    if (cancelled) return;
    const active = (catalog?.manifests ?? []).filter(
      (m) => m.theme?.brand && state[m.id]?.enabled,
    );
    applyBrandTheme(url, active, doc);
  };
  void recompute();
  const unState = subscribePluginState(() => void recompute());
  const unCatalog = subscribeCatalog(() => void recompute());
  return () => {
    cancelled = true;
    unState();
    unCatalog();
  };
}
