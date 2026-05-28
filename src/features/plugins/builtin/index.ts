import type { PluginManifest } from '../types';

/**
 * Built-in (bundled-in-the-extension) plugins.
 *
 * Intentionally EMPTY: plugins now ship from the remote marketplace
 * (`MarketplacePluginSource`) as data, not baked into the extension. This array
 * + `BuiltinPluginSource` remain as a seam in case a truly first-party,
 * offline-available plugin is ever needed.
 */
export const BUILTIN_PLUGINS: readonly PluginManifest[] = [];
