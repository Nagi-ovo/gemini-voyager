import { resolvePluginPlatformId } from '@/features/plugins/sites/registry';

/**
 * Popup mode should follow the current host adapter first. Marketplace manifests
 * load asynchronously and can fail offline, but Claude/ChatGPT/Grok must still
 * stay in the plugin-focused popup instead of briefly falling back to Gemini's
 * full settings surface.
 */
export function isPluginPopupSite(
  activeUrl: string,
  siteScopedManifests: readonly unknown[],
): boolean {
  return resolvePluginPlatformId(activeUrl) !== null || siteScopedManifests.length > 0;
}
