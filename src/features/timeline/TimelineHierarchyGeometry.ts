import type { MarkerLevel, TimelineMarker } from './types';

/** Collapse geometry shared by every conversation adapter. */
export class TimelineHierarchyGeometry {
  markerLevelEnabled = false;
  constructor(
    private readonly getMarkers: () => TimelineMarker[],
    private readonly readMarkerLevel: (id: string) => MarkerLevel,
    private readonly readMarkerCollapsed: (id: string) => boolean,
  ) {}
  private get markers(): TimelineMarker[] {
    return this.getMarkers();
  }
  // Saved levels outlive the switch; while it is off the rail must look flat, not keep shapes,
  // collapse rings or shifted positions the user can no longer edit.
  getMarkerLevel(id: string): MarkerLevel {
    return this.markerLevelEnabled ? this.readMarkerLevel(id) : 1;
  }
  isMarkerCollapsed(id: string): boolean {
    return this.markerLevelEnabled && this.readMarkerCollapsed(id);
  }
  getHiddenMarkerIndices(): Set<number> {
    const hidden = new Set<number>();

    for (let i = 0; i < this.markers.length; i++) {
      // Skip markers that are already hidden by a parent collapse
      if (hidden.has(i)) continue;

      const marker = this.markers[i];
      const level = this.getMarkerLevel(marker.id);

      // If this marker is collapsed, hide all subsequent lower-level markers
      if (this.isMarkerCollapsed(marker.id)) {
        for (let j = i + 1; j < this.markers.length; j++) {
          const nextMarker = this.markers[j];
          const nextLevel = this.getMarkerLevel(nextMarker.id);

          // Stop when we reach a marker of same or higher level (lower number)
          if (nextLevel <= level) {
            break;
          }

          // Hide this marker (only direct descendants of this collapsed parent)
          hidden.add(j);
        }
      }
    }

    return hidden;
  }
  private calculateEffectiveBaseN(markerIndex: number): number {
    const marker = this.markers[markerIndex];
    if (!marker) return 0;

    const baseN = marker.baseN;

    // If this marker is not collapsed, just return its baseN
    if (!this.isMarkerCollapsed(marker.id)) {
      return baseN;
    }

    // Find the range of hidden children
    const level = this.getMarkerLevel(marker.id);
    let childContribution = 0;

    for (let j = markerIndex + 1; j < this.markers.length; j++) {
      const nextMarker = this.markers[j];
      const nextLevel = this.getMarkerLevel(nextMarker.id);

      // Stop when we reach a marker of same or higher level
      if (nextLevel <= level) {
        break;
      }

      // Add half of child's contribution based on level difference
      const childBaseN = nextMarker.baseN;
      const prevBaseN = j > 0 ? this.markers[j - 1].baseN : 0;
      const childLength = childBaseN - prevBaseN;
      const levelDiff = nextLevel - level;
      childContribution += childLength * Math.pow(0.5, levelDiff);
    }

    return baseN + childContribution;
  }
  calculateCollapsedPositions(
    hiddenIndices: Set<number>,
    pad: number,
    usableC: number,
  ): { desiredY: number[]; effectiveBaseNs: number[] } {
    const N = this.markers.length;
    const desiredY: number[] = new Array(N).fill(-1);
    const effectiveBaseNs: number[] = new Array(N).fill(0);

    // First pass: calculate effective baseN for all visible markers
    const visibleMarkers: { index: number; effectiveN: number }[] = [];

    for (let i = 0; i < N; i++) {
      if (hiddenIndices.has(i)) continue;

      const effectiveN = this.calculateEffectiveBaseN(i);
      effectiveBaseNs[i] = effectiveN;
      visibleMarkers.push({ index: i, effectiveN });
    }

    // Sort visible markers by their effective baseN (maintains relative order based on length)
    visibleMarkers.sort((a, b) => a.effectiveN - b.effectiveN);

    // Calculate total effective range
    if (visibleMarkers.length === 0) {
      return { desiredY, effectiveBaseNs };
    }

    const minEffectiveN = visibleMarkers[0].effectiveN;
    const maxEffectiveN = visibleMarkers[visibleMarkers.length - 1].effectiveN;
    const effectiveRange = maxEffectiveN - minEffectiveN;

    // Distribute positions proportionally
    for (const vm of visibleMarkers) {
      let normalizedN: number;
      if (effectiveRange > 0) {
        normalizedN = (vm.effectiveN - minEffectiveN) / effectiveRange;
      } else {
        normalizedN = visibleMarkers.indexOf(vm) / Math.max(1, visibleMarkers.length - 1);
      }

      desiredY[vm.index] = pad + normalizedN * usableC;
    }

    return { desiredY, effectiveBaseNs };
  }
  /**
   * Check if a marker can be collapsed (has lower-level children)
   */
  canCollapseMarker(turnId: string): boolean {
    const markerIndex = this.markers.findIndex((m) => m.id === turnId);
    if (markerIndex < 0 || markerIndex >= this.markers.length - 1) return false;

    const level = this.getMarkerLevel(turnId);

    const nextMarker = this.markers[markerIndex + 1];
    if (!nextMarker) return false;

    const nextLevel = this.getMarkerLevel(nextMarker.id);
    return nextLevel > level;
  }
}
