import { packagedPluginRunsHere } from '@/features/plugins/runtime/packagedFormFactor';
import { OFFICIAL_PLUGIN_IDS } from '@/features/plugins/sites/featureOwners';

import { type CoachmarkSequenceStep, runCoachmarkSequence } from './coachmark';
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
 * A step that guides through a plugin's feature, offered only on a device the
 * plugin runs on: a folder guide on a phone would open Gemini's drawer for an
 * anchor that never comes, and the usage guide would switch on a plugin that
 * cannot run there.
 */
function whereRuns(
  step: CoachmarkSequenceStep,
  pluginId: string,
  runsHere: (pluginId: string) => Promise<boolean>,
): CoachmarkSequenceStep {
  return {
    ...step,
    isEligible: async () => (await runsHere(pluginId)) && ((await step.isEligible?.()) ?? true),
  };
}

/**
 * The page's onboarding coachmark sequence. The returned `show` runs it at most
 * once per page, never while the changelog is open or a sequence still runs;
 * `timelineSignal` ends the timeline step's wait on teardown.
 */
export function createOnboardingCoachmarks(
  timelineSignal: AbortSignal,
  runsHere: (pluginId: string) => Promise<boolean> = packagedPluginRunsHere,
): () => void {
  const folders = OFFICIAL_PLUGIN_IDS.geminiFolders;
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
      whereRuns(folderActivityCoachmarkStep, folders, runsHere),
      whereRuns(usageCoachmarkStep, OFFICIAL_PLUGIN_IDS.geminiUsageStatus, runsHere),
      whereRuns(folderSearchCoachmarkStep, folders, runsHere),
      whereRuns(conversationSortCoachmarkStep, folders, runsHere),
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
