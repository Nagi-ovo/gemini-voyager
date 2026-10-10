import { type BenchResult, computeStats, countOver } from '../stats';
import { countLongTasks, measureInteraction } from './timing';

export interface MetricPlan<S> {
  readonly surface: string;
  readonly dataset: string;
  readonly metric: string;
  readonly runs: number;
  readonly warmup?: number;
  /** Builds untimed state for one run. */
  readonly setup: (run: number) => S | Promise<S>;
  /** The timed interaction. */
  readonly action: (state: S, run: number) => unknown | Promise<unknown>;
  /** Untimed, after the interaction; returns the element count to report, if any. */
  readonly after?: (state: S, run: number) => number | void | Promise<number | void>;
  readonly teardown?: (state: S, run: number) => void | Promise<void>;
}

export async function collect<S>(plan: MetricPlan<S>): Promise<BenchResult> {
  const samples: number[] = [];
  const windows: (readonly [number, number])[] = [];
  let domElements: number | undefined;
  const warmup = plan.warmup ?? 1;
  for (let run = 0; run < warmup + plan.runs; run++) {
    const state = await plan.setup(run);
    try {
      const timed = await measureInteraction(() => plan.action(state, run));
      const count = await plan.after?.(state, run);
      if (run >= warmup) {
        samples.push(timed.busy);
        windows.push(timed.window);
        if (typeof count === 'number') domElements = count;
      }
    } finally {
      await plan.teardown?.(state, run);
    }
  }
  return {
    surface: plan.surface,
    dataset: plan.dataset,
    metric: plan.metric,
    stats: computeStats(samples),
    longTasks: await countLongTasks(windows),
    samplesOver50ms: countOver(samples),
    ...(domElements === undefined ? {} : { domElements }),
  };
}

export function notApplicable(
  surface: string,
  dataset: string,
  metric: string,
  note: string,
): BenchResult {
  return { surface, dataset, metric, stats: null, longTasks: null, samplesOver50ms: 0, note };
}
