/**
 * Stitch the currently mounted turns into the accumulated marker list.
 *
 * Virtualized hosts (Claude, DeepSeek, ChatGPT) mount only a window of the
 * conversation, so the DOM is never the full conversation. Markers are
 * therefore ACCUMULATED across refreshes (ids keyed by content hash, not mount
 * index) and stitched into order via turns shared between overlapping windows.
 * A known turn whose element left the DOM is never dropped: virtualization
 * can mount sparse, non-contiguous windows mid-transition, so a missing turn
 * only means "not mounted right now", not "deleted" — mirroring the Gemini
 * timeline's grow-only behaviour. One whose element is still in the page but
 * no longer stands for it is dropped (`rememberedMarkers`).
 *
 * Pure apart from stamping `data-gv-turn-id` on the turns it files; the
 * navigator owns the marker list and passes it in.
 */
import { hashString } from '@/core/utils/hash';

export const TURN_ID_ATTR = 'data-gv-turn-id';
/**
 * Exact alignment of a repeated-prompt run costs (run + 1) x (markers + 1)
 * cells of time and memory; past this, the run is matched greedily.
 */
const MAX_ALIGNMENT_CELLS = 250_000;

export interface Marker {
  id: string;
  hash: string;
  summary: string;
  starred: boolean;
  starredAt?: number;
  /** Last-seen element; disconnected once the host virtualizes the turn out. */
  element: HTMLElement;
  /** Last-known center offset within the scroll target; reused while unmounted. */
  center: number;
  /**
   * The navigator's measuring pass that last wrote `center`. Centres from one
   * pass share a frame; an older one may predate content that grew or shrank
   * above it.
   */
  measuredAt?: number;
  dotElement: HTMLButtonElement | null;
}

export interface MountedTurn {
  readonly element: HTMLElement;
  readonly summary: string;
}

interface MountedEntry extends MountedTurn {
  readonly hash: string;
  readonly center: number;
}

export function buildTurnId(text: string): string {
  return `c-${hashString(text)}`;
}

/**
 * Hands out `c-<hash>`, then `c-<hash>~2`, `~3`… for repeats of one text,
 * skipping ids already taken. It resumes each text where it stopped, so a
 * long run of one repeated prompt does not rescan every earlier id.
 */
export class TurnIds {
  private readonly nextByHash = new Map<string, number>();

  constructor(private readonly used = new Set<string>()) {}

  claim(hash: string): string {
    const base = `c-${hash}`;
    let n = this.nextByHash.get(hash) ?? 1;
    let id = n === 1 ? base : `${base}~${n}`;
    while (this.used.has(id)) id = `${base}~${++n}`;
    this.nextByHash.set(hash, n + 1);
    this.used.add(id);
    return id;
  }
}

/**
 * For each mounted turn, the index of the known marker it is, or -1 for a new
 * turn. Matches keep conversation order (indexes only grow).
 *
 * Repeated prompts ("continue", "yes") share a hash, so text alone cannot say
 * which known marker a mounted repeat is. Matching therefore runs in two
 * passes:
 *   1. Certain matches, in order: the id stamped on the element (it stayed
 *      mounted since we filed it, same text); a hash only one known marker
 *      carries.
 *   2. Each run of uncertain turns between two certain matches is aligned with
 *      the known markers between them (`alignRun`).
 */
function matchKnownMarkers(known: readonly Marker[], mounted: readonly MountedEntry[]): number[] {
  const hashCount = new Map<string, number>();
  const firstByHash = new Map<string, number>();
  const indexById = new Map<string, number>();
  known.forEach((marker, index) => {
    hashCount.set(marker.hash, (hashCount.get(marker.hash) ?? 0) + 1);
    if (!firstByHash.has(marker.hash)) firstByHash.set(marker.hash, index);
    indexById.set(marker.id, index);
  });

  const certainMatch = (entry: MountedEntry, from: number): number => {
    const stamped = entry.element.getAttribute(TURN_ID_ATTR);
    const byStamp = stamped === null ? undefined : indexById.get(stamped);
    if (byStamp !== undefined && byStamp >= from && known[byStamp].hash === entry.hash) {
      return byStamp;
    }
    if (hashCount.get(entry.hash) === 1) {
      const only = firstByHash.get(entry.hash)!;
      if (only >= from) return only;
    }
    return -1;
  };

  const matched = new Array<number>(mounted.length).fill(-1);
  let from = 0;
  mounted.forEach((entry, i) => {
    const match = certainMatch(entry, from);
    if (match === -1) return;
    matched[i] = match;
    from = match + 1;
  });

  // Fresh centre minus remembered centre at a certain match.
  const driftAt = (i: number): number => mounted[i].center - known[matched[i]].center;
  let prev = -1;
  for (let i = 0; i <= mounted.length; i++) {
    if (i < mounted.length && matched[i] === -1) continue;
    if (i - prev > 1) {
      const lo = prev === -1 ? 0 : matched[prev] + 1;
      const hi = i === mounted.length ? known.length : matched[i];
      const run = mounted.slice(prev + 1, i);
      // A run entry is corrected by the drift of the nearer bounding anchor.
      const drifts = run.map((_, r) => {
        const toPrev = prev === -1 ? Infinity : r + 1;
        const toNext = i === mounted.length ? Infinity : run.length - r;
        if (toPrev === Infinity && toNext === Infinity) return 0;
        return toPrev <= toNext ? driftAt(prev) : driftAt(i);
      });
      alignRun(known, run, lo, hi, drifts).forEach((index, r) => {
        matched[prev + 1 + r] = index;
      });
    }
    prev = i;
  }
  return matched;
}

/**
 * Align uncertain mounted turns with the known markers `[lo, hi)`, keeping
 * order. The alignment with the most matches wins: a host that re-measured a
 * region shifts every centre, and nearest-centre matching would then call a
 * remembered repeat new. Among equally many matches the smallest
 * drift-corrected distance wins, then the earliest markers.
 */
function alignRun(
  known: readonly Marker[],
  run: readonly MountedEntry[],
  lo: number,
  hi: number,
  drifts: readonly number[],
): number[] {
  const m = run.length;
  const n = Math.max(0, hi - lo);
  const result = new Array<number>(m).fill(-1);
  const isCandidate = (index: number, entry: MountedEntry): boolean =>
    known[index].hash === entry.hash;
  const hashes = new Set(run.map((entry) => entry.hash));
  let anyCandidate = false;
  for (let j = lo; j < hi && !anyCandidate; j++) anyCandidate = hashes.has(known[j].hash);
  if (!anyCandidate) return result;
  if ((m + 1) * (n + 1) > MAX_ALIGNMENT_CELLS) return alignInOrder(known, run, lo, hi, drifts);

  // best[i][j]: most matches, then least distance, for run[i..] vs known[lo+j..hi).
  const width = n + 1;
  const count = new Int32Array((m + 1) * width);
  const cost = new Float64Array((m + 1) * width);
  const at = (i: number, j: number): number => i * width + j;
  const better = (c1: number, d1: number, c2: number, d2: number): boolean =>
    c1 > c2 || (c1 === c2 && d1 < d2);
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      let bestCount = -1;
      let bestCost = 0;
      if (isCandidate(lo + j, run[i])) {
        const distance = Math.abs(run[i].center - (known[lo + j].center + drifts[i]));
        bestCount = count[at(i + 1, j + 1)] + 1;
        bestCost = cost[at(i + 1, j + 1)] + distance;
      }
      for (const [ni, nj] of [
        [i, j + 1],
        [i + 1, j],
      ] as const) {
        if (better(count[at(ni, nj)], cost[at(ni, nj)], bestCount, bestCost)) {
          bestCount = count[at(ni, nj)];
          bestCost = cost[at(ni, nj)];
        }
      }
      count[at(i, j)] = bestCount;
      cost[at(i, j)] = bestCost;
    }
  }

  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    const here = at(i, j);
    if (
      isCandidate(lo + j, run[i]) &&
      count[at(i + 1, j + 1)] + 1 === count[here] &&
      Math.abs(
        cost[at(i + 1, j + 1)] +
          Math.abs(run[i].center - (known[lo + j].center + drifts[i])) -
          cost[here],
      ) < 1e-6
    ) {
      result[i] = lo + j;
      i++;
      j++;
    } else if (count[at(i, j + 1)] === count[here] && cost[at(i, j + 1)] === cost[here]) {
      j++;
    } else {
      i++;
    }
  }
  return result;
}

/**
 * A run too long to align exactly, matched in one ordered pass over the
 * markers and the run together, all texts at once.
 *
 * A text's slack is how many of its markers ahead could go unmatched: its
 * markers left minus its turns left. A turn may skip a marker only while
 * that marker's text has slack, so it never jumps past a marker another turn
 * of the run still needs; a text with no slack pairs in order, which no
 * uniform shift can upset. Among the markers with its text it may reach, a
 * turn takes the nearest by position (earliest on a tie). A turn that can
 * reach none skips the blocking marker for the next one with its text only
 * when it sits nearer to that one, so a turn that went missing does not
 * shift every turn after it onto its neighbour's id.
 *
 * Positions are searched on estimates sorted in DOM order (`freshCenters`),
 * so a stale centre cannot attract a turn far from its place.
 *
 * The reachable bound only moves forward, so finding it is linear overall;
 * each turn and the estimates add binary searches. Cost: (run + markers) x
 * log(markers).
 */
function alignInOrder(
  known: readonly Marker[],
  run: readonly MountedEntry[],
  lo: number,
  hi: number,
  drifts: readonly number[],
): number[] {
  const estimate = freshCenters(known, lo, hi);
  const indexesByHash = new Map<string, number[]>();
  const markersLeft = new Map<string, number>();
  for (let j = lo; j < hi; j++) {
    const { hash } = known[j];
    const indexes = indexesByHash.get(hash);
    if (indexes) indexes.push(j);
    else indexesByHash.set(hash, [j]);
    markersLeft.set(hash, (markersLeft.get(hash) ?? 0) + 1);
  }
  const turnsLeft = new Map<string, number>();
  for (const entry of run) turnsLeft.set(entry.hash, (turnsLeft.get(entry.hash) ?? 0) + 1);
  const slack = (hash: string): number => (markersLeft.get(hash) ?? 0) - (turnsLeft.get(hash) ?? 0);

  // Markers [next, reach) may all be skipped; known[reach] may not.
  let next = lo;
  let reach = lo;
  const skippable = new Map<string, number>();
  const extendReach = (): void => {
    while (reach < hi) {
      const { hash } = known[reach];
      const count = (skippable.get(hash) ?? 0) + 1;
      if (count > slack(hash)) return;
      skippable.set(hash, count);
      reach++;
    }
  };
  const passMarkersBefore = (end: number): void => {
    for (; next < end; next++) {
      const { hash } = known[next];
      markersLeft.set(hash, markersLeft.get(hash)! - 1);
      if (next < reach) skippable.set(hash, skippable.get(hash)! - 1);
    }
    if (reach < next) reach = next;
  };

  return run.map((entry, r) => {
    extendReach();
    const indexes = indexesByHash.get(entry.hash);
    let pick = -1;
    if (indexes) {
      const from = lowerBound(indexes, next);
      const to = lowerBound(indexes, reach + 1);
      const target = entry.center - drifts[r];
      const at = (k: number): number => estimate[indexes[k] - lo];
      if (from === to && to < indexes.length && reach < hi) {
        const blocker = estimate[reach - lo];
        if (Math.abs(at(to) - target) < Math.abs(blocker - target)) pick = indexes[to];
      } else if (from < to) {
        // First candidate at or past the target; the one before it is the other contender.
        const above = searchCenters(from, to, (k) => at(k) >= target);
        let k = above;
        if (above > from) {
          const below = at(above - 1);
          if (above === to || target - below <= at(above) - target) {
            k = searchCenters(from, above, (candidate) => at(candidate) >= below);
          }
        }
        pick = indexes[k];
      }
    }
    turnsLeft.set(entry.hash, turnsLeft.get(entry.hash)! - 1);
    if (pick !== -1) passMarkersBefore(pick + 1);
    return pick;
  });
}

/**
 * Remembered centres of `known[lo, hi)` as estimates sorted in DOM order,
 * trusting fresher measurements over older ones. Centres from one pass are
 * in one frame; an older centre may predate content that grew or shrank
 * above it. So each centre is clamped between the fresher centres around it
 * (at least every fresher one before it, at most every fresher one after
 * it), freshest first, and a final running max sorts what a single pass left
 * out of order. Cost: markers x log(markers).
 */
function freshCenters(known: readonly Marker[], lo: number, hi: number): Float64Array {
  const n = hi - lo;
  const estimate = new Float64Array(n);
  const order = Array.from({ length: n }, (_, i) => i).sort(
    (a, b) => (known[lo + b].measuredAt ?? 0) - (known[lo + a].measuredAt ?? 0),
  );
  // Fenwick trees over positions: highest accepted estimate up to i, lowest from i on.
  const highest = new Float64Array(n + 1).fill(-Infinity);
  const lowest = new Float64Array(n + 1).fill(Infinity);
  const highestUpTo = (i: number): number => {
    let value = -Infinity;
    for (let k = i + 1; k > 0; k -= k & -k) value = Math.max(value, highest[k]);
    return value;
  };
  const lowestFrom = (i: number): number => {
    let value = Infinity;
    for (let k = n - i; k > 0; k -= k & -k) value = Math.min(value, lowest[k]);
    return value;
  };
  const accept = (i: number): void => {
    for (let k = i + 1; k <= n; k += k & -k) highest[k] = Math.max(highest[k], estimate[i]);
    for (let k = n - i; k <= n; k += k & -k) lowest[k] = Math.min(lowest[k], estimate[i]);
  };
  for (let start = 0; start < n;) {
    const epoch = known[lo + order[start]].measuredAt ?? 0;
    let end = start;
    while (end < n && (known[lo + order[end]].measuredAt ?? 0) === epoch) end++;
    // Clamp one pass against strictly fresher ones only, then accept it whole.
    for (let k = start; k < end; k++) {
      const i = order[k];
      const own = known[lo + i].center;
      estimate[i] = Math.min(Math.max(own, highestUpTo(i - 1)), lowestFrom(i + 1));
    }
    for (let k = start; k < end; k++) accept(order[k]);
    start = end;
  }
  for (let i = 1; i < n; i++) estimate[i] = Math.max(estimate[i], estimate[i - 1]);
  return estimate;
}

/** First position in `[low, high)` where `reached` holds, for a predicate that stays true once true. */
function searchCenters(low: number, high: number, reached: (k: number) => boolean): number {
  while (low < high) {
    const mid = (low + high) >> 1;
    if (reached(mid)) high = mid;
    else low = mid + 1;
  }
  return low;
}

/** First position in the ascending `values` holding a value at or above `min`. */
function lowerBound(values: readonly number[], min: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if (values[mid] < min) low = mid + 1;
    else high = mid;
  }
  return low;
}

/**
 * The remembered markers that can still stand for a turn. One whose element
 * left the DOM is only virtualized out and is kept. One whose element is still
 * in the page but hidden (a thread the host put away), no longer a turn, or
 * now reading as another text (edited in place) no longer stands for what it
 * remembers: the mounted turns (rendered ones only) re-file that element.
 */
export function rememberedMarkers(
  known: readonly Marker[],
  mounted: readonly MountedTurn[],
): Marker[] {
  const current = new Map(mounted.map((turn) => [turn.element, hashString(turn.summary)]));
  return known.filter(
    (marker) => !marker.element.isConnected || current.get(marker.element) === marker.hash,
  );
}

export function mergeMountedTurns(
  known: Marker[],
  turns: readonly MountedTurn[],
  centerOf: (element: HTMLElement) => number,
): Marker[] {
  const mounted: MountedEntry[] = turns.map((turn) => ({
    ...turn,
    hash: hashString(turn.summary),
    center: centerOf(turn.element),
  }));
  if (!mounted.length) return known;

  const matchedKnownIndex = matchKnownMarkers(known, mounted);

  const turnIds = new TurnIds(new Set(known.map((marker) => marker.id)));
  const createMarker = (entry: MountedEntry): Marker => {
    const id = turnIds.claim(entry.hash);
    entry.element.setAttribute(TURN_ID_ATTR, id);
    return {
      id,
      hash: entry.hash,
      summary: entry.summary,
      starred: false,
      element: entry.element,
      center: entry.center,
      dotElement: null,
    };
  };

  const firstMatch = matchedKnownIndex.findIndex((index) => index >= 0);
  if (firstMatch === -1) {
    // Jumped into an unexplored region: place the whole block by its
    // vertical position relative to the accumulated turns.
    const fresh = mounted.map(createMarker);
    const insertAt = known.findIndex((marker) => marker.center > fresh[0].center);
    return insertAt === -1
      ? [...known, ...fresh]
      : [...known.slice(0, insertAt), ...fresh, ...known.slice(insertAt)];
  }

  const beforeFirstAnchor: Marker[] = [];
  const afterKnownIndex = new Map<number, Marker[]>();
  // Fresh centre minus remembered centre per anchor: how far the host's
  // re-measuring has shifted this region since the neighbours were seen.
  const anchorDrift = new Map<number, number>();
  let lastAnchor = -1;
  for (let i = 0; i < mounted.length; i++) {
    const knownIndex = matchedKnownIndex[i];
    if (knownIndex >= 0) {
      const survivor = known[knownIndex];
      anchorDrift.set(knownIndex, mounted[i].center - survivor.center);
      survivor.element = mounted[i].element;
      survivor.summary = mounted[i].summary;
      mounted[i].element.setAttribute(TURN_ID_ATTR, survivor.id);
      lastAnchor = knownIndex;
      continue;
    }
    const marker = createMarker(mounted[i]);
    if (lastAnchor === -1) {
      beforeFirstAnchor.push(marker);
    } else {
      const bucket = afterKnownIndex.get(lastAnchor);
      if (bucket) bucket.push(marker);
      else afterKnownIndex.set(lastAnchor, [marker]);
    }
  }

  // Anchors fix the order of the turns they match; a block of new turns is
  // then filed by scroll position among the known turns between its two
  // bounding anchors. "Right next to the anchor" is not enough: Claude keeps
  // the latest turn mounted while the reader sits at the top, and that lone
  // tail anchor would drag the conversation's opening turns behind the
  // bottom window. Known centres are compared after the nearest anchor's
  // drift so re-measured content does not skew the comparison.
  const anchors = matchedKnownIndex.filter((index) => index >= 0);
  const insertBefore = new Map<number, Marker[]>();
  // A known turn between two anchors is assumed to have drifted like the
  // anchor nearer to it; anchors on different sides of a re-measured region
  // can carry very different drifts.
  const driftAt = (index: number, prev: number | undefined, next: number | undefined): number => {
    const prevDrift = prev === undefined ? undefined : anchorDrift.get(prev);
    const nextDrift = next === undefined ? undefined : anchorDrift.get(next);
    if (prevDrift === undefined) return nextDrift ?? 0;
    if (nextDrift === undefined) return prevDrift;
    return index - prev! <= next! - index ? prevDrift : nextDrift;
  };
  const file = (block: Marker[], prev: number | undefined, next: number | undefined): void => {
    if (!block.length) return;
    const lo = prev === undefined ? 0 : prev + 1;
    const hi = next ?? known.length;
    let at = hi;
    for (let index = lo; index < hi; index++) {
      if (known[index].center + driftAt(index, prev, next) > block[0].center) {
        at = index;
        break;
      }
    }
    const bucket = insertBefore.get(at);
    if (bucket) bucket.push(...block);
    else insertBefore.set(at, block);
  };
  file(beforeFirstAnchor, undefined, anchors[0]);
  anchors.forEach((anchor, rank) => {
    const block = afterKnownIndex.get(anchor);
    if (block) file(block, anchor, anchors[rank + 1]);
  });

  const result: Marker[] = [];
  known.forEach((marker, index) => {
    const block = insertBefore.get(index);
    if (block) result.push(...block);
    result.push(marker);
  });
  const tail = insertBefore.get(known.length);
  if (tail) result.push(...tail);
  return result;
}
