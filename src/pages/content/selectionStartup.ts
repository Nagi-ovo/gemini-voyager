/**
 * Start point of Gemini's selection features: the one selection toolbar, the
 * styling of quotes already sent, and the Quote and Highlight actions that
 * register with the toolbar. The toolbar and the styling are page services and
 * run whatever the switches say; each action asks the owner table whether its
 * native module starts here, then follows its popup switch live.
 *
 * Each toggle controller exists before its startup read, so a flip that lands
 * during the read wins. Page teardown stops this start point before the
 * actions (which stop before the styling and the toolbar host), destroys every
 * controller and creates no more, so a startup read that settles after
 * teardown mounts nothing.
 */
import { CleanupPositions } from '@/core/types/cleanupPositions';
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
type SelectionAction = typeof NATIVE_FEATURES.quoteReply | typeof NATIVE_FEATURES.highlight;

async function readSwitch(feature: SelectionAction): Promise<boolean> {
  const { key, isEnabled } = feature.toggle;
  try {
    const result = await chrome.storage?.sync?.get(key);
    return isEnabled(result?.[key]);
  } catch {
    return isEnabled(undefined);
  }
}

export interface SelectionStartup {
  /** The toolbar host and quote styling, then Quote, then Highlight. */
  start(): Promise<void>;
  /** Route `chrome.storage.onChanged` to the switches the native actions follow. */
  handleStorageChange(changes: StorageChanges, areaName: string): void;
}

/**
 * `lifetime` is the content script's page lifetime: a mount that finishes
 * after the page retired is stopped at once instead of being registered.
 */
export function createSelectionStartup(
  admission: OfficialAdmissionController,
  cleanupManager: CleanupManager,
  lifetime?: AbortSignal,
  ownerOf: OwnerOf = featureOwner,
): SelectionStartup {
  const toggles: NativeFeatureToggleController[] = [];
  let stopped = false;
  // A mounted feature's own stop sits at its cleanup position; this only keeps a
  // late startup read or start from mounting after teardown ran.
  cleanupManager.registerCleanupFunction(() => {
    stopped = true;
    for (const toggle of toggles.splice(0)) toggle.destroy();
  }, CleanupPositions.CleanupSelectionStartup);

  const startAction = (id: 'quoteReply' | 'highlight', feature: SelectionAction): Promise<void> =>
    startOwnedFeature(
      admission,
      'gemini',
      id,
      async () => {
        if (stopped) return;
        const toggle = createNativeFeatureToggle(cleanupManager, feature, lifetime);
        toggles.push(toggle);
        const enabled = await readSwitch(feature);
        if (stopped) return;
        await toggle.applyInitial(enabled);
      },
      ownerOf,
    );

  return {
    async start() {
      for (const service of [
        NATIVE_FEATURES.selectionToolbarHost,
        NATIVE_FEATURES.renderedQuoteStyling,
      ]) {
        if (stopped) return;
        await mountNativeFeature(cleanupManager, service, lifetime);
      }
      await startAction('quoteReply', NATIVE_FEATURES.quoteReply);
      await startAction('highlight', NATIVE_FEATURES.highlight);
    },
    handleStorageChange(changes, areaName) {
      if (stopped) return;
      for (const toggle of toggles) toggle.handleChange(changes, areaName);
    },
  };
}
