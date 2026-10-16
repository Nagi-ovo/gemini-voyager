/** The rail as an annotation sees it: markers in order and where each visible one is drawn. */
export interface AnnotationRail {
  readonly markerIds: readonly string[];
  /** Scroll-container top of every marker's turn; empty (or short) when measurement failed. */
  readonly markerTops: readonly number[];
  /** Marker indices collapsed away under a parent. */
  readonly hidden: ReadonlySet<number>;
  /** Rail position of each visible marker: px from the content top (dots) or the middle (dense). */
  readonly positions: readonly number[];
}

const clamp01 = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

function nextVisible(rail: AnnotationRail, after: number): number {
  for (let index = after + 1; index < rail.markerIds.length; index++) {
    if (!rail.hidden.has(index)) return index;
  }
  return -1;
}

function lastVisibleAtOrBefore(rail: AnnotationRail, index: number, top?: number): number {
  for (let candidate = index; candidate >= 0; candidate--) {
    if (rail.hidden.has(candidate)) continue;
    if (top === undefined || rail.markerTops[candidate] <= top) return candidate;
  }
  return -1;
}

function between(rail: AnnotationRail, from: number, to: number, t: number): number {
  const start = rail.positions[from];
  return to < 0 ? start : start + clamp01(t) * (rail.positions[to] - start);
}

/**
 * Where on the rail an annotation `progress` of the way through turn `turnId` sits, in the
 * unit of `rail.positions`, or null when the rail has no place for it.
 *
 * The turn's page span is mapped onto the visible markers around it, so a turn collapsed under a
 * parent lands between that parent and the next visible marker, and dense rails work the same as
 * the classic one. Without measured tops it falls back to the marker positions alone: its turn's
 * marker plus `progress` of the gap to the next, or the nearest earlier visible marker.
 */
export function placeAnnotation(
  rail: AnnotationRail,
  turnId: string,
  progress: number,
): number | null {
  const index = rail.markerIds.indexOf(turnId);
  if (index < 0) return null;
  const count = rail.markerIds.length;

  if (rail.markerTops.length === count) {
    const tops = rail.markerTops;
    const absolute =
      index + 1 < count
        ? tops[index] + clamp01(progress) * (tops[index + 1] - tops[index])
        : tops[index];
    // `absolute` never passes the next turn's top, so the search can start one marker later.
    const from = lastVisibleAtOrBefore(rail, Math.min(index + 1, count - 1), absolute);
    if (from < 0) return null;
    const to = nextVisible(rail, from);
    const span = to < 0 ? 0 : tops[to] - tops[from];
    return between(rail, from, to, span > 0 ? (absolute - tops[from]) / span : 0);
  }

  const from = lastVisibleAtOrBefore(rail, index);
  if (from < 0) return null;
  return between(rail, from, nextVisible(rail, index), from === index ? progress : 0);
}
