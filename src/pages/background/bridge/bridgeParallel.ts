/**
 * The person's switch for bridge jobs side by side (`StorageKeys.BRIDGE_PARALLEL`
 * in storage.local). Off unless they turned it on in the popup: the bridge then
 * runs one job at a time, as it always did.
 */
import { StorageKeys } from '@/core/types/common';

import type { StorageAreaLike } from './bridgeTaskStore';

const KEY = StorageKeys.BRIDGE_PARALLEL;

/** False when unset or unreadable: a failed read never lets more jobs in. */
export async function readBridgeParallel(local: StorageAreaLike): Promise<boolean> {
  try {
    return (await local.get(KEY))[KEY] === true;
  } catch {
    return false;
  }
}

export async function writeBridgeParallel(local: StorageAreaLike, enabled: boolean): Promise<void> {
  if (enabled) await local.set({ [KEY]: true });
  else await local.remove(KEY);
}
