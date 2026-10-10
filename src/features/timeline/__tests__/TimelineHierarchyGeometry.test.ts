import { describe, expect, it } from 'vitest';

import { TimelineHierarchyGeometry } from '../TimelineHierarchyGeometry';
import type { MarkerLevel, TimelineMarker } from '../types';

function marker(id: string, baseN: number): TimelineMarker {
  return {
    id,
    baseN,
    element: document.createElement('div'),
    summary: id,
    assistantSummary: '',
    starred: false,
  };
}

describe('shared hierarchy geometry', () => {
  it('hides nested descendants up to the next sibling and redistributes their weighted length', () => {
    const markers = [
      marker('parent', 0.1),
      marker('child', 0.4),
      marker('grandchild', 0.8),
      marker('sibling', 1),
    ];
    const levels: Record<string, MarkerLevel> = { parent: 1, child: 2, grandchild: 3, sibling: 1 };
    const geometry = new TimelineHierarchyGeometry(
      () => markers,
      (id) => levels[id],
      (id) => id === 'parent',
    );
    expect(geometry.getHiddenMarkerIndices()).toEqual(new Set());
    geometry.markerLevelEnabled = true;
    const hidden = geometry.getHiddenMarkerIndices();
    expect(hidden).toEqual(new Set([1, 2]));
    expect(geometry.canCollapseMarker('parent')).toBe(true);
    expect(geometry.canCollapseMarker('sibling')).toBe(false);
    const positions = geometry.calculateCollapsedPositions(hidden, 10, 100);
    expect(positions.desiredY).toEqual([10, -1, -1, 110]);
    expect(positions.effectiveBaseNs[0]).toBeCloseTo(0.35);
  });

  it('saved levels and a collapsed parent leave the rail flat while levels are switched off', () => {
    const markers = [marker('parent', 0.1), marker('child', 0.11), marker('next', 0.5)];
    const levels: Record<string, MarkerLevel> = { parent: 1, child: 2, next: 2 };
    const geometry = new TimelineHierarchyGeometry(
      () => markers,
      (id) => levels[id],
      (id) => id === 'parent',
    );
    const hidden = geometry.getHiddenMarkerIndices();
    expect(geometry.calculateCollapsedPositions(hidden, 0, 100).effectiveBaseNs).toEqual([
      0.1, 0.11, 0.5,
    ]);
    expect(geometry.getMarkerLevel('child')).toBe(1);
    expect(geometry.isMarkerCollapsed('parent')).toBe(false);

    geometry.markerLevelEnabled = true;
    expect(geometry.getMarkerLevel('child')).toBe(2);
    expect(geometry.isMarkerCollapsed('parent')).toBe(true);
  });
});
