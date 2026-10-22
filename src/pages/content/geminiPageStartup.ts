/**
 * Gemini's start order, run once by `initializeFeatures` after the
 * initialization entry checks. Page services first, then features in groups
 * separated by idle yields; official plugins are admitted where their native
 * modules used to start. Every await goes through `settle`/`adopt`, so nothing
 * after a boundary runs once the page retired.
 */
import { CleanupPositions } from '@/core/types/cleanupPositions';
import type { CleanupManager } from '@/core/utils/cleanupManager';
import type { OfficialAdmissionController } from '@/features/plugins/runtime/officialAdmission';

import { startGeminiChatAppearance } from './appearanceStartup';
import { admitBatchDelete } from './batchDeleteStartup';
import { startChangelog } from './changelog/index';
import type { NativeFeature, StopNativeFeature } from './featureLifecycle';
import { startFolderItemFontSizeAdjuster } from './folderItemFontSize/index';
import { startFolderProject } from './folderProject/index';
import { startFolderSpacingAdjuster } from './folderSpacing/index';
import type { GeminiBuiltinStartup } from './geminiBuiltinStartup';
import { admitGeminiFolders } from './geminiFolderStartup';
import { HEAVY_FEATURE_INIT_DELAY, LIGHT_FEATURE_INIT_DELAY } from './initPacing';
import { type GeminiInputStartup, startGeminiSendKeys } from './inputStartup';
import { NATIVE_FEATURES } from './nativeFeatures';
import type { PageSteps } from './pageInitSteps';
import { createPostChangelogFlow } from './postChangelogFlow';
import type { GeminiRendererStartup } from './rendererStartup';
import type { SelectionStartup } from './selectionStartup';
import { startWatermarkNativeNotice } from './watermarkNativeNotice';

export interface GeminiPageStartupDeps extends PageSteps {
  readonly admission: OfficialAdmissionController;
  readonly cleanupManager: CleanupManager;
  readonly lifetime: AbortSignal;
  /** Yield to an idle main thread for at most `ms`; throws once the page retired. */
  readonly delay: (ms: number) => Promise<void>;
  readonly mountForPage: (feature: NativeFeature) => Promise<StopNativeFeature>;
  readonly builtins: GeminiBuiltinStartup;
  readonly inputs: GeminiInputStartup;
  readonly renderers: GeminiRendererStartup;
  readonly selection: SelectionStartup;
  /** Run the onboarding coachmarks once the release-time interruptions are done. */
  readonly showOnboardingCoachmarks: () => void;
}

export async function startGeminiPage(deps: GeminiPageStartupDeps): Promise<void> {
  const { settle, delay, mountForPage, admission, cleanupManager } = deps;
  const { builtins, inputs, renderers } = deps;

  // Owners below report anchor health to it, so it listens before they start.
  await settle(mountForPage(NATIVE_FEATURES.nativeHealth));
  // Before the timeline and folders: they read server identities from it.
  await settle(mountForPage(NATIVE_FEATURES.historyTimestampPageService));
  // Message time display has its own switch and remains available with the rail closed.
  await settle(builtins.startMessageTimestamps());
  // Timeline is most resource-intensive, start it first
  await settle(builtins.startTimeline());
  await delay(HEAVY_FEATURE_INIT_DELAY);

  admitBatchDelete(admission, 'gemini', deps.lifetime);
  // The plugin shows the folders; the page holds their data, which Folder-as-Project
  // files into with the folders off too.
  const folders = await settle(
    admitGeminiFolders(admission, { cleanupManager, lifetime: deps.lifetime }),
  );
  if (folders) startFolderProject(folders);
  await delay(HEAVY_FEATURE_INIT_DELAY);

  // Layout preferences are independent and only install lightweight
  // storage listeners/styles, so yield once for the group instead of once
  // per setting.
  startFolderSpacingAdjuster('gemini');
  startFolderItemFontSizeAdjuster();
  await settle(startGeminiChatAppearance(admission, deps.lifetime));
  await delay(LIGHT_FEATURE_INIT_DELAY);

  await settle(inputs.startInputCollapse());
  admission.admit('gemini', 'hideInputHalo');
  admission.admit('gemini', 'vimInput');
  await delay(LIGHT_FEATURE_INIT_DELAY);

  await settle(startGeminiSendKeys(admission));
  await settle(builtins.startPreventAutoScroll());
  admission.admit('gemini', 'formulaCopy');
  await delay(LIGHT_FEATURE_INIT_DELAY);

  // The selection toolbar, sent-quote styling, then Quote and Highlight.
  await settle(deps.selection.start());
  await delay(LIGHT_FEATURE_INIT_DELAY);

  // Independent content helpers can initialize in the same idle slice.
  await settle(builtins.startWatermarkRemover());
  await settle(builtins.startDeepResearchExport());
  await settle(builtins.startContextSync());
  // Gemini moved Gems into the More menu, so the old sidebar hider no longer has a target.
  await delay(LIGHT_FEATURE_INIT_DELAY);

  // These modules only share the extension storage API and can hydrate in
  // parallel without changing their runtime ordering.
  const parallelResults = await Promise.allSettled([
    builtins.startResponseNotification(),
    builtins.startGemsSidebar(),
    builtins.startUsageStatus(),
    inputs.startDraftSave(),
    inputs.startPromptHistory(),
  ]);
  const failedInitializer = parallelResults.find(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  );
  if (failedInitializer) throw failedInitializer.reason;
  await delay(LIGHT_FEATURE_INIT_DELAY);

  // DOM enhancements install observers/listeners but do not need separate
  // idle waits between each initializer.
  await settle(builtins.startMarkdownFix());
  await settle(renderers.startCodeBlockCollapse());
  await settle(builtins.startDefaultModel());
  await settle(builtins.startExport());
  await settle(builtins.startCanvasCopy());
  await delay(LIGHT_FEATURE_INIT_DELAY);

  await settle(builtins.startForkAndResearchPack());

  // Release-time interruptions are intentionally sequential: changelog,
  // native-watermark notice, then any eligible feature coachmarks.
  const postChangelogFlow = createPostChangelogFlow({
    hasOpenChangelog: () => Boolean(document.querySelector('.gv-changelog-overlay')),
    startWatermarkNotice: (onSettled) => {
      cleanupManager.registerCleanupFunction(
        startWatermarkNativeNotice({ onSettled }),
        CleanupPositions.CleanupWatermarkNativeNotice,
      );
    },
    startCoachmarks: deps.showOnboardingCoachmarks,
  });
  void startChangelog({ onClosed: postChangelogFlow.start }).then(postChangelogFlow.start);
}
