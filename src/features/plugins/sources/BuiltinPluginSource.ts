import { BUILTIN_PLUGINS } from '../builtin';
import type { PluginManifest, PluginSource } from '../types';

/**
 * Plugin source backed by the bundled first-party plugins. Future sources
 * (e.g. a git-based `MarketplacePluginSource` that fetches CSS+JSON data from a
 * remote registry) implement the same `PluginSource` interface and are added to
 * the host's `sources` array — the host code does not change.
 */
export class BuiltinPluginSource implements PluginSource {
  readonly id = 'builtin';

  async list(): Promise<readonly PluginManifest[]> {
    return BUILTIN_PLUGINS;
  }
}
