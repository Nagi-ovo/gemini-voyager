import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type LegacySettingSnapshot,
  subscribeLegacySettings,
} from '@/features/plugins/storage/legacySettingBindings';

/** A value the user chose that the live snapshot may not show yet. */
interface PendingValue {
  readonly value: unknown;
  readonly revision: number;
  /** How many change events the key had seen when the write started. */
  readonly startedAtChange: number;
  readonly landed: boolean;
}

type PendingValues = Readonly<Record<string, PendingValue>>;
type ChangeCounts = Readonly<Record<string, number>>;

function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function withoutKey(values: PendingValues, key: string): PendingValues {
  return Object.fromEntries(Object.entries(values).filter(([candidate]) => candidate !== key));
}

export interface LegacyPreferenceWritesOptions {
  /** The popup's live snapshot of the legacy keys. */
  readonly legacy: LegacySettingSnapshot;
  /** Resolves whether the sync write landed. */
  readonly write: (payload: Record<string, unknown>) => Promise<boolean>;
  /** Change events for the legacy keys; a test seam. */
  readonly subscribe?: (callback: (changed: LegacySettingSnapshot) => void) => () => void;
}

/**
 * Show a legacy key's new value as soon as the user picks it, and settle it
 * against what storage then says, per key and per write:
 * - a failed write drops the value, so the stored one shows again;
 * - a landed write drops it once the snapshot holds it, at once for a no-op
 *   write that raises no change event;
 * - otherwise a landed write gives way to the snapshot as soon as the key has
 *   changed since the write started (a restore, another window, even back to
 *   the old value), whether that change came before or after its receipt;
 * - a newer write to the same key supersedes an older one still in flight.
 * Waiting for a change event alone would leave a no-op or failed write
 * covering the stored value for the popup's whole life, and comparing values
 * alone would miss a restore back to the value the write replaced.
 */
export function useLegacyPreferenceWrites({
  legacy,
  write,
  subscribe = subscribeLegacySettings,
}: LegacyPreferenceWritesOptions) {
  const [pending, setPending] = useState<PendingValues>({});
  const [changeCounts, setChangeCounts] = useState<ChangeCounts>({});
  const revision = useRef(0);
  // Read when a write starts, from an event handler between renders.
  const changeCountsNow = useRef<ChangeCounts>({});

  useEffect(
    () =>
      subscribe((changed) => {
        const next: Record<string, number> = { ...changeCountsNow.current };
        for (const key of Object.keys(changed)) next[key] = (next[key] ?? 0) + 1;
        changeCountsNow.current = next;
        setChangeCounts(next);
      }),
    [subscribe],
  );

  useEffect(() => {
    setPending((current) => {
      let next = current;
      for (const [key, entry] of Object.entries(current)) {
        if (!entry.landed) continue;
        const stored = Object.hasOwn(legacy, key) ? legacy[key] : undefined;
        // Counted from the write's start: a restore that beat a late receipt must still win.
        if (sameValue(stored, entry.value) || (changeCounts[key] ?? 0) !== entry.startedAtChange) {
          next = withoutKey(next, key);
        }
      }
      return next;
    });
  }, [legacy, pending, changeCounts]);

  const writePreference = useCallback(
    (payload: Readonly<Record<string, unknown>>): void => {
      const keys = Object.keys(payload);
      if (keys.length === 0) return;
      const own = ++revision.current;
      setPending((current) => {
        const next: Record<string, PendingValue> = { ...current };
        for (const key of keys) {
          next[key] = {
            value: payload[key],
            revision: own,
            startedAtChange: changeCountsNow.current[key] ?? 0,
            landed: false,
          };
        }
        return next;
      });
      void write({ ...payload })
        .catch(() => false)
        .then((landed) => {
          setPending((current) => {
            let next = current;
            for (const key of keys) {
              const entry = current[key];
              // A newer write to this key owns its settlement.
              if (!entry || entry.revision !== own) continue;
              next = landed
                ? { ...next, [key]: { ...entry, landed: true } }
                : withoutKey(next, key);
            }
            return next;
          });
        });
    },
    [write],
  );

  const shown = useMemo<LegacySettingSnapshot>(() => {
    const entries = Object.entries(pending);
    if (entries.length === 0) return legacy;
    return { ...legacy, ...Object.fromEntries(entries.map(([key, entry]) => [key, entry.value])) };
  }, [legacy, pending]);

  return { legacy: shown, writePreference };
}
