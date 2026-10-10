import { nativeHealthReporter } from '../nativeHealth';
import { hasRenderedConversationContent } from '../nativeHealth/pageEvidence';

/**
 * Report whether an export found any turns after its own waits, and return `found` so the caller
 * keeps its branch. The reporter is only started on Gemini, so other export hosts report nothing.
 */
export function noteExportTurns(found: boolean, recheck: () => boolean): boolean {
  if (found) {
    nativeHealthReporter.reportFound('export');
  } else {
    nativeHealthReporter.reportMissing('export', {
      route: 'conversation',
      recheck,
      expected: () => hasRenderedConversationContent(),
    });
  }
  return found;
}
