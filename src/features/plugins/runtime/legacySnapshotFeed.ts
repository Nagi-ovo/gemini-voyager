/**
 * The legacy settings a packaged official plugin's on/off follows, as one
 * page's `PluginHost` sees them, and the rule that combines them with
 * admission.
 *
 * The feed subscribes before it reads and lays every change seen meanwhile
 * over the read, so a late initial read never undoes a newer toggle (a
 * deletion included). The read runs beside the host's own start-up instead of
 * on its operation chain, so plugins without a legacy binding (local CSS,
 * reversible DOM tweaks) never wait for it. Until it lands the snapshot is
 * `null`, and a bound plugin does not run: its default must not be guessed
 * from an empty snapshot, nor from a read that failed because the extension
 * context is gone.
 *
 * `phase()` tells "still reading" from "will never know". A failed read (in
 * production only an invalidated extension context rejects; any other storage
 * error already reads as "all keys missing") leaves the snapshot `null` for
 * good: bound plugins stay off, and the feed reports `failed` so nothing keeps
 * waiting on them.
 */
import { logger } from '@/core/services/LoggerService';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import {
  type LegacySettingSnapshot,
  legacyBindingFor,
  loadLegacySettingSnapshot,
  resolveEffectiveEnabled,
  subscribeLegacySettings,
} from '../storage/legacySettingBindings';
import type { PluginStateMap } from '../storage/pluginState';
import type { OfficialAdmission } from './officialAdmission';

export interface LegacySettingsSource {
  load(): Promise<LegacySettingSnapshot>;
  subscribe(callback: (changed: LegacySettingSnapshot) => void): () => void;
}

export const DEFAULT_LEGACY_SETTINGS: LegacySettingsSource = {
  load: loadLegacySettingSnapshot,
  subscribe: subscribeLegacySettings,
};

/**
 * loading  the initial read is in flight
 * loaded   the snapshot is known and follows every later change
 * failed   the read rejected; the snapshot stays null for this feed's life
 * none     no feed (a page off Gemini / AI Studio): no snapshot to wait for
 */
export type LegacyReadPhase = 'loading' | 'loaded' | 'failed' | 'none';

export interface LegacySnapshotFeed {
  /** The merged snapshot, or null until the initial read has landed (for good after a failure). */
  current(): LegacySettingSnapshot | null;
  phase(): LegacyReadPhase;
  stop(): void;
}

/**
 * Subscribe, then start the initial read without waiting for it. `onChange`
 * runs once when that read lands or fails, and after every change merged into
 * the snapshot; nothing runs after `stop()`.
 */
export function openLegacySnapshotFeed(
  source: LegacySettingsSource,
  onChange: () => void,
): LegacySnapshotFeed {
  let stopped = false;
  let touched: Record<string, unknown> = {};
  let snapshot: LegacySettingSnapshot | null = null;
  let phase: LegacyReadPhase = 'loading';
  const unsubscribe = source.subscribe((changed) => {
    if (stopped) return;
    touched = { ...touched, ...changed };
    if (snapshot) snapshot = { ...snapshot, ...changed };
    onChange();
  });
  void source.load().then(
    (loaded) => {
      if (stopped) return;
      snapshot = { ...loaded, ...touched };
      phase = 'loaded';
      onChange();
    },
    (error: unknown) => {
      if (stopped) return;
      // A failed read is no missing key: the snapshot stays null, bound plugins
      // stay off, and whoever waited for it is released by this change.
      phase = 'failed';
      if (!isExtensionContextInvalidatedError(error)) {
        logger.warn('Legacy plugin switches could not be read', { error: String(error) });
      }
      onChange();
    },
  );
  return {
    current: () => snapshot,
    phase: () => phase,
    stop() {
      stopped = true;
      unsubscribe();
    },
  };
}

/**
 * Whether plugin `id` may run on this page, as far as the user's wish and the
 * content script's admission go. A bound official plugin follows its legacy
 * key and never runs before that key has been read; every other plugin
 * follows its plugin-state entry.
 */
export function isPluginWanted(
  state: PluginStateMap,
  legacy: LegacySettingSnapshot | null,
  admission: OfficialAdmission,
  id: string,
): boolean {
  if (admission.stateOf(id) !== 'admitted') return false;
  if (legacyBindingFor(id) && legacy === null) return false;
  return resolveEffectiveEnabled(state, legacy ?? {}, id);
}
