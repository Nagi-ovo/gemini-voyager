import { runCoachmarkSequence } from './coachmark';
import { folderActivityCoachmarkStep } from './folder/activityCoachmark';
import { conversationSortCoachmarkStep } from './folder/conversationSortCoachmark';
import { folderSearchCoachmarkStep } from './folder/folderSearchCoachmark';
import { promptReorderCoachmarkStep } from './prompt/promptReorderCoachmark';
import { slashPromptCoachmarkStep } from './prompt/slashPromptCoachmark';
import {
  maybeShowRulerTimelineCoachmark,
  rulerTimelineCoachmarkStep,
} from './timeline/rulerTimelineCoachmark';
import { usageCoachmarkStep } from './usageStatus/usageCoachmark';

/**
 * The page's onboarding coachmark sequence. The returned `show` runs it at most
 * once per page, never while the changelog is open or a sequence still runs;
 * `timelineSignal` ends the timeline step's wait on teardown.
 */
export function createOnboardingCoachmarks(timelineSignal: AbortSignal): () => void {
  let shownThisPage = false;
  let sequenceRunning = false;

  return () => {
    if (document.querySelector('.gv-changelog-overlay') || shownThisPage || sequenceRunning) return;

    sequenceRunning = true;
    void runCoachmarkSequence([
      {
        ...rulerTimelineCoachmarkStep,
        show: (progress) => maybeShowRulerTimelineCoachmark({ progress, signal: timelineSignal }),
      },
      folderActivityCoachmarkStep,
      usageCoachmarkStep,
      folderSearchCoachmarkStep,
      conversationSortCoachmarkStep,
      slashPromptCoachmarkStep,
      promptReorderCoachmarkStep,
    ])
      .then((result) => {
        if (result !== 'skipped') shownThisPage = true;
      })
      .finally(() => {
        sequenceRunning = false;
      });
  };
}
