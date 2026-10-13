/**
 * Start points of the Gemini-only builtins that are moving to packaged
 * official plugins: default model, fork, the research pack, prevent
 * auto-scroll and the response notification. Each asks the owner table
 * whether its native module starts here or its packaged official plugin is
 * admitted instead, as does the usage status runtime at its earlier start point.
 *
 * Fork and the research pack follow their popup switches live while their
 * native modules own them: each controller exists before its startup read, so
 * a flip that lands during the read wins. Once the plugin owns one, PluginHost
 * follows the same key instead and nothing here listens. The native default
 * model and the response notification follow their own switches, so each is
 * mounted once and stops on teardown. Prevent auto-scroll's bridge is a page
 * service that runs whoever owns the switch; only its claim follows the switch.
 *
 * Page teardown stops this start point before the features it starts,
 * destroys every controller and creates no more, so a startup read that
 * settles after teardown mounts nothing, and the research pack is not even
 * read once teardown lands during the fork read.
 */
import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import { featureOwner } from '@/features/plugins/sites/featureOwners';

import {
  type NativeFeatureToggleController,
  createNativeFeatureToggle,
  mountNativeFeature,
} from './featureLifecycle';
import { type OwnerOf, startOwnedFeature } from './featureOwnerStartup';
import { NATIVE_FEATURES } from './nativeFeatures';

type StorageChanges = Parameters<NativeFeatureToggleController['handleChange']>[0];

async function isForkFeatureEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage?.sync?.get({ [StorageKeys.FORK_ENABLED]: false });
    return NATIVE_FEATURES.fork.toggle.isEnabled(result?.[StorageKeys.FORK_ENABLED]);
  } catch {
    return false;
  }
}

async function isPreventAutoScrollEnabled(): Promise<boolean> {
  const { key, isEnabled } = NATIVE_FEATURES.preventAutoScroll.toggle;
  try {
    const result = await chrome.storage?.sync?.get({ [key]: false });
    return isEnabled(result?.[key]);
  } catch {
    return false;
  }
}

async function isResearchPackEnabled(): Promise<boolean> {
  try {
    const result = await chrome.storage?.sync?.get({ [StorageKeys.RESEARCH_PACK_ENABLED]: false });
    return NATIVE_FEATURES.researchPack.toggle.isEnabled(
      result?.[StorageKeys.RESEARCH_PACK_ENABLED],
    );
  } catch {
    return false;
  }
}

export interface GeminiBuiltinStartup {
  /** Default model, among the DOM enhancements; resolves without waiting for its startup read. */
  startDefaultModel(): Promise<void>;
  /** The prevent-auto-scroll bridge, then the claim that follows the switch. */
  startPreventAutoScroll(): Promise<void>;
  /** The response notification run; resolves without waiting for its startup read. */
  startResponseNotification(): Promise<void>;
  /** Usage status in the parallel content-helper group; its runtime owns the native switch. */
  startUsageStatus(): Promise<void>;
  /** Fork, then the research pack, after the DOM enhancements. */
  startForkAndResearchPack(): Promise<void>;
  /** Route `chrome.storage.onChanged` to the switches the native modules follow. */
  handleStorageChange(changes: StorageChanges, areaName: string): void;
}

/**
 * `lifetime` is the content script's page lifetime: a mount that finishes
 * after the page retired is stopped at once instead of being registered.
 */
export function createGeminiBuiltinStartup(
  admission: OfficialAdmissionController,
  cleanupManager: CleanupManager,
  lifetime?: AbortSignal,
  ownerOf: OwnerOf = featureOwner,
): GeminiBuiltinStartup {
  const toggles: NativeFeatureToggleController[] = [];
  let stopped = false;
  // A mounted feature's own stop sits at its cleanup position; this only keeps a
  // late startup read or start from mounting after teardown ran.
  cleanupManager.registerCleanupFunction(() => {
    stopped = true;
    for (const toggle of toggles.splice(0)) toggle.destroy();
  }, CleanupPositions.CleanupGeminiBuiltinStartup);

  const follow = (
    feature:
      | typeof NATIVE_FEATURES.fork
      | typeof NATIVE_FEATURES.researchPack
      | typeof NATIVE_FEATURES.preventAutoScroll,
  ): NativeFeatureToggleController => {
    const toggle = createNativeFeatureToggle(cleanupManager, feature, lifetime);
    toggles.push(toggle);
    return toggle;
  };

  return {
    async startUsageStatus() {
      if (stopped) return;
      await startOwnedFeature(
        admission,
        'gemini',
        'usageStatus',
        async () => {
          if (stopped) return;
          await mountNativeFeature(cleanupManager, NATIVE_FEATURES.usageStatus, lifetime);
        },
        ownerOf,
      );
    },
    startDefaultModel: () =>
      startOwnedFeature(
        admission,
        'gemini',
        'defaultModel',
        async () => {
          if (stopped) return;
          await mountNativeFeature(cleanupManager, NATIVE_FEATURES.defaultModel, lifetime);
        },
        ownerOf,
      ),
    async startPreventAutoScroll() {
      if (stopped) return;
      await mountNativeFeature(cleanupManager, NATIVE_FEATURES.preventAutoScrollBridge, lifetime);
      // A bridge may finish after page teardown; the plugin must not be admitted by that continuation.
      if (stopped) return;
      await startOwnedFeature(
        admission,
        'gemini',
        'preventAutoScroll',
        async () => {
          if (stopped) return;
          const claim = follow(NATIVE_FEATURES.preventAutoScroll);
          const enabled = await isPreventAutoScrollEnabled();
          if (stopped) return;
          await claim.applyInitial(enabled);
        },
        ownerOf,
      );
    },
    startResponseNotification: () =>
      startOwnedFeature(
        admission,
        'gemini',
        'responseNotification',
        async () => {
          if (stopped) return;
          await mountNativeFeature(
            cleanupManager,
            NATIVE_FEATURES.responseCompleteNotification,
            lifetime,
          );
        },
        ownerOf,
      ),
    async startForkAndResearchPack() {
      if (stopped) return;
      // A pasted fork must still link after the popup switch removes its UI owner.
      await mountNativeFeature(cleanupManager, NATIVE_FEATURES.forkLinkFinisher, lifetime);
      if (stopped) return;
      await startOwnedFeature(
        admission,
        'gemini',
        'fork',
        async () => {
          if (stopped) return;
          const fork = follow(NATIVE_FEATURES.fork);
          const forkEnabled = await isForkFeatureEnabled();
          if (stopped) return;
          await fork.applyInitial(forkEnabled);
        },
        ownerOf,
      );
      if (stopped) return;

      await startOwnedFeature(
        admission,
        'gemini',
        'researchPack',
        async () => {
          const researchPack = follow(NATIVE_FEATURES.researchPack);
          const researchPackEnabled = await isResearchPackEnabled();
          if (stopped) return;
          await researchPack.applyInitial(researchPackEnabled);
        },
        ownerOf,
      );
    },
    handleStorageChange(changes, areaName) {
      if (stopped) return;
      for (const toggle of toggles) toggle.handleChange(changes, areaName);
    },
  };
}
