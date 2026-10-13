/**
 * Admit Gemini official plugins at their original content-script start points.
 * The permanent auto-scroll bridge and fork-link finisher stay page-owned and
 * start before their plugin consumers, independently of the popup switches.
 */
import { CleanupPositions } from '@/core/types/cleanupPositions';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

import { mountNativeFeature } from './featureLifecycle';
import { NATIVE_FEATURES } from './nativeFeatures';

export interface GeminiBuiltinStartup {
  /** The rail at its original heavy-feature start point, after the independent page services. */
  startTimeline(): Promise<void>;
  /** Default model, among the DOM enhancements. */
  startDefaultModel(): Promise<void>;
  /** The permanent prevent-auto-scroll bridge, then its plugin claim. */
  startPreventAutoScroll(): Promise<void>;
  /** The response notification in the parallel content-helper group. */
  startResponseNotification(): Promise<void>;
  /** Usage status in the parallel content-helper group. */
  startUsageStatus(): Promise<void>;
  /** The permanent fork-link finisher, then Fork, then the research pack. */
  startForkAndResearchPack(): Promise<void>;
}

export function createGeminiBuiltinStartup(
  admission: OfficialAdmissionController,
  cleanupManager: CleanupManager,
  lifetime?: AbortSignal,
): GeminiBuiltinStartup {
  let stopped = false;
  cleanupManager.registerCleanupFunction(() => {
    stopped = true;
  }, CleanupPositions.CleanupGeminiBuiltinStartup);
  const isStopped = (): boolean => stopped || lifetime?.aborted === true;

  return {
    async startTimeline() {
      if (isStopped()) return;
      admission.admit('gemini', 'timeline');
    },
    async startUsageStatus() {
      if (isStopped()) return;
      admission.admit('gemini', 'usageStatus');
    },
    async startDefaultModel() {
      if (isStopped()) return;
      await mountNativeFeature(cleanupManager, NATIVE_FEATURES.defaultModelStarCleanup, lifetime);
      if (isStopped()) return;
      admission.admit('gemini', 'defaultModel');
    },
    async startPreventAutoScroll() {
      if (isStopped()) return;
      await mountNativeFeature(cleanupManager, NATIVE_FEATURES.preventAutoScrollBridge, lifetime);
      // A slow bridge may finish after teardown; its continuation must not admit a new owner.
      if (isStopped()) return;
      admission.admit('gemini', 'preventAutoScroll');
    },
    async startResponseNotification() {
      if (isStopped()) return;
      admission.admit('gemini', 'responseNotification');
    },
    async startForkAndResearchPack() {
      if (isStopped()) return;
      // An accepted first-send handoff must finish even while the Fork plugin is off.
      await mountNativeFeature(cleanupManager, NATIVE_FEATURES.forkLinkFinisher, lifetime);
      if (isStopped()) return;
      admission.admit('gemini', 'fork');
      admission.admit('gemini', 'researchPack');
    },
  };
}
