/**
 * The parts of `PluginHost.reconcile` that decide, rather than act: whether a
 * plugin runs, reserves its resources, or stays off as far as the user's wish
 * and the admission go, and the status of a plugin the page keeps off.
 */
import { type FeatureOwner, ownedFeatureByPluginId } from '../sites/featureOwners';
import { type LegacySettingSnapshot, legacyBindingFor } from '../storage/legacySettingBindings';
import type { PluginStateMap } from '../storage/pluginState';
import type { PluginManifest } from '../types';
import { type LegacyReadPhase, isPluginWanted } from './legacySnapshotFeed';
import type { OfficialAdmission } from './officialAdmission';
import type { PluginBlockedReason, PluginStatus } from './pluginStatus';

/**
 * run      wanted and admitted
 * reserve  would run but for an admission still pending: holds its resources
 *          in arbitration, never mounts
 * await    a plugin-owned official plugin whose legacy switch is still being
 *          read: whether it runs is unknown, so plugins needing its runtimes
 *          wait (`pending`) instead of taking them first; never mounts
 * skip     off
 */
export type WishVerdict = 'run' | 'reserve' | 'await' | 'skip';

const ADMITTED: OfficialAdmission = {
  stateOf: () => 'admitted',
  subscribe: () => () => {},
};

export interface WishInput {
  readonly state: PluginStateMap;
  /** The legacy switches official plugins follow; null until read (or for good, after a failed read). */
  readonly legacy: LegacySettingSnapshot | null;
  /** Whether that read is still in flight; `failed` and `none` never become a snapshot. */
  readonly legacyPhase: LegacyReadPhase;
  readonly admission: OfficialAdmission;
  readonly ownerOf?: (id: string) => FeatureOwner | null;
}

const ownerFromTable = (pluginId: string): FeatureOwner | null =>
  ownedFeatureByPluginId(pluginId)?.owner ?? null;

/**
 * The user's wish combined with the content script's admission. A
 * legacy-owned official plugin never runs, whatever its admission says: the
 * native module runs that feature, and `getStatuses` leaves the plugin out, so
 * mounting it would be both a double start and invisible. Only a plugin-owned
 * official feature may reserve or await (an id outside the owner table has no
 * admission to wait for). It reserves once its legacy switch has been read and
 * is on, and awaits while that read is in flight. The caller still checks the
 * page, host policy, compatibility and entitlement for `run`, `reserve` and
 * `await`.
 */
export function wishVerdict(input: WishInput, id: string): WishVerdict {
  const { state, legacy, admission } = input;
  const ownerOf = input.ownerOf ?? ownerFromTable;
  const owner = ownerOf(id);
  if (owner === 'legacy') return 'skip';
  const admissionState = admission.stateOf(id);
  if (admissionState === 'denied') return 'skip';
  const ownedByPlugin = owner === 'plugin';
  if (legacy === null && legacyBindingFor(id)) {
    // A failed read never turns into "missing key, default on": the plugin
    // stays off, and nobody waits for a snapshot that will not come.
    return ownedByPlugin && input.legacyPhase === 'loading' ? 'await' : 'skip';
  }
  if (admissionState === 'admitted') {
    return isPluginWanted(state, legacy, admission, id) ? 'run' : 'skip';
  }
  if (!ownedByPlugin) return 'skip';
  return isPluginWanted(state, legacy, ADMITTED, id) ? 'reserve' : 'skip';
}

export interface PluginBlock {
  readonly reason: PluginBlockedReason;
  readonly by?: string;
}

export function blockedStatus(
  manifest: PluginManifest,
  block: PluginBlock,
  extra: Partial<PluginStatus> = {},
): PluginStatus {
  return {
    id: manifest.id,
    version: manifest.version,
    ...extra,
    kind: 'blocked',
    blockedReason: block.reason,
    ...(block.by ? { blockedBy: block.by } : {}),
  };
}
