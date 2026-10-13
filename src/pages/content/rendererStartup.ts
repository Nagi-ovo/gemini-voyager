/** Gemini's renderers retain their original content-script admission points. */
import { CleanupPositions } from '@/core/types/cleanupPositions';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

export interface GeminiRendererStartup {
  /** Long code block collapse, at its place among the DOM enhancements. */
  startCodeBlockCollapse(): Promise<void>;
  /** The diagram renderers, then user LaTeX, once the prompt panel is up. */
  startRenderers(): Promise<void>;
}

export function createGeminiRendererStartup(
  admission: OfficialAdmissionController,
  cleanupManager: CleanupManager,
  lifetime?: AbortSignal,
): GeminiRendererStartup {
  let stopped = lifetime?.aborted === true;
  if (!stopped) {
    cleanupManager.registerCleanupFunction(() => {
      stopped = true;
    }, CleanupPositions.CleanupRendererStartup);
  }

  return {
    async startCodeBlockCollapse() {
      if (stopped || lifetime?.aborted) return;
      admission.admit('gemini', 'codeCollapse');
    },
    async startRenderers() {
      if (stopped || lifetime?.aborted) return;
      admission.admit('gemini', 'mermaid');
      admission.admit('gemini', 'waveDrom');
      admission.admit('gemini', 'echarts');
      admission.admit('gemini', 'userLatex');
    },
  };
}
