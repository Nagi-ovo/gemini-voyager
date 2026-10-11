/**
 * Who may hold each exclusive page resource (`resourceClaims.ts`) on this page.
 *
 * Pure: the answer depends only on the inputs, never on their order or on
 * which async work finished first.
 *
 *   1. A plugin already holding its resources and still wanted keeps them. A
 *      newly enabled rival is blocked rather than taking over a running one.
 *      A holder whose own runtime is still shutting down (an engine rebuild)
 *      keeps them too, and starts once that release settles.
 *   2. Free resources go to official plugins (any id outside `local.*`) before
 *      the user's own, then by ascending id.
 *   3. A reserved plugin (a packaged official plugin that would run but whose
 *      content script has not admitted it yet) takes its resources in that
 *      same order without mounting, so a cold start does not hand them to a
 *      local plugin merely because the admission is still on its way.
 *   4. An awaiting plugin (a packaged official plugin whose legacy switch is
 *      still being read) does the same, but what it blocks is reported as
 *      `pending`: nobody knows yet whether it will run.
 *   5. A plugin gets every resource it claims or none: one taken resource
 *      blocks the whole plugin, its CSS and DOM ops included.
 *   6. A newcomer that needs a runtime still shutting down elsewhere waits in
 *      line for that runtime only: its other resources stay free for plugins
 *      that can start now, so a release that never settles blocks nothing
 *      beyond what it holds.
 */
import type { PluginManifest } from '../types';
import { type ResourceId, claimedResources } from './resourceClaims';

export type ArbitrationBlockReason = 'conflict' | 'pending' | 'releasing';

export interface ArbitrationBlock {
  /**
   * conflict   `by` holds or reserves a resource this plugin needs
   * pending    `by` awaits its switch and may need the resource
   * releasing  this plugin is next in line; `by` is still shutting it down
   */
  readonly reason: ArbitrationBlockReason;
  readonly by: string;
  /** The resources behind the block (for `releasing`, the ones to wait for). */
  readonly resources: readonly ResourceId[];
}

export interface ArbitrationResult {
  /** Wanted plugins that may run now. */
  readonly granted: ReadonlySet<string>;
  /** Wanted plugins that may not, with who holds what they need. */
  readonly blocked: ReadonlyMap<string, ArbitrationBlock>;
}

export interface ArbitrationOptions {
  /** Plugins awaiting their legacy switch (rule 4); never granted. */
  readonly awaiting?: readonly PluginManifest[];
  /** The plugin still shutting `resource` down, or null when it is free. */
  readonly releasingBy?: (resource: ResourceId) => string | null;
  readonly claimsOf?: (manifest: PluginManifest) => readonly ResourceId[];
}

const LOCAL_PREFIX = 'local.';

function compareByPriority(a: PluginManifest, b: PluginManifest): number {
  const localA = a.id.startsWith(LOCAL_PREFIX);
  const localB = b.id.startsWith(LOCAL_PREFIX);
  if (localA !== localB) return localA ? 1 : -1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function uniqueById(manifests: readonly PluginManifest[]): PluginManifest[] {
  const byId = new Map<string, PluginManifest>();
  for (const manifest of manifests) if (!byId.has(manifest.id)) byId.set(manifest.id, manifest);
  return [...byId.values()].sort(compareByPriority);
}

type Role = 'run' | 'reserve' | 'await';

interface Holder {
  readonly id: string;
  /** How a plugin kept off by this holder is reported. */
  readonly reason: 'conflict' | 'pending';
}

/**
 * @param wanted     enabled, eligible and compatible on this page
 * @param reserved   would be wanted but for a pending admission; never granted
 * @param incumbents ids that currently hold their resources
 */
export function arbitrate(
  wanted: readonly PluginManifest[],
  reserved: readonly PluginManifest[],
  incumbents: ReadonlySet<string>,
  options: ArbitrationOptions = {},
): ArbitrationResult {
  const claimsOf = options.claimsOf ?? claimedResources;
  const releasingBy = options.releasingBy ?? (() => null);
  const holders = new Map<ResourceId, Holder>();
  const granted = new Set<string>();
  const blocked = new Map<string, ArbitrationBlock>();
  const wantedList = uniqueById(wanted);
  const roles = new Map<string, Role>();
  for (const manifest of uniqueById(options.awaiting ?? [])) roles.set(manifest.id, 'await');
  for (const manifest of uniqueById(reserved)) roles.set(manifest.id, 'reserve');
  for (const manifest of wantedList) roles.set(manifest.id, 'run');

  const hold = (claims: readonly ResourceId[], holder: Holder): void => {
    for (const resource of claims) holders.set(resource, holder);
  };
  /** Grant `manifest`, or report the first of its resources still shutting down. */
  const start = (manifest: PluginManifest, claims: readonly ResourceId[]): void => {
    const busy = claims.filter((resource) => releasingBy(resource) !== null);
    if (busy.length === 0) {
      granted.add(manifest.id);
      return;
    }
    blocked.set(manifest.id, { reason: 'releasing', by: releasingBy(busy[0])!, resources: busy });
  };

  for (const manifest of wantedList) {
    if (!incumbents.has(manifest.id)) continue;
    const claims = claimsOf(manifest);
    const taken = claims.filter((resource) => holders.has(resource));
    if (taken.length > 0) {
      const holder = holders.get(taken[0])!;
      blocked.set(manifest.id, { reason: holder.reason, by: holder.id, resources: taken });
      continue;
    }
    hold(claims, { id: manifest.id, reason: 'conflict' });
    start(manifest, claims);
  }

  // A wanted plugin listed again as reserved or awaiting is placed as wanted.
  const contenders = uniqueById([...wantedList, ...reserved, ...(options.awaiting ?? [])]).filter(
    (manifest) => !incumbents.has(manifest.id),
  );
  for (const manifest of contenders) {
    const role = roles.get(manifest.id)!;
    const claims = claimsOf(manifest);
    const taken = claims.filter((resource) => holders.has(resource));
    if (taken.length > 0) {
      const holder = holders.get(taken[0])!;
      if (role === 'run') {
        blocked.set(manifest.id, { reason: holder.reason, by: holder.id, resources: taken });
      }
      continue;
    }
    if (role !== 'run') {
      hold(claims, { id: manifest.id, reason: role === 'await' ? 'pending' : 'conflict' });
      continue;
    }
    const busy = claims.filter((resource) => releasingBy(resource) !== null);
    // Next in line for the busy runtimes only (rule 6).
    hold(busy.length > 0 ? busy : claims, { id: manifest.id, reason: 'conflict' });
    start(manifest, claims);
  }

  return { granted, blocked };
}
