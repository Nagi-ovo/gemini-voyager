/**
 * The engine a `PluginHost` mounts into: health tracking for the features
 * that want it, the host's own statuses for primitives that inspect them, and
 * every runtime release recorded in the host's ledger.
 */
import { logger } from '@/core/services/LoggerService';

import { tracksPluginHealth } from '../sites/featureOwners';
import type { SiteAdapter } from '../types';
import { DeclarativeEngine } from './declarativeEngine';
import type { PrimitiveEnv } from './primitiveLifecycle';
import type { ReleaseLedger } from './releaseLedger';
import { claimedResources } from './resourceClaims';

export interface HostEngineOptions {
  readonly doc: Document;
  readonly adapter: SiteAdapter | null;
  /** The host's statuses and running manifests, read when a primitive asks. */
  readonly inspectPlugins: NonNullable<PrimitiveEnv['inspectPlugins']>;
  /** Kept by the host across engines, so a successor never starts beside a runtime still shutting down. */
  readonly releases: ReleaseLedger;
}

export function createHostEngine(options: HostEngineOptions): DeclarativeEngine {
  return new DeclarativeEngine({
    doc: options.doc,
    adapter: options.adapter,
    onHealthChange: (id, noEffect) => {
      logger.info('Plugin health changed', { id, noEffect });
    },
    shouldTrackHealth: (manifest) => tracksPluginHealth(manifest.id),
    inspectPlugins: options.inspectPlugins,
    // The mounted manifest decides what is released, so a plugin frozen
    // on its old version (D7) releases what that version claimed.
    onRelease: (manifest, released) => {
      options.releases.record(manifest.id, claimedResources(manifest), released);
    },
  });
}
