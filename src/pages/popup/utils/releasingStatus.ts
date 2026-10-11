import type { PluginStatus } from '@/features/plugins/runtime/pluginStatus';

/**
 * True while the plugin only waits for a runtime to finish shutting down;
 * `blockedBy` naming the plugin itself means it waits for its own previous run.
 */
export function isReleasingStatus(status: PluginStatus): boolean {
  return (
    status.kind === 'blocked' &&
    (status.blockedReason === 'releasing' || status.blockedBy === status.id)
  );
}

/**
 * True for a block that ends by itself, with no change the popup could
 * observe: a release finishing, or the official plugin's legacy switch being
 * read (`pending`).
 */
export function isSelfClearingBlock(status: PluginStatus): boolean {
  return (
    isReleasingStatus(status) || (status.kind === 'blocked' && status.blockedReason === 'pending')
  );
}
