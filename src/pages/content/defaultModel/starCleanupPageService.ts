import { StorageKeys } from '@/core/types/common';

import type { StopNativeFeature } from '../featureLifecycle';
import { startStaleStarSweeper } from './defaultStars';

/** Permanent off-state compatibility cleanup; the plugin alone owns model picking and new stars. */
export function startDefaultModelStarCleanupPageService(): StopNativeFeature {
  let stopped = false;
  let revision = 0;
  let stopSweeper: (() => void) | null = null;
  const key = StorageKeys.DEFAULT_MODEL_AUTO_APPLY;
  const apply = (enabled: boolean): void => {
    if (stopped) return;
    if (enabled) {
      stopSweeper?.();
      stopSweeper = null;
    } else {
      stopSweeper ??= startStaleStarSweeper();
    }
  };
  const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string): void => {
    if (stopped || area !== 'sync' || !Object.hasOwn(changes, key)) return;
    revision += 1;
    apply(changes[key].newValue !== false);
  };
  const onChanged = chrome.storage?.onChanged;
  onChanged?.addListener(onChange);
  const readRevision = revision;
  void (async () => {
    try {
      const stored = await chrome.storage?.sync?.get(key);
      // An old off snapshot must not start sweeping the stars of a newly enabled plugin.
      if (stopped || revision !== readRevision) return;
      apply(stored?.[key] !== false);
    } catch {
      // A missing or unreadable switch historically leaves default model enabled.
    }
  })();
  const stop = (): void => {
    if (stopped) return;
    stopped = true;
    try {
      onChanged?.removeListener(onChange);
    } finally {
      stopSweeper?.();
      stopSweeper = null;
    }
  };
  return stop;
}
