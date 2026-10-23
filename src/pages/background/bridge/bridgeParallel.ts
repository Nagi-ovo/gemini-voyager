/**
 * The person's choice for bridge jobs side by side, in storage.local: the switch
 * (`StorageKeys.BRIDGE_PARALLEL`) and how many jobs at once
 * (`StorageKeys.BRIDGE_PARALLEL_JOBS`). Off unless they turned it on in the popup:
 * the bridge then runs one job at a time, as it always did. The count is kept
 * while the switch is off, so turning it back on restores it.
 */
import { StorageKeys } from '@/core/types/common';
import {
  MAX_PARALLEL_JOBS,
  MIN_PARALLEL_JOBS,
  clampParallelJobs,
  isParallelJobs,
} from '@/features/bridge/parallelJobs';

import type { StorageAreaLike } from './bridgeTaskStore';

const SWITCH = StorageKeys.BRIDGE_PARALLEL;
const JOBS = StorageKeys.BRIDGE_PARALLEL_JOBS;

export interface BridgeParallelSetting {
  readonly enabled: boolean;
  /** Jobs at once while enabled, within `MIN_PARALLEL_JOBS`–`MAX_PARALLEL_JOBS`. */
  readonly jobs: number;
}

/** Off when unset or unreadable: a failed read never lets more jobs in. */
export async function readBridgeParallel(local: StorageAreaLike): Promise<BridgeParallelSetting> {
  try {
    const stored = await local.get([SWITCH, JOBS]);
    return { enabled: stored[SWITCH] === true, jobs: clampParallelJobs(stored[JOBS]) };
  } catch {
    return { enabled: false, jobs: clampParallelJobs(undefined) };
  }
}

/** Jobs the bridge admits at once: the chosen count while the switch is on, else one. */
export const parallelJobsOf = (setting: BridgeParallelSetting): number =>
  setting.enabled ? setting.jobs : 1;

export type BridgeParallelChange = Partial<BridgeParallelSetting>;

export const PARALLEL_CHANGE_RULE = `enabled must be a boolean and jobs a whole number from ${MIN_PARALLEL_JOBS} to ${MAX_PARALLEL_JOBS}.`;

/** The popup's change, or null when it names nothing valid to change. */
export function parseParallelChange(enabled: unknown, jobs: unknown): BridgeParallelChange | null {
  if (enabled === undefined && jobs === undefined) return null;
  if (enabled !== undefined && typeof enabled !== 'boolean') return null;
  if (jobs !== undefined && !isParallelJobs(jobs)) return null;
  return {
    ...(enabled !== undefined ? { enabled } : {}),
    ...(jobs !== undefined ? { jobs } : {}),
  };
}

export async function writeBridgeParallel(
  local: StorageAreaLike,
  change: BridgeParallelChange,
): Promise<void> {
  if (change.jobs !== undefined) await local.set({ [JOBS]: change.jobs });
  if (change.enabled === true) await local.set({ [SWITCH]: true });
  else if (change.enabled === false) await local.remove(SWITCH);
}
