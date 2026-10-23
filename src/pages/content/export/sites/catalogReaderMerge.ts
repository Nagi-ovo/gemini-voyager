import type { ExtractedContent } from '@/features/export/services/DOMContentExtractor';

export interface CatalogSnapshot {
  readonly id: string;
  readonly role: 'user' | 'assistant';
  readonly content: ExtractedContent;
  readonly text: string;
  readonly element: HTMLElement;
  /** Selection may rebind a live host, without retaining an unmounted message subtree. */
  readonly host: WeakRef<HTMLElement>;
  readonly nativeId?: string;
  readonly fingerprint: string;
}

export type CatalogMountedSnapshot = CatalogSnapshot;

export interface CatalogSnapshotAccumulator {
  readonly snapshots: () => CatalogSnapshot[];
  readonly uncertain: () => boolean;
  readonly collect: (mounted: CatalogMountedSnapshot[]) => number;
}

interface KeyedMessage {
  snapshot: CatalogSnapshot;
  readonly firstSeen: number;
  readonly following: Set<string>;
}

/** Keyed windows provide order constraints; visual coordinates never identify or order messages. */
export function createCatalogSnapshotAccumulator(): CatalogSnapshotAccumulator {
  const known = new Map<string, KeyedMessage>();
  const keyOccurrences = new Map<string, string[]>();
  // A host that keeps its body under a new key is one message whose key changed, not two.
  const hostKeys = new WeakMap<HTMLElement, { id: string; fingerprint: string }>();
  let duplicateSequence = 0;
  let uncertain = false;

  const ordered = (): CatalogSnapshot[] => {
    const indegrees = new Map(Array.from(known.keys(), (id) => [id, 0]));
    for (const node of known.values()) {
      for (const next of node.following) indegrees.set(next, indegrees.get(next)! + 1);
    }
    const byFirstSeen = (a: string, b: string) => known.get(a)!.firstSeen - known.get(b)!.firstSeen;
    const ready = Array.from(known.keys()).filter((id) => indegrees.get(id) === 0);
    const result: CatalogSnapshot[] = [];
    const emitted = new Set<string>();
    while (ready.length) {
      const id = ready.shift()!;
      const node = known.get(id)!;
      result.push(node.snapshot);
      emitted.add(id);
      for (const next of node.following) {
        const indegree = indegrees.get(next)! - 1;
        indegrees.set(next, indegree);
        if (indegree === 0) ready.push(next);
      }
      ready.sort(byFirstSeen);
    }
    if (result.length !== known.size) {
      // Contradictory windows cannot prove order; preserve every body in a deterministic fallback.
      uncertain = true;
      for (const [id, node] of known) if (!emitted.has(id)) result.push(node.snapshot);
    }
    return result;
  };

  return {
    snapshots: ordered,
    uncertain: () => {
      ordered();
      return uncertain;
    },
    collect(mounted) {
      const before = known.size;
      let anchored = false;
      const occurrences = new Map<string, number>();
      const windowIds: string[] = [];
      for (const entry of mounted) {
        if (!entry.nativeId) {
          uncertain = true;
          continue;
        }
        const rank = occurrences.get(entry.nativeId) ?? 0;
        occurrences.set(entry.nativeId, rank + 1);
        if (rank > 0) uncertain = true;
        let slots = keyOccurrences.get(entry.nativeId);
        if (!slots) {
          slots = [];
          keyOccurrences.set(entry.nativeId, slots);
        }
        // A conflicting key keeps each observed occurrence, without falling back to text alignment.
        const id =
          slots[rank] ??
          (slots[rank] = rank === 0 ? entry.nativeId : `catalog-duplicate-${duplicateSequence++}`);
        const host = entry.host.deref();
        const previousKey = host ? hostKeys.get(host) : undefined;
        if (previousKey && previousKey.id !== id && previousKey.fingerprint === entry.fingerprint)
          uncertain = true;
        if (host) hostKeys.set(host, { id, fingerprint: entry.fingerprint });
        const node = known.get(id);
        if (node) anchored = true;
        if (node) {
          if (
            node.snapshot.host.deref() !== entry.host.deref() &&
            node.snapshot.fingerprint !== entry.fingerprint
          )
            uncertain = true;
          node.snapshot = { ...entry, id };
        } else {
          known.set(id, {
            snapshot: { ...entry, id },
            firstSeen: known.size,
            following: new Set(),
          });
        }
        windowIds.push(id);
      }
      // Reads step by half a viewport, so each window overlaps the last; one without a known
      // key left a gap whose place in the conversation no window proves.
      if (before > 0 && windowIds.length > 0 && !anchored) uncertain = true;
      for (let index = 1; index < windowIds.length; index++) {
        known.get(windowIds[index - 1])!.following.add(windowIds[index]);
      }
      return known.size - before;
    },
  };
}
