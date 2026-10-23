/**
 * How many Local Bridge jobs the person lets run side by side, shared by the
 * popup control and the background (`StorageKeys.BRIDGE_PARALLEL_JOBS`).
 */
export const MIN_PARALLEL_JOBS = 2;
/** Each job works in its own ChatGPT tab, a few hundred MB each. */
export const MAX_PARALLEL_JOBS = 10;
export const DEFAULT_PARALLEL_JOBS = 3;

/** The stored count within range; anything unreadable is the default. */
export function clampParallelJobs(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_PARALLEL_JOBS;
  return Math.min(MAX_PARALLEL_JOBS, Math.max(MIN_PARALLEL_JOBS, Math.round(value)));
}

/** A count the person may choose: a whole number within range. */
export function isParallelJobs(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= MIN_PARALLEL_JOBS &&
    value <= MAX_PARALLEL_JOBS
  );
}
