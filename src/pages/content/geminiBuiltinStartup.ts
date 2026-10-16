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
  /** Message timestamps after the native history service, independently of the rail. */
  startMessageTimestamps(): Promise<void>;
  /** Markdown repair at its original DOM-enhancement start point. */
  startMarkdownFix(): Promise<void>;
  /** Deep Research export menu entries at their original content-helper start point. */
  startDeepResearchExport(): Promise<void>;
  /** Context capture at its original content-helper start point. */
  startContextSync(): Promise<void>;
  /** Recent Gems in the parallel content-helper group. */
  startGemsSidebar(): Promise<void>;
  /** The rail at its original heavy-feature start point, after the independent page services. */
  startTimeline(): Promise<void>;
  /** Canvas share-menu copy, after the conversation export button. */
  startCanvasCopy(): Promise<void>;
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
    async startMessageTimestamps() {
      if (isStopped()) return;
      admission.admit('gemini', 'messageTimestamps');
    },
    async startMarkdownFix() {
      if (isStopped()) return;
      admission.admit('gemini', 'markdownFix');
    },
    async startDeepResearchExport() {
      if (isStopped()) return;
      admission.admit('gemini', 'deepResearchExport');
    },
    async startContextSync() {
      if (isStopped()) return;
      admission.admit('gemini', 'contextSync');
    },
    async startGemsSidebar() {
      if (isStopped()) return;
      admission.admit('gemini', 'gemsSidebar');
    },
    async startTimeline() {
      if (isStopped()) return;
      admission.admit('gemini', 'timeline');
    },
    async startUsageStatus() {
      if (isStopped()) return;
      admission.admit('gemini', 'usageStatus');
    },
    async startCanvasCopy() {
      if (isStopped()) return;
      admission.admit('gemini', 'canvasCopy');
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
