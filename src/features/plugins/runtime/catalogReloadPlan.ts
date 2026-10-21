/**
 * What a catalog reload changes on a page that keeps its site adapter
 * (`PluginHost.reloadCatalog` acts on it).
 *
 * Plan D7: a mounted plugin whose contributions run first-party code (a
 * `native` op) keeps the version it started with; its update is recorded
 * as pending and applies on the next full page load. Declarative plugins
 * remount immediately when their version or contributions changed; a
 * re-listed plugin that did not change keeps running untouched, so an
 * unrelated import or catalog write never restarts it. A user-imported
 * (`local.*`) plugin follows the same rules.
 */
import { type PluginManifest, hasNativeOps } from '../types';

/** Plugins kept on their mounted version until a reload, by id. */
export type FrozenVersions = Map<string, { mounted: PluginManifest; pendingVersion: string }>;

export interface ReloadListing {
  /** The listing before the reload, by id. */
  readonly previous: ReadonlyMap<string, PluginManifest>;
  readonly next: readonly PluginManifest[];
  readonly isActive: (id: string) => boolean;
}

/** Record (or clear) the pending version of every running primitive-backed plugin. */
export function freezeUpdatedPrimitives(
  frozen: FrozenVersions,
  listing: ReloadListing,
  targetsPage: (manifest: PluginManifest) => boolean,
): void {
  const { previous, next: manifests, isActive } = listing;
  for (const next of manifests) {
    const mounted = frozen.get(next.id)?.mounted ?? previous.get(next.id);
    if (!mounted || !isActive(next.id)) continue;
    // An update that drops this page from its `matches` is a removal for
    // this page, never a pending version: unfreeze so the unmount below
    // sees it and reconcile() cannot revive it from the frozen manifest.
    if (!targetsPage(next)) {
      frozen.delete(next.id);
      continue;
    }
    if (!hasNativeOps(mounted) && !hasNativeOps(next)) continue;
    if (mounted.version === next.version && sameContributions(mounted, next)) {
      frozen.delete(next.id);
      continue;
    }
    frozen.set(next.id, { mounted, pendingVersion: next.version });
  }
  // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot: the loop body mutates the collection
  for (const id of [...frozen.keys()]) {
    if (!manifests.some((manifest) => manifest.id === id)) frozen.delete(id);
  }
}

/** Running plugins to unmount now, in order: delisted ones, then changed unfrozen ones. */
export function staleMountedIds(listing: ReloadListing, frozen: FrozenVersions): string[] {
  const { previous, next: manifests, isActive } = listing;
  const stale: string[] = [];
  // A plugin the refreshed catalog no longer lists (an authoritative
  // delisting is the kill switch) leaves the page now: reconcile() only
  // walks the new list, so it would otherwise run until teardown.
  const listed = new Set(manifests.map((manifest) => manifest.id));
  for (const id of previous.keys()) {
    if (!listed.has(id) && isActive(id)) stale.push(id);
  }
  // Remount only what changed: an unrelated import or a catalog write that
  // re-lists the same plugin must not restart a running one (a primitive
  // would lose its state, e.g. the turn navigator or Vim mode).
  for (const manifest of manifests) {
    if (frozen.has(manifest.id) || !isActive(manifest.id)) continue;
    const mounted = previous.get(manifest.id);
    if (mounted && isSameMountedPlugin(mounted, manifest)) continue;
    stale.push(manifest.id);
  }
  return stale;
}

function sameContributions(a: PluginManifest, b: PluginManifest): boolean {
  return JSON.stringify(a.contributes) === JSON.stringify(b.contributes);
}

/** A re-listed plugin the engine can keep running as mounted. */
function isSameMountedPlugin(mounted: PluginManifest, next: PluginManifest): boolean {
  return mounted.version === next.version && sameContributions(mounted, next);
}
