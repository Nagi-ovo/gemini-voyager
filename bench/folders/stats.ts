/** Sample statistics and result shapes shared by the node and browser runners. */

/** A task longer than this blocks input visibly; the Long Tasks API uses the same bar. */
export const LONG_TASK_MS = 50;

export interface Stats {
  readonly runs: number;
  readonly p50: number;
  readonly p95: number;
  readonly mean: number;
  readonly min: number;
  readonly max: number;
}

export interface BenchResult {
  /** Surface or data area, e.g. `gemini-sidebar` or `data`. */
  readonly surface: string;
  readonly dataset: string;
  /** What was measured, e.g. `mount (all expanded)`. */
  readonly metric: string;
  readonly stats: Stats | null;
  /** Long tasks (> 50 ms) the browser reported while this metric ran; `null` in node. */
  readonly longTasks: number | null;
  /** Samples over 50 ms, the node stand-in for long tasks. */
  readonly samplesOver50ms: number;
  /** Elements rendered by the surface after mount, shadow roots included. */
  readonly domElements?: number;
  /** Why a metric has no numbers, e.g. the surface has no search. */
  readonly note?: string;
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return Number.NaN;
  // Nearest-rank: the smallest sample with at least p% of samples at or below it.
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1];
}

export function computeStats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  return {
    runs: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    mean: sorted.length ? sum / sorted.length : Number.NaN,
    min: sorted[0] ?? Number.NaN,
    max: sorted[sorted.length - 1] ?? Number.NaN,
  };
}

export function countOver(samples: readonly number[], limit = LONG_TASK_MS): number {
  return samples.filter((sample) => sample > limit).length;
}

/** Iteration counts that keep a full run within a few minutes on a laptop. */
export function runsFor(dataset: string, small: number, big: number): number {
  return dataset === 'large' ? big : small;
}
