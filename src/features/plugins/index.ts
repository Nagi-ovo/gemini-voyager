/**
 * Plugin ecosystem — public entry point.
 *
 * `startPluginHost()` is the single integration call for the content script. It
 * is safe to call on any injected site: it self-detects the site adapter and
 * only mounts plugins that match the current URL, are enabled, and are entitled.
 * It is INERT by default because all builtin plugins ship disabled.
 */
import { logger } from '@/core/services/LoggerService';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { PluginHost } from './runtime/PluginHost';

export { PluginHost } from './runtime/PluginHost';
export type { PluginHostOptions } from './runtime/PluginHost';
export { DeclarativeEngine } from './runtime/declarativeEngine';
export { SiteRegistry, DEFAULT_ADAPTERS } from './sites/registry';
export { matchesUrl, matchesAnyPattern } from './sites/matchPattern';
export { validateManifest } from './manifest/validate';
export type { ManifestIssue } from './manifest/validate';
export { loadPluginState, setPluginEnabled, subscribePluginState } from './storage/pluginState';
export { BUILTIN_PLUGINS } from './builtin';
export * from './types';

let host: PluginHost | null = null;

export function startPluginHost(): () => void {
  if (host) return () => {};
  try {
    host = new PluginHost();
    void host.start();
  } catch (error) {
    if (!isExtensionContextInvalidatedError(error)) {
      logger.error('startPluginHost failed', { error: String(error) });
    }
  }
  return () => {
    host?.stop();
    host = null;
  };
}
