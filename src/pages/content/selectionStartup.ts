/**
 * Start Gemini's permanent selection toolbar and sent-quote styling before
 * admitting the Quote and Highlight plugins that register their actions.
 */
import { CleanupPositions } from '@/core/types/cleanupPositions';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

import { mountNativeFeature } from './featureLifecycle';
import { NATIVE_FEATURES } from './nativeFeatures';

export interface SelectionStartup {
  /** The toolbar host and quote styling, then Quote, then Highlight. */
  start(): Promise<void>;
}

export function createSelectionStartup(
  admission: OfficialAdmissionController,
  cleanupManager: CleanupManager,
  lifetime?: AbortSignal,
): SelectionStartup {
  let stopped = false;
  cleanupManager.registerCleanupFunction(() => {
    stopped = true;
  }, CleanupPositions.CleanupSelectionStartup);
  const isStopped = (): boolean => stopped || lifetime?.aborted === true;

  return {
    async start() {
      for (const service of [
        NATIVE_FEATURES.selectionToolbarHost,
        NATIVE_FEATURES.renderedQuoteStyling,
      ]) {
        if (isStopped()) return;
        await mountNativeFeature(cleanupManager, service, lifetime);
      }
      // Teardown can land while a permanent service mounts, before its consumers are admitted.
      if (isStopped()) return;
      admission.admit('gemini', 'quoteReply');
      if (isStopped()) return;
      admission.admit('gemini', 'highlight');
    },
  };
}
