import { BUILTIN_PLUGINS } from '../builtin';
import type { PluginManifest, PluginSource } from '../types';

/**
 * Plugin source backed by bundled first-party native plugins. Declarative
 * official CSS+JSON plugins live in `BundledCatalogPluginSource`; remote
 * CSS+JSON plugins live in `MarketplacePluginSource`.
 */
export class BuiltinPluginSource implements PluginSource {
  readonly id = 'builtin';

  async list(): Promise<readonly PluginManifest[]> {
    return BUILTIN_PLUGINS;
  }
}
