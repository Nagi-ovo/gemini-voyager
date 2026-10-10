/** Queue-scoped recovery and retry of an open bundle (addendum P3P4 R3.6). */
import { storedItemBytes } from '@/features/storage/storageBudget';
import type { Serialize } from '@/features/storage/writeQueue';

import type { FolderAuthority } from './authority';
import { BUNDLE_INTENT_KEY, isOpenStatus, resolveBundleIntent } from './bundleIntent';
import { createBundleSpaceRelease } from './bundleRelease';
import type { FolderSite } from './folderOwnerPolicy';
import type { FolderOwnerStorageArea } from './folderOwnerState';
import { hasOwnerSite } from './ownerStartup';

export const BUNDLE_RETRY_MS = 60_000;

interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export interface BundleRecoveryOptions {
  area: FolderOwnerStorageArea;
  authority: Readonly<Record<FolderSite, FolderAuthority>>;
  serialize: Serialize;
  subscribe: (
    listener: (changes: Record<string, StorageChange>, areaName: string) => void,
  ) => () => void;
  /** One-shot wake-up after `ms`; returns its cancel. */
  setTimer: (run: () => void, ms: number) => () => void;
  /** Must succeed before resolution writes an open bundle; a failure blocks and retries like a stuck one. */
  fence?: () => Promise<void>;
}

const bytes = (key: string, value: unknown) =>
  value === undefined ? 0 : storedItemBytes(key, value);

export function createBundleRecovery(options: BundleRecoveryOptions) {
  let stopped = true;
  let blocked = false;
  let retrying: Promise<void> | null = null;
  let retryAgain = false;
  let cancelTimer: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  // One release per stuck bundle: the turns that wait on it would otherwise rescan storage each time.
  let release: { txId: string; run: () => Promise<boolean> } | null = null;

  function releaseFor(txId: string, participants: string[]) {
    if (release?.txId !== txId) {
      release = {
        txId,
        run: createBundleSpaceRelease(options.area, options.authority, participants),
      };
    }
    return release.run;
  }

  function clearTimer() {
    cancelTimer?.();
    cancelTimer = null;
  }

  function armTimer() {
    if (stopped || !blocked || cancelTimer) return;
    cancelTimer = options.setTimer(() => {
      cancelTimer = null;
      retry();
    }, BUNDLE_RETRY_MS);
  }

  async function resolve(readKeys?: readonly string[]) {
    let open = false;
    const result = await resolveBundleIntent(options.area, options.authority, Date.now, {
      readKeys,
      fence: options.fence,
      releaseFor,
      onBlocked: () => (open = true),
    });
    blocked = open || result !== 'ok';
    if (blocked) armTimer();
    else clearTimer();
    return result;
  }

  function retry() {
    if (stopped) return;
    if (retrying) {
      retryAgain = true;
      return;
    }
    clearTimer();
    // A no-read turn skips its prelude; recovery runs once here, never recursively in the queue.
    retrying = options
      .serialize(async () => {
        if (!stopped) await resolve();
      }, [])
      // The failure is kept as `blocked`; the next signal or the timer retries it.
      .catch(() => undefined)
      .finally(() => {
        retrying = null;
        const again = retryAgain;
        retryAgain = false;
        if (again && blocked) retry();
      });
  }

  return {
    async prelude(readKeys: readonly string[] | undefined): Promise<void> {
      if (stopped || readKeys?.length === 0) return;
      const result = await resolve(readKeys);
      if (result !== 'ok') throw new Error(`Folder bundle resolution: ${result}`);
    },
    start(): void {
      if (!stopped || !hasOwnerSite(options.authority)) return;
      stopped = false;
      unsubscribe = options.subscribe((changes, areaName) => {
        if (areaName !== 'local') return;
        if (isOpenStatus(changes[BUNDLE_INTENT_KEY]?.newValue)) {
          retry();
          return;
        }
        if (!blocked) return;
        const delta = Object.entries(changes).reduce(
          (sum, [key, change]) => sum + bytes(key, change.newValue) - bytes(key, change.oldValue),
          0,
        );
        if (delta < 0) retry();
      });
      retry();
    },
    stop(): void {
      stopped = true;
      clearTimer();
      unsubscribe?.();
      unsubscribe = null;
      retryAgain = false;
    },
  };
}
