/**
 * Marker stitching without a host key, as Claude and DeepSeek use it: turns
 * are told apart only by text and remembered position.
 */
import { describe, expect, it } from 'vitest';

import { type Marker, mergeMountedTurns } from './turnMerge';

interface Mounted {
  readonly element: HTMLElement;
  readonly summary: string;
}

const centers = new WeakMap<HTMLElement, number>();

/** Fresh elements, as a virtualized host renders them after a remount. */
function render(turns: ReadonlyArray<readonly [string, number]>): Mounted[] {
  return turns.map(([summary, center]) => {
    const element = document.createElement('div');
    element.textContent = summary;
    centers.set(element, center);
    return { element, summary };
  });
}

function merge(known: Marker[], turns: ReadonlyArray<readonly [string, number]>): Marker[] {
  return mergeMountedTurns(known, render(turns), (element) => centers.get(element) ?? 0);
}

describe('mergeMountedTurns without a turn key', () => {
  it('re-matches repeated prompts after a remount shifted every turn', () => {
    const known = merge(
      [],
      [
        ['continue', 100],
        ['continue', 200],
        ['anchor', 300],
      ],
    );
    const ids = known.map((marker) => marker.id);

    // The host re-measured the region: every centre moved down by 100px.
    const next = merge(known, [
      ['continue', 200],
      ['continue', 300],
      ['anchor', 400],
    ]);

    expect(next.map((marker) => marker.id)).toEqual(ids);
  });

  it('files a lone remounted repeat under the nearest remembered turn', () => {
    const known = merge(
      [],
      [
        ['hi', 100],
        ['x', 200],
        ['hi', 300],
      ],
    );
    const third = known[2].id;

    const [mounted] = render([['hi', 300]]);
    mergeMountedTurns(known, [mounted], () => 300);

    expect(mounted.element.getAttribute('data-gv-turn-id')).toBe(third);
  });

  it('re-matches a long run of repeats after a shift, past the alignment budget', () => {
    const turns: Array<readonly [string, number]> = [
      ['start', 0],
      ...Array.from({ length: 5_000 }, (_, index) => ['continue', 100 * (index + 1)] as const),
      ['end', 100 * 5_001],
    ];
    const known = merge([], turns);
    const ids = known.map((marker) => marker.id);

    const next = merge(
      known,
      turns.map(([summary, center]) => [summary, center + 100] as const),
    );

    expect(next.map((marker) => marker.id)).toEqual(ids);
  });

  it('keeps every turn of a long identical run after a uniform shift with no anchor', () => {
    const turns = Array.from(
      { length: 500 },
      (_, index) => ['continue', 100 * (index + 1)] as const,
    );
    const known = merge([], turns);
    const ids = known.map((marker) => marker.id);

    const next = merge(
      known,
      turns.map(([summary, center]) => [summary, center + 100] as const),
    );

    expect(next.map((marker) => marker.id)).toEqual(ids);
  });

  it.each([5_000, 4_999, 3_000])(
    'reads a bounded number of remembered positions for %i identical turns against 5000',
    (mountedCount) => {
      const known = merge(
        [],
        Array.from({ length: 5_000 }, () => ['continue', 0] as const),
      );
      let reads = 0;
      for (const marker of known) {
        let center = marker.center;
        Object.defineProperty(marker, 'center', {
          configurable: true,
          get: () => {
            reads += 1;
            return center;
          },
          set: (value: number) => {
            center = value;
          },
        });
      }

      const next = merge(
        known,
        Array.from({ length: mountedCount }, () => ['continue', 100] as const),
      );

      expect(reads).toBeLessThan(50 * known.length);
      // Every mounted turn is one of the remembered ones.
      expect(next).toHaveLength(known.length);
    },
  );

  it('files a window mounted deep in a long identical run by position', () => {
    const known = merge(
      [],
      Array.from({ length: 700 }, (_, index) => ['continue', 100 * (index + 1)] as const),
    );
    const ids = known.map((marker) => marker.id);
    const window = render(
      Array.from({ length: 400 }, (_, r) => ['continue', 100 * (300 + r + 1)] as const),
    );

    const next = mergeMountedTurns(known, window, (element) => centers.get(element) ?? 0);

    expect(next.map((marker) => marker.id)).toEqual(ids);
    expect(window.map((turn) => turn.element.getAttribute('data-gv-turn-id'))).toEqual(
      ids.slice(300),
    );
  });

  it('keeps other texts in place when a long mixed run remounts shifted without one turn', () => {
    const turns: Array<readonly [string, number]> = [
      ['A', 100],
      ['B', 200],
      ['B', 300],
      ['A', 400],
      ...Array.from({ length: 1_000 }, (_, index) => ['C', 500 + 100 * index] as const),
    ];
    const known = merge([], turns);
    const ids = known.map((marker) => marker.id);
    // The second A is not mounted; everything else moved down 300px.
    const window = render(
      turns.filter((_, index) => index !== 3).map(([text, center]) => [text, center + 300]),
    );

    const next = mergeMountedTurns(known, window, (element) => centers.get(element) ?? 0);

    expect(next.map((marker) => marker.id)).toEqual(ids);
    expect(window.map((turn) => turn.element.getAttribute('data-gv-turn-id'))).toEqual(
      ids.filter((_, index) => index !== 3),
    );
  });

  /**
   * 700 identical prompts measured at 100px steps, then all but `stale`
   * re-measured in a later pass at `remeasured(index)`.
   */
  function longRunWithStale(
    stale: readonly number[],
    remeasured: (index: number) => number,
  ): Marker[] {
    const known = mergeMountedTurns(
      [],
      render(Array.from({ length: 700 }, (_, index) => ['continue', 100 * (index + 1)] as const)),
      (element) => centers.get(element) ?? 0,
    );
    known.forEach((marker, index) => {
      marker.measuredAt = 1;
      if (stale.includes(index)) return;
      marker.center = remeasured(index);
      marker.measuredAt = 2;
    });
    return known;
  }

  function filedIds(known: Marker[], window: Mounted[]): Array<string | null> {
    mergeMountedTurns(known, window, (element) => centers.get(element) ?? 0);
    return window.map((turn) => turn.element.getAttribute('data-gv-turn-id'));
  }

  it('files a deep window by position past a stale centre that lags behind', () => {
    // Content above grew by 50px before the re-measure; turn 350 kept its old place.
    const known = longRunWithStale([350], (index) => 100 * (index + 1) + 50);
    known[350].center = 0;
    const ids = known.map((marker) => marker.id);
    const window = render(
      Array.from({ length: 400 }, (_, r) => ['continue', 100 * (300 + r + 1) + 50] as const),
    );

    expect(filedIds(known, window)).toEqual(ids.slice(300));
  });

  it('files a deep window by position past a stale centre that runs ahead', () => {
    const known = longRunWithStale([1], (index) => 100 * (index + 1));
    known[1].center = 100_000;
    const ids = known.map((marker) => marker.id);
    const window = render(
      Array.from({ length: 400 }, (_, r) => ['continue', 100 * (300 + r + 1)] as const),
    );

    expect(filedIds(known, window)).toEqual(ids.slice(300));
  });

  it('files the top of a long run by its fresh centres past a stale block below', () => {
    // An answer near the top grew by 40000px; only the first 300 turns were re-measured.
    const known = longRunWithStale(
      Array.from({ length: 400 }, (_, r) => 300 + r),
      (index) => 100 * (index + 1) + 40_000,
    );
    const ids = known.map((marker) => marker.id);
    const window = render(
      Array.from({ length: 400 }, (_, r) => ['continue', 100 * (r + 1) + 40_000] as const),
    );

    expect(filedIds(known, window)).toEqual(ids.slice(0, 400));
  });

  it('keeps every id when the first turn of a mixed run unmounts as a new one arrives', () => {
    const turns = Array.from(
      { length: 600 },
      (_, index) => [index % 2 ? 'B' : 'A', 100 * (index + 1)] as const,
    );
    const known = merge([], turns);
    const ids = known.map((marker) => marker.id);
    const window = render([...turns.slice(1), ['A', 60_100]]);

    const next = mergeMountedTurns(known, window, (element) => centers.get(element) ?? 0);

    expect(next).toHaveLength(601);
    const filed = window.map((turn) => turn.element.getAttribute('data-gv-turn-id'));
    expect(filed.slice(0, -1)).toEqual(ids.slice(1));
    expect(ids).not.toContain(filed[filed.length - 1]);
  });

  it('adds a turn loaded above a mixed run without shifting the run', () => {
    const turns = Array.from(
      { length: 600 },
      (_, index) => [index % 2 ? 'B' : 'A', 100 * (index + 1)] as const,
    );
    const known = merge([], turns);
    const ids = known.map((marker) => marker.id);
    const window = render([['B', 50], ...turns]);

    const next = mergeMountedTurns(known, window, (element) => centers.get(element) ?? 0);

    expect(next).toHaveLength(601);
    const filed = window.map((turn) => turn.element.getAttribute('data-gv-turn-id'));
    expect(filed.slice(1)).toEqual(ids);
    expect(ids).not.toContain(filed[0]);
  });

  it('does not file a turn under a far-off remembered centre that is out of order', () => {
    const known = merge(
      [],
      Array.from(
        { length: 700 },
        (_, index) =>
          ['continue', index === 0 ? 0 : index === 1 ? 1_000 : 100 * (index - 1)] as const,
      ),
    );
    const ids = known.map((marker) => marker.id);
    const window = render(
      Array.from({ length: 400 }, (_, r) => ['continue', 150 + 100 * r] as const),
    );

    const next = mergeMountedTurns(known, window, (element) => centers.get(element) ?? 0);

    expect(next).toHaveLength(700);
    const filed = window.map((turn) => ids.indexOf(turn.element.getAttribute('data-gv-turn-id')!));
    expect(filed[0]).not.toBe(1);
    expect(filed.every((index, r) => index >= 0 && (r === 0 || index > filed[r - 1]))).toBe(true);
  });

  it('keeps a genuinely new repeat as a new turn after its twin', () => {
    const known = merge([], [['continue', 100]]);

    const next = merge(known, [
      ['continue', 100],
      ['continue', 500],
    ]);

    expect(next).toHaveLength(2);
    expect(next[0].id).toBe(known[0].id);
  });
});
