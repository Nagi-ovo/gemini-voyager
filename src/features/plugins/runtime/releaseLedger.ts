/**
 * Releases of exclusive page resources that have not finished yet.
 *
 * Unmounting a plugin only starts its teardown: a scope still waiting on an
 * async startup (formula copy reading its format, say) settles later. Until
 * then the resource is not free, and a successor must not start a second copy
 * of the runtime beside the one still shutting down. The ledger belongs to the
 * `PluginHost`, not to an engine, so a release outlives the engine that began
 * it (adapter swap, stop→start).
 *
 * Each release carries its own token and clears only that token when it
 * settles. A release that never settles keeps its resources busy for good:
 * there is no timeout that would pretend the old runtime is gone.
 */
import type { ResourceId } from './resourceClaims';

export interface PendingRelease {
  readonly token: number;
  readonly pluginId: string;
  readonly resources: readonly ResourceId[];
}

export class ReleaseLedger {
  private nextToken = 0;
  private readonly pending = new Map<number, PendingRelease>();
  /** resource → waiter key → callback; one callback per key. */
  private readonly waiters = new Map<ResourceId, Map<string, () => void>>();

  /** Track `released` for the resources `pluginId` held; nothing to track without resources. */
  record(pluginId: string, resources: readonly ResourceId[], released: Promise<unknown>): void {
    if (resources.length === 0) return;
    const token = ++this.nextToken;
    this.pending.set(token, { token, pluginId, resources: [...resources] });
    const settle = (): void => {
      this.pending.delete(token);
      for (const resource of resources) this.notifyIfFree(resource);
    };
    released.then(settle, settle);
  }

  /** The oldest unfinished release of `resource`, or null when it is free. */
  releasing(resource: ResourceId): PendingRelease | null {
    for (const release of this.pending.values()) {
      if (release.resources.includes(resource)) return release;
    }
    return null;
  }

  /**
   * Call `callback` once `resource` has no unfinished release. A second
   * request under the same `key` while the first still waits is dropped.
   */
  whenFree(resource: ResourceId, key: string, callback: () => void): void {
    if (!this.releasing(resource)) {
      callback();
      return;
    }
    let byKey = this.waiters.get(resource);
    if (!byKey) {
      byKey = new Map();
      this.waiters.set(resource, byKey);
    }
    if (!byKey.has(key)) byKey.set(key, callback);
  }

  private notifyIfFree(resource: ResourceId): void {
    if (this.releasing(resource)) return;
    const byKey = this.waiters.get(resource);
    if (!byKey) return;
    this.waiters.delete(resource);
    for (const callback of byKey.values()) callback();
  }
}
