import type { StopNativeFeature } from '../featureLifecycle';
import { restartWatermarkRemover, startWatermarkRemover, stopWatermarkRemover } from './index';

let currentRun: symbol | null = null;

/**
 * Start the watermark remover and hand back its stop at once, while the
 * settings read and engine load continue in the background.
 *
 * The stop must exist before the engine loads: a content script retired during
 * that wait has to invalidate its generation right then. A stop handed back
 * only after the load would run after the successor started and, working on
 * the shared bridge, intent and indicator ids, switch the successor's download
 * runtime off. Storage changes go through `restartWatermarkRemoverFeature`.
 */
export function startWatermarkRemoverFeature(): StopNativeFeature {
  const run = Symbol('watermark-remover');
  currentRun = run;
  void startWatermarkRemover();
  return () => {
    // A stale stop must not tear down a newer start of this same runtime.
    if (currentRun !== run) return;
    currentRun = null;
    stopWatermarkRemover();
  };
}

/**
 * Apply a watermark setting change to the running feature. Before its start and
 * after its stop this does nothing: a restart would re-attach the bridge
 * observer, download tracking and indicators that the stop just removed.
 */
export function restartWatermarkRemoverFeature(): Promise<void> {
  if (currentRun === null) return Promise.resolve();
  return restartWatermarkRemover();
}
