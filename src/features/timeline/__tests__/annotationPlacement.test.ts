import { describe, expect, it } from 'vitest';

import { type AnnotationRail, placeAnnotation } from '../annotationPlacement';

const IDS = ['t0', 't1', 't2', 't3'];
/** Turns start at 0, 100, 300 and 400 px down the conversation. */
const TOPS = [0, 100, 300, 400];

function rail(overrides: Partial<AnnotationRail> = {}): AnnotationRail {
  return {
    markerIds: IDS,
    markerTops: TOPS,
    hidden: new Set(),
    positions: [10, 50, 90, 130],
    ...overrides,
  };
}

describe('placeAnnotation', () => {
  it("sits between its turn's marker and the next one by how far down the turn it is", () => {
    expect(placeAnnotation(rail(), 't1', 0)).toBe(50);
    expect(placeAnnotation(rail(), 't1', 0.25)).toBe(60);
    expect(placeAnnotation(rail(), 't1', 1)).toBe(90);
  });

  it('a highlight in the last turn sits on its marker', () => {
    expect(placeAnnotation(rail(), 't3', 0.8)).toBe(130);
  });

  it('a turn collapsed under its parent places between the visible parent and the next visible marker', () => {
    // t1 and t2 are folded under t0: the span from t0 (0px) to t3 (400px) maps onto 10..130.
    const collapsed = rail({ hidden: new Set([1, 2]) });
    expect(placeAnnotation(collapsed, 't2', 0.5)).toBe(10 + (350 / 400) * 120);
    expect(placeAnnotation(collapsed, 't1', 0)).toBe(10 + (100 / 400) * 120);
  });

  it('a turn that is not a marker has no place on the rail', () => {
    expect(placeAnnotation(rail(), 'missing', 0.5)).toBeNull();
  });

  it('falls back to the marker positions when turn tops could not be measured', () => {
    const unmeasured = rail({ markerTops: [] });
    expect(placeAnnotation(unmeasured, 't1', 0.5)).toBe(70);
    // A collapsed turn without measurements sits on its visible parent.
    expect(placeAnnotation({ ...unmeasured, hidden: new Set([1, 2]) }, 't2', 0.5)).toBe(10);
  });

  it('places on dense rails in their offsets from the middle, the same way', () => {
    const dense = rail({ positions: [-12, -4, 4, 12] });
    expect(placeAnnotation(dense, 't1', 0.5)).toBe(0);
    expect(placeAnnotation({ ...dense, hidden: new Set([1]) }, 't1', 0.5)).toBe(
      -12 + (200 / 300) * 16,
    );
  });
});
