/**
 * Start permission for the packaged official plugins of one content-script
 * instance.
 *
 * A packaged official plugin replaces a native Voyager module, and that module
 * only ever started after the content script's own checks (custom-website
 * coverage, Gemini Enterprise, AI Studio's page scope) and its background-tab
 * delay. Rather than copy those checks into `PluginHost`, the content script
 * admits the plugin at the point where the native module used to start; the
 * host mounts it no earlier than that. Admission is a time floor, not an
 * ordering promise: it does not wait for the features started before it.
 *
 * Every owner-table id starts `pending`. `admit` moves one to `admitted`;
 * `close` (initialization finished, or this instance retired) turns whatever
 * is still pending into `denied`, and is final: no later `admit`, including a
 * continuation that resolves after teardown, can revive it. Ids outside the
 * owner table are not governed here and always read `admitted`.
 */
import {
  FEATURE_OWNERS,
  SHARED_FEATURE_OWNERS,
  type OwnedFeature,
  type OwnedFeatureId,
  type PackagedSiteId,
} from '../sites/featureOwners';

export type AdmissionState = 'pending' | 'admitted' | 'denied';

export interface OfficialAdmission {
  stateOf(pluginId: string): AdmissionState;
  /** Called after any state change; returns the unsubscribe. */
  subscribe(listener: () => void): () => void;
}

export interface OfficialAdmissionController extends OfficialAdmission {
  admit(site: PackagedSiteId, feature: OwnedFeatureId): void;
  /** Cross-site features start before the native surface's initialization gate. */
  admitShared(feature: (typeof SHARED_FEATURE_OWNERS)[number]['feature']): void;
  /** Deny every id still pending; terminal and idempotent. */
  close(): void;
}

export function createOfficialAdmission(
  owners: readonly OwnedFeature[] = FEATURE_OWNERS,
): OfficialAdmissionController {
  const states = new Map<string, AdmissionState>(
    [...owners, ...SHARED_FEATURE_OWNERS].map((entry) => [entry.officialPluginId, 'pending']),
  );
  const listeners = new Set<() => void>();
  let closed = false;

  const notify = (): void => {
    for (const listener of listeners) listener();
  };

  return {
    stateOf(pluginId) {
      return states.get(pluginId) ?? 'admitted';
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    admit(site, feature) {
      if (closed) return;
      const entry = owners.find((owned) => owned.site === site && owned.feature === feature);
      if (!entry) return;
      if (states.get(entry.officialPluginId) !== 'pending') return;
      states.set(entry.officialPluginId, 'admitted');
      notify();
    },
    admitShared(feature) {
      if (closed) return;
      const entry = SHARED_FEATURE_OWNERS.find((owned) => owned.feature === feature);
      if (!entry || states.get(entry.officialPluginId) !== 'pending') return;
      states.set(entry.officialPluginId, 'admitted');
      notify();
    },
    close() {
      if (closed) return;
      closed = true;
      let changed = false;
      for (const [id, state] of states) {
        if (state !== 'pending') continue;
        states.set(id, 'denied');
        changed = true;
      }
      if (changed) notify();
    },
  };
}

const OWNED_PLUGIN_IDS: ReadonlySet<string> = new Set(
  [...FEATURE_OWNERS, ...SHARED_FEATURE_OWNERS].map((entry) => entry.officialPluginId),
);

/**
 * The admission of a host no content script admits to (tests, or any caller
 * that does not pass one): every owner-table id is denied, so an official
 * plugin can never start ahead of the checks it inherits.
 */
export const CLOSED_ADMISSION: OfficialAdmission = {
  stateOf: (pluginId) => (OWNED_PLUGIN_IDS.has(pluginId) ? 'denied' : 'admitted'),
  subscribe: () => () => {},
};
