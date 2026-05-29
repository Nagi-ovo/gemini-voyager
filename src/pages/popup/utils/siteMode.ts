import {
  NATIVE_SITE_IDS,
  SiteRegistry,
  resolvePluginPlatformId,
} from '@/features/plugins/sites/registry';

function isHttpPageUrl(url: string): boolean {
  try {
    const protocol = new URL(url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Popup mode should show the full settings surface only on Voyager's native
 * sites. Any other normal web page is plugin-only, even before marketplace
 * manifests load, so Claude/ChatGPT/Grok and arbitrary third-party sites never
 * fall back to Gemini's full settings surface.
 */
export function isPluginPopupSite(
  activeUrl: string,
  siteScopedManifests: readonly unknown[],
): boolean {
  const adapter = SiteRegistry.createDefault().resolveByUrl(activeUrl);
  if (adapter && NATIVE_SITE_IDS.has(adapter.id)) return false;

  return (
    resolvePluginPlatformId(activeUrl) !== null ||
    siteScopedManifests.length > 0 ||
    isHttpPageUrl(activeUrl)
  );
}
