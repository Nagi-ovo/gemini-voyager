/**
 * The write-backs a migrated official plugin keeps from its native module,
 * while it runs: storing an old value in its current form (a px width as a
 * percent) or recording a switch the host derived as on.
 *
 * A feature supplies the sync keys it rewrites and a pure `plan`; this owns
 * the flow. Every check re-reads storage and writes only what `plan` says is
 * still needed, so a value the popup stored meanwhile wins. A newer check (a
 * live change to one of the keys, or `recheck` after a host settings update)
 * voids every read still out: only the latest read may write. Nothing is
 * written once the scope is disposed or the extension context is gone, and
 * the host never waits on these writes.
 *
 * `firstRead` is true only for the activation's first check, and only while
 * nothing has superseded it. A switch derived on is a decision the host made
 * from the storage it read at mount; the plan may record it only then. A live
 * removal or `false` while the host has not yet torn the plugin down must
 * never be read as "never stored" and turned back on.
 *
 * A revision counter rather than `startMachine`: there is one phase (a read
 * in flight) and every change restarts it, the same-state restart the state
 * machine runtime does not model (`.github/docs/STATE_MACHINE_PLAN.md` §3).
 */
import { logger } from '@/core/services/LoggerService';
import {
  hasValidExtensionContext,
  isExtensionContextInvalidatedError,
} from '@/core/utils/extensionContext';

import type { PluginScope } from './pluginScope';

export interface LegacyWriteBackCheck {
  /** Whether this is the activation's first, unsuperseded read. */
  readonly firstRead: boolean;
}

export interface LegacyWriteBackOptions {
  /** The sync keys `plan` reads and may rewrite; a live change to any starts a new check. */
  readonly keys: readonly string[];
  /** Pure: the writes `stored` still needs, or null. */
  readonly plan: (
    stored: Readonly<Record<string, unknown>>,
    check: LegacyWriteBackCheck,
  ) => Record<string, unknown> | null;
  /** Names the feature in the warning a failed write logs. */
  readonly label: string;
}

export interface LegacyWriteBack {
  /** Check again, voiding any read still out: call it when the host updates the settings. */
  recheck(): void;
}

type StorageChanges = Record<string, chrome.storage.StorageChange>;

function chromeStorage(): typeof chrome.storage | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome?.storage;
}

/** Start the write-backs for `scope`, with a first check now; they end with the scope. */
export function startLegacyWriteBack(
  scope: PluginScope,
  options: LegacyWriteBackOptions,
): LegacyWriteBack {
  let revision = 0;
  const check = async (): Promise<void> => {
    const mine = ++revision;
    const sync = chromeStorage()?.sync;
    if (!sync || scope.isDisposed || !hasValidExtensionContext()) return;
    try {
      const stored = await sync.get<Record<string, unknown>>([...options.keys]);
      if (mine !== revision || scope.isDisposed || !hasValidExtensionContext()) return;
      const writes = options.plan(stored ?? {}, { firstRead: mine === 1 });
      if (writes) await sync.set(writes);
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) return;
      logger.warn(`${options.label} settings could not be normalized`, { error: String(error) });
    }
  };

  const onChanged = chromeStorage()?.onChanged;
  if (onChanged) {
    // Faster than the host's update, and the only path for the switch, which never reaches it.
    scope.onChromeEvent(onChanged, (changes: StorageChanges, areaName: string) => {
      if (scope.isDisposed || areaName !== 'sync') return;
      if (options.keys.some((key) => key in changes)) void check();
    });
  }

  void check();
  return {
    recheck() {
      if (!scope.isDisposed) void check();
    },
  };
}
