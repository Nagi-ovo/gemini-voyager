/**
 * Gemini's renderer start points: the long code block collapse, user-message
 * LaTeX and the three diagram renderers. Each asks the owner table whether its
 * native module starts here or its packaged official plugin is admitted.
 *
 * Code block collapse and user LaTeX have a popup switch. While their native
 * module owns them it follows that switch live: the controller listens before
 * the startup read, so a flip that lands during the read wins. Once the plugin
 * owns them, PluginHost follows the same key instead and nothing here listens.
 * Page teardown destroys every controller and creates no more, so a startup
 * read or start that settles after teardown mounts nothing.
 *
 * The diagram renderers have no stop yet; their switches are read by the
 * modules themselves, as before.
 */
import { CleanupPositions } from '@/core/types/cleanupPositions';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';
import { type OwnedFeatureId, featureOwner } from '@/features/plugins/sites/featureOwners';

import { startEcharts } from './echarts/index';
import {
  type NativeFeature,
  type NativeFeatureToggle,
  type NativeFeatureToggleController,
  createNativeFeatureToggle,
} from './featureLifecycle';
import { type OwnerOf, startOwnedFeature } from './featureOwnerStartup';
import { startMermaid } from './mermaid/index';
import { NATIVE_FEATURES } from './nativeFeatures';
import { startWaveDrom } from './wavedrom/index';

type StorageChanges = Parameters<NativeFeatureToggleController['handleChange']>[0];

export interface GeminiRendererStartup {
  /** Long code block collapse, at its place among the DOM enhancements. */
  startCodeBlockCollapse(): Promise<void>;
  /** The diagram renderers, then user LaTeX, once the prompt panel is up. */
  startRenderers(): Promise<void>;
  /** Route `chrome.storage.onChanged` to the switches the native modules follow. */
  handleStorageChange(changes: StorageChanges, areaName: string): void;
}

/**
 * The startup reading of a sync-area switch. An invalidated extension context
 * reads as off, never as "missing, so default on"; any other failure reads as
 * a missing key, the default the modules have always fallen back to.
 */
export async function readNativeToggle(toggle: NativeFeatureToggle): Promise<boolean> {
  try {
    const sync = (globalThis as { chrome?: typeof chrome }).chrome?.storage?.sync;
    if (!sync) return toggle.isEnabled(undefined);
    const stored = await sync.get<Record<string, unknown>>([toggle.key]);
    return toggle.isEnabled(stored?.[toggle.key]);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return false;
    return toggle.isEnabled(undefined);
  }
}

type ToggledNativeFeature = NativeFeature & { readonly toggle: NativeFeatureToggle };

export function createGeminiRendererStartup(
  admission: OfficialAdmissionController,
  cleanupManager: CleanupManager,
  ownerOf: OwnerOf = featureOwner,
): GeminiRendererStartup {
  const toggles: NativeFeatureToggleController[] = [];
  let stopped = false;
  // A mounted feature's own stop sits at its cleanup position; this only keeps a
  // late startup read or start from mounting after teardown ran.
  cleanupManager.registerCleanupFunction(() => {
    stopped = true;
    for (const toggle of toggles.splice(0)) toggle.destroy();
  }, CleanupPositions.CleanupRendererStartup);

  const startToggled = (feature: OwnedFeatureId, native: ToggledNativeFeature): Promise<void> =>
    startOwnedFeature(
      admission,
      'gemini',
      feature,
      async () => {
        if (stopped) return;
        const toggle = createNativeFeatureToggle(cleanupManager, native);
        toggles.push(toggle);
        await toggle.applyInitial(await readNativeToggle(native.toggle));
      },
      ownerOf,
    );

  return {
    startCodeBlockCollapse: () => startToggled('codeCollapse', NATIVE_FEATURES.codeBlockCollapse),
    async startRenderers() {
      await startOwnedFeature(
        admission,
        'gemini',
        'mermaid',
        async () => {
          startMermaid();
        },
        ownerOf,
      );
      await startOwnedFeature(
        admission,
        'gemini',
        'waveDrom',
        async () => {
          startWaveDrom();
        },
        ownerOf,
      );
      await startOwnedFeature(
        admission,
        'gemini',
        'echarts',
        async () => {
          startEcharts();
        },
        ownerOf,
      );
      await startToggled('userLatex', NATIVE_FEATURES.userLatex);
    },
    handleStorageChange(changes, areaName) {
      for (const toggle of toggles) toggle.handleChange(changes, areaName);
    },
  };
}
