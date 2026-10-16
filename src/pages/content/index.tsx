import { CleanupPositions } from '@/core/types/cleanupPositions';
import { StorageKeys } from '@/core/types/common';
import { CleanupManager } from '@/core/utils/cleanupManager';
import {
  hasValidExtensionContext,
  isExtensionContextInvalidatedError,
} from '@/core/utils/extensionContext';
import { WATERMARK_STORAGE_KEYS } from '@/core/utils/watermarkSettings';
import { startPluginHost } from '@/features/plugins';
import { createOfficialAdmission } from '@/features/plugins/runtime/officialAdmission';
import { resolvePluginPlatformId } from '@/features/plugins/sites/registry';
import { SiteRegistry } from '@/features/plugins/sites/registry';
import { initI18n } from '@/utils/i18n';

import { startAIStudioSidebarLayout } from './aistudioSidebarStartup';
import { startGeminiChatAppearance } from './appearanceStartup';
import { startChangelog } from './changelog/index';
import { runCoachmarkSequence } from './coachmark';
import { claimContentScript } from './contentScriptHandoff';
import { startDevSettingsBridge } from './devSettingsBridge';
import { flushDraftsBeforeUnload } from './draftSave/draftUnloadFlush';
import { startExportButton } from './export/index';
import { type NativeFeature, type StopNativeFeature, mountNativeFeature } from './featureLifecycle';
import { folderActivityCoachmarkStep } from './folder/activityCoachmark';
import { startAIStudioFolderManager } from './folder/aistudio';
import { conversationSortCoachmarkStep } from './folder/conversationSortCoachmark';
import { folderSearchCoachmarkStep } from './folder/folderSearchCoachmark';
import { startFolderManager } from './folder/index';
import { startFolderItemFontSizeAdjuster } from './folderItemFontSize/index';
import { startFolderProject } from './folderProject/index';
import { startFolderSpacingAdjuster } from './folderSpacing/index';
import { createGeminiBuiltinStartup } from './geminiBuiltinStartup';
import { enterInitialization } from './initializationEntry';
import {
  createGeminiInputStartup,
  startAIStudioSendKeys,
  startGeminiSendKeys,
  startPageSendKeys,
} from './inputStartup';
import { initKaTeXConfig } from './katexConfig';
import { NATIVE_FEATURES } from './nativeFeatures';
import { PageRetiredError, createPageSteps } from './pageInitSteps';
import { ensureScheme, stopScheme } from './platformTheme/scheme';
import { registerBuiltinNativeHandlers } from './pluginNativeRegistration';
import { createPostChangelogFlow } from './postChangelogFlow';
import { createPromptManagerEngine, readPromptCoverage } from './prompt/promptManagerEngine';
import { promptReorderCoachmarkStep } from './prompt/promptReorderCoachmark';
import { resolvePromptSiteAdapter } from './prompt/resolvePromptSiteAdapter';
import { slashPromptCoachmarkStep } from './prompt/slashPromptCoachmark';
import { createGeminiRendererStartup } from './rendererStartup';
import { createSelectionStartup } from './selectionStartup';
import {
  maybeShowRulerTimelineCoachmark,
  rulerTimelineCoachmarkStep,
} from './timeline/rulerTimelineCoachmark';
import { usageCoachmarkStep } from './usageStatus/usageCoachmark';
import { admitVisualEffectsForPage } from './visualEffectsStartup';
import { startWatermarkNativeNotice } from './watermarkNativeNotice';
import { restartWatermarkRemoverFeature } from './watermarkRemover/feature';

// Suppress Vite's CSS preload errors in the Chrome extension content script context.
// Dynamic imports (e.g., mermaid) trigger Vite's __vitePreload helper which tries to
// create <link> elements with paths like "/assets/foo.css". In a content script, these
// resolve to the web page origin (e.g., https://gemini.google.com/assets/foo.css)
// instead of the extension, causing false "Unable to preload CSS" errors.
// The CSS is already injected via contentStyle.css, so these preloads are unnecessary.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
});

if (import.meta.env.VOYAGER_DEV_SETTINGS_BRIDGE) startDevSettingsBridge();

/**
 * Staggered initialization to prevent "thundering herd" problem when multiple tabs
 * are restored simultaneously (e.g., after browser restart).
 *
 * Background tabs get a random delay (3-8s) to distribute initialization load.
 * Foreground tabs initialize immediately for good UX.
 *
 * This prevents triggering Google's rate limiting when restoring sessions with
 * many Gemini tabs containing long conversations.
 */

// Initialization delay constants (in milliseconds)
const HEAVY_FEATURE_INIT_DELAY = 100; // For resource-intensive features (Timeline, Folder)
const LIGHT_FEATURE_INIT_DELAY = 50; // For lightweight features
const BACKGROUND_TAB_MIN_DELAY = 3000; // Minimum delay for background tabs
const BACKGROUND_TAB_MAX_DELAY = 8000; // Maximum delay for background tabs (3000 + 5000)

const cleanupManager = new CleanupManager();
// Aborted only when a newer copy retires this one, never on `beforeunload`
// (the user may cancel it): a start still in flight then stops itself at once.
const pageLifetime = new AbortController();
// One per content-script instance: initializeFeatures admits packaged official
// plugins where their native modules used to start, then closes it.
const officialAdmission = createOfficialAdmission();
const promptManager = createPromptManagerEngine(
  resolvePromptSiteAdapter(location.href),
  cleanupManager,
  pageLifetime.signal,
);
const geminiRenderers = createGeminiRendererStartup(
  officialAdmission,
  cleanupManager,
  pageLifetime.signal,
);
const geminiInputs = createGeminiInputStartup(officialAdmission, cleanupManager);
const geminiBuiltins = createGeminiBuiltinStartup(
  officialAdmission,
  cleanupManager,
  pageLifetime.signal,
);
const selectionStartup = createSelectionStartup(
  officialAdmission,
  cleanupManager,
  pageLifetime.signal,
);
const timelineCoachmarkLifetime = new AbortController();
cleanupManager.registerCleanupFunction(
  () => timelineCoachmarkLifetime.abort(),
  CleanupPositions.CleanupTimelineCoachmarks,
);

// Every await in initializeFeatures goes through these, so a starter it calls
// directly (Quote Reply, folders, export buttons, …) never runs after retirement.
const { settle, adopt } = createPageSteps(pageLifetime.signal);

/** Mount a native feature for this page: one that settles after retirement stops at once. */
function mountForPage(feature: NativeFeature): Promise<StopNativeFeature> {
  return mountNativeFeature(cleanupManager, feature, pageLifetime.signal);
}

let initialized = false;
let initializationTimer: number | null = null;

let onboardingCoachmarkShownThisPage = false;
let onboardingCoachmarkSequenceRunning = false;

function showOnboardingCoachmarksWhenChangelogIsIdle(): void {
  if (
    document.querySelector('.gv-changelog-overlay') ||
    onboardingCoachmarkShownThisPage ||
    onboardingCoachmarkSequenceRunning
  )
    return;

  onboardingCoachmarkSequenceRunning = true;
  void runCoachmarkSequence([
    {
      ...rulerTimelineCoachmarkStep,
      show: (progress) =>
        maybeShowRulerTimelineCoachmark({ progress, signal: timelineCoachmarkLifetime.signal }),
    },
    folderActivityCoachmarkStep,
    usageCoachmarkStep,
    folderSearchCoachmarkStep,
    conversationSortCoachmarkStep,
    slashPromptCoachmarkStep,
    promptReorderCoachmarkStep,
  ])
    .then((result) => {
      if (result !== 'skipped') onboardingCoachmarkShownThisPage = true;
    })
    .finally(() => {
      onboardingCoachmarkSequenceRunning = false;
    });
}

/**
 * Initialize all features sequentially to reduce simultaneous load
 */
async function initializeFeatures(): Promise<void> {
  if (initialized) return;
  initialized = true;

  // Only the call that took initialization closes admission: every early
  // return (custom coverage, Enterprise, AI Studio off) or failure below
  // leaves the official plugins it did not admit denied.
  try {
    if (!hasValidExtensionContext()) {
      return;
    }

    await settle(promptManager.startComposerFeatures());

    // Yield between features instead of sleeping a fixed amount. On an idle main
    // thread (the common foreground case) requestIdleCallback fires on the next
    // idle slice — typically well under `ms` — so tail features (timeline, export,
    // mermaid, …) wire up promptly instead of waiting out a ~2s floor of stacked
    // setTimeouts. When the thread is busy, the `timeout` cap makes it back off
    // exactly like the old fixed delay, preserving the anti-thundering-herd intent.
    // Falls back to setTimeout where requestIdleCallback is unavailable (older WebKit).
    const delay = (ms: number) =>
      settle(
        new Promise<void>((resolve) => {
          if (typeof window.requestIdleCallback === 'function') {
            window.requestIdleCallback(() => resolve(), { timeout: ms });
          } else {
            setTimeout(resolve, ms);
          }
        }),
      );

    // Custom-website coverage and Gemini Enterprise end initialization here.
    const entry = await enterInitialization(location, document, {
      settle,
      followCoverage: (host) => promptManager.followCoverage(host),
      mountEdgeNotice: () => mountForPage(NATIVE_FEATURES.edgeFinalVersionNotice),
      startEnterprisePanel: () => promptManager.startPanel(),
    });
    if (entry !== 'start-points') return;

    if (location.hostname === 'gemini.google.com') {
      // Owners below report anchor health to it, so it listens before they start.
      await settle(mountForPage(NATIVE_FEATURES.nativeHealth));
      // Before the timeline and folders: they read server identities from it.
      await settle(mountForPage(NATIVE_FEATURES.historyTimestampPageService));
      // Message time display has its own switch and remains available with the rail closed.
      await settle(geminiBuiltins.startMessageTimestamps());
      // Timeline is most resource-intensive, start it first
      await settle(geminiBuiltins.startTimeline());
      await delay(HEAVY_FEATURE_INIT_DELAY);

      const folderManager = await adopt(startFolderManager(), (manager) => manager?.destroy());
      if (folderManager) {
        cleanupManager.registerCleanupFunction(
          () => folderManager.destroy(),
          CleanupPositions.DestroyFolderManagerInstance,
        );
        startFolderProject(folderManager);
      }
      await delay(HEAVY_FEATURE_INIT_DELAY);

      // Layout preferences are independent and only install lightweight
      // storage listeners/styles, so yield once for the group instead of once
      // per setting.
      startFolderSpacingAdjuster('gemini');
      startFolderItemFontSizeAdjuster();
      await settle(startGeminiChatAppearance(officialAdmission, pageLifetime.signal));
      await delay(LIGHT_FEATURE_INIT_DELAY);

      await settle(geminiInputs.startInputCollapse());
      officialAdmission.admit('gemini', 'hideInputHalo');
      officialAdmission.admit('gemini', 'vimInput');
      await delay(LIGHT_FEATURE_INIT_DELAY);

      await settle(startGeminiSendKeys(officialAdmission));
      await settle(geminiBuiltins.startPreventAutoScroll());
      officialAdmission.admit('gemini', 'formulaCopy');
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // The selection toolbar, sent-quote styling, then Quote and Highlight.
      await settle(selectionStartup.start());
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Independent content helpers can initialize in the same idle slice.
      await settle(mountForPage(NATIVE_FEATURES.watermarkRemover));
      await settle(geminiBuiltins.startDeepResearchExport());
      await settle(geminiBuiltins.startContextSync());
      await settle(mountForPage(NATIVE_FEATURES.gemsHider));
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // These modules only share the extension storage API and can hydrate in
      // parallel without changing their runtime ordering.
      const parallelResults = await Promise.allSettled([
        geminiBuiltins.startResponseNotification(),
        geminiBuiltins.startGemsSidebar(),
        geminiBuiltins.startUsageStatus(),
        geminiInputs.startDraftSave(),
        geminiInputs.startPromptHistory(),
      ]);
      const failedInitializer = parallelResults.find(
        (result): result is PromiseRejectedResult => result.status === 'rejected',
      );
      if (failedInitializer) throw failedInitializer.reason;
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // DOM enhancements install observers/listeners but do not need separate
      // idle waits between each initializer.
      await settle(geminiBuiltins.startMarkdownFix());
      await settle(geminiRenderers.startCodeBlockCollapse());
      await settle(geminiBuiltins.startDefaultModel());
      startExportButton();
      await settle(geminiBuiltins.startCanvasCopy());
      await delay(LIGHT_FEATURE_INIT_DELAY);

      await settle(geminiBuiltins.startForkAndResearchPack());

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
        startCoachmarks: showOnboardingCoachmarksWhenChangelogIsIdle,
      });
      void startChangelog({ onClosed: postChangelogFlow.start }).then(postChangelogFlow.start);
    }

    if (
      location.hostname === 'gemini.google.com' ||
      location.hostname === 'aistudio.google.com' ||
      location.hostname === 'aistudio.google.cn'
    ) {
      await settle(promptManager.startPanel());
      await delay(HEAVY_FEATURE_INIT_DELAY);
    }

    // Not on Gemini Enterprise (returned above): the native diagram renderers
    // never ran there, and the official manifests do not match it.
    if (location.hostname === 'gemini.google.com') {
      // Mermaid, WaveDrom and ECharts (lazy-loaded), then user message LaTeX.
      await settle(geminiRenderers.startRenderers());
      await delay(LIGHT_FEATURE_INIT_DELAY);
    }

    if (location.hostname === 'aistudio.google.com' || location.hostname === 'aistudio.google.cn') {
      // Check if user has disabled Voyager on AI Studio
      const aiStudioEnabled = await settle(
        new Promise<boolean>((resolve) => {
          try {
            chrome.storage?.sync?.get({ [StorageKeys.GV_AISTUDIO_ENABLED]: true }, (res) =>
              resolve(res?.[StorageKeys.GV_AISTUDIO_ENABLED] !== false),
            );
          } catch {
            resolve(true);
          }
        }),
      );

      if (!aiStudioEnabled) {
        console.log('[Gemini Voyager] AI Studio features disabled by user');
        // Admit while off: PluginHost follows the master live and can remount without a reload.
        startAIStudioSidebarLayout(officialAdmission);
        officialAdmission.admit('aistudio', 'formulaCopy');
        await settle(startAIStudioSendKeys(officialAdmission));
        return;
      }

      startAIStudioSidebarLayout(officialAdmission);
      startAIStudioFolderManager();
      await delay(HEAVY_FEATURE_INIT_DELAY);

      startFolderSpacingAdjuster('aistudio');
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Formula copy support for AI Studio
      officialAdmission.admit('aistudio', 'formulaCopy');
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Send behavior (Enter to send)
      await settle(startAIStudioSendKeys(officialAdmission));
      await delay(LIGHT_FEATURE_INIT_DELAY);
    }
  } catch (e) {
    // Retired at an async boundary: the cleanups already ran, nothing more starts.
    if (e instanceof PageRetiredError) return;
    if (isExtensionContextInvalidatedError(e)) {
      return;
    }
    console.error('[Gemini Voyager] Initialization error:', e);
  } finally {
    officialAdmission.close();
  }
}

/**
 * Determine initialization delay based on tab visibility
 */
function getInitializationDelay(): number {
  // Check if tab is currently visible
  const isVisible = document.visibilityState === 'visible';

  if (isVisible) {
    // Foreground tab: initialize immediately for good UX
    console.log('[Gemini Voyager] Foreground tab detected, initializing immediately');
    return 0;
  } else {
    // Background tab: add random delay to distribute load across multiple tabs
    const randomRange = BACKGROUND_TAB_MAX_DELAY - BACKGROUND_TAB_MIN_DELAY;
    const randomDelay = BACKGROUND_TAB_MIN_DELAY + Math.random() * randomRange;
    console.log(
      `[Gemini Voyager] Background tab detected, delaying initialization by ${Math.round(randomDelay)}ms`,
    );
    return randomDelay;
  }
}

/**
 * Handle tab visibility changes
 */
function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && !initialized) {
    // Tab became visible before initialization completed
    // Cancel any pending delayed initialization and start immediately
    if (initializationTimer !== null) {
      clearTimeout(initializationTimer);
      initializationTimer = null;
      console.log('[Gemini Voyager] Tab became visible, initializing immediately');
    }
    initializeFeatures();
  }
}

// Main initialization logic
(function () {
  try {
    if (!hasValidExtensionContext()) return;

    // Before anything mounts: an orphan left by an extension reload/update
    // would otherwise keep its rail, panels and observers beside ours.
    claimContentScript(
      () => {
        initialized = true;
        // An initialization still running in this orphan admits nothing more
        // and mounts nothing more; the plugin host itself stops with the
        // cleanups below.
        officialAdmission.close();
        pageLifetime.abort();
        if (initializationTimer !== null) clearTimeout(initializationTimer);
        initializationTimer = null;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        try {
          cleanupManager.executeCleanups();
        } catch {
          // An orphan's chrome.* calls throw; every other cleanup has still run.
        }
      },
      () => !hasValidExtensionContext(),
    );

    // First, before every branch below and before any surface mounts. The host
    // dialects this replaced were the page's own classes, already there, so a
    // surface was styled the instant it appeared; the attribute only exists
    // once we write it. It has to be here rather than inside
    // initializeFeatures, which a plugin platform never reaches — that branch
    // sets `initialized` precisely to keep out of it — and which a custom
    // website leaves early. Resolving the bundled descriptor is synchronous.
    ensureScheme(SiteRegistry.createDefault().resolveByUrl(location.href)?.theme ?? null);
    cleanupManager.registerCleanupFunction(stopScheme, CleanupPositions.CleanupSchemeBridge);

    const pluginPlatformId = resolvePluginPlatformId(location.href);
    const isPluginSubframe = window.top !== window && pluginPlatformId !== null;

    // Snow, rain and sakura are fullscreen canvas effects with no host-UI
    // dependency. Keep them out of embedded plugin frames: those frames only
    // need the declarative plugin host and would otherwise render a duplicate
    // effect above their parent page.
    cleanupManager.registerCleanupFunction(
      registerBuiltinNativeHandlers(),
      CleanupPositions.CleanupVisualEffects,
    );
    admitVisualEffectsForPage(officialAdmission, isPluginSubframe);

    // Answer the background's ping so injectPluginScriptIntoOpenTabs can tell
    // a live content script from a missing/orphaned one and skip re-injecting
    // CSS/JS into tabs that already run us.
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if ((message as { type?: string } | null)?.type === 'gv.content.ping') {
        sendResponse({ ok: true });
      }
    });

    // Saved Library and cloud sync need the same account identity as highlights.
    // This bridge must exist even when optional Folder Manager code never starts.
    if (!isPluginSubframe) void mountForPage(NATIVE_FEATURES.accountContextBridge);

    if (!isPluginSubframe) void mountForPage(NATIVE_FEATURES.chatGptJump);

    // Gemini and AI Studio send keys: one page coordinator that the native send
    // behavior and send plugins register on, so it exists before the host.
    startPageSendKeys(location.hostname, cleanupManager);
    cleanupManager.registerCleanupFunction(
      flushDraftsBeforeUnload,
      CleanupPositions.FlushDraftsBeforeUnload,
    );

    // Plugin ecosystem host. Started up-front on EVERY page the content script is
    // injected into (Gemini / AI Studio, and any site a user enabled a plugin for,
    // e.g. claude.ai via dynamic registration). It self-detects the site adapter
    // and only mounts plugins that match the current URL AND are enabled. Most
    // builtin plugins ship disabled; the few on by default (pluginDefaults.ts)
    // target their own plugin platform.
    // Bind builtin "native function plugins" before the host starts, so
    // PluginHost can run them when enabled on Claude/ChatGPT.
    // Migrated Gemini/AI Studio features mount only after initializeFeatures admits them.
    // Permanent page services retain their native lifetime. The host
    // itself follows AI Studio's master switch (runtime/surfaceSwitch.ts), so
    // "Voyager off on AI Studio" also keeps local plugins off there.
    cleanupManager.registerCleanupFunction(
      startPluginHost({ admission: officialAdmission }),
      CleanupPositions.CleanupPluginHost,
    );

    // Cosmetic: on Claude / ChatGPT, re-skin Voyager's accent to the host
    // platform's brand colour (injects --gv-pm-brand + a gv-platform-themed body
    // class; CSS derives the rest). Applies the adapter's built-in colour at
    // once, then lets an enabled plugin's declared theme override it live. No-op
    // on Gemini / AI Studio.
    if (!isPluginSubframe) void mountForPage(NATIVE_FEATURES.brandTheme);

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      if (isExtensionContextInvalidatedError(event.reason)) {
        event.preventDefault();
      }
    };
    const onWindowError = (event: ErrorEvent) => {
      if (isExtensionContextInvalidatedError(event.error ?? event.message)) {
        event.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', onUnhandledRejection);
    cleanupManager.registerCleanupFunction(
      () => window.removeEventListener('unhandledrejection', onUnhandledRejection),
      CleanupPositions.RemoveUnhandledRejectionEventListener,
    );
    window.addEventListener('error', onWindowError);
    cleanupManager.registerCleanupFunction(
      () => window.removeEventListener('error', onWindowError),
      CleanupPositions.RemoveErrorEventListener,
    );
    const onStorageChanged = (
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string,
    ) => {
      // Only a running watermark feature restarts: not before Gemini's startup, not after its stop.
      if (
        areaName === 'sync' &&
        WATERMARK_STORAGE_KEYS.some((key) => Object.prototype.hasOwnProperty.call(changes, key))
      ) {
        void restartWatermarkRemoverFeature();
      }

      if (
        (areaName !== 'sync' && areaName !== 'local') ||
        location.hostname !== 'gemini.google.com'
      ) {
        return;
      }

      geminiInputs.handleStorageChange(changes, areaName);
    };

    // Quick check: only run on supported websites
    const hostname = location.hostname.toLowerCase();
    const isSupportedSite =
      hostname.includes('gemini.google.com') ||
      hostname.includes('business.gemini.google') ||
      hostname.includes('aistudio.google.com') ||
      hostname.includes('aistudio.google.cn');
    if (!isPluginSubframe && (isSupportedSite || pluginPlatformId)) {
      void mountForPage(NATIVE_FEATURES.remoteAnnouncements);
    }

    // Initialize KaTeX configuration early to suppress Unicode warnings
    // This must run before any formulas are rendered on the page
    if (isSupportedSite) {
      initKaTeXConfig();
      // Initialize i18n early to ensure translations are available
      initI18n().catch((e) => console.error('[Gemini Voyager] i18n init error:', e));
      void mountForPage(NATIVE_FEATURES.storageQuotaWarning);
    }

    // Initialize i18n for plugin platforms (Claude/ChatGPT) so export translations load
    if (pluginPlatformId && !isSupportedSite) {
      initI18n().catch((e) => console.error('[Gemini Voyager] i18n init error:', e));
    }

    // If not a known site, check if it's a custom website (async)
    if (!isSupportedSite) {
      // Third-party plugin platforms (Claude / ChatGPT …): the plugin
      // host and platform theme already ran above. Start the cross-site Voyager
      // features that belong everywhere — currently just the Prompt Manager
      // floating ball. Native function plugins such as formula-copy and input
      // Vim are driven exclusively by PluginHost. Do NOT start Gemini-specific
      // features (folders, timeline, export, width adjusters, …) here. We set
      // `initialized` so the visibilitychange handler doesn't later fall into
      // initializeFeatures() (which is Gemini/AI-Studio/custom-site shaped).
      if (pluginPlatformId) {
        initialized = true;
        // No Gemini / AI Studio starter runs here, so no official feature is admitted.
        officialAdmission.close();
        if (isPluginSubframe) return;
        // A research pack sent from Gemini with "Continue in …" lands here.
        void mountForPage(NATIVE_FEATURES.researchPackReceiver);
        // Same path as custom websites: the Prompt Manager mounts only while
        // this host is in the user's custom-website list, which is what the
        // popup's "enable Prompt Manager on <site>" toggle edits.
        void promptManager.followCoverage(location.host);
        // ChatGPT export is driven by PluginHost via the voyager.chatgpt-export
        // builtin plugin (opt-in), not started unconditionally here.
        // Formula copy here is driven by PluginHost via the voyager.formula-copy
        // builtin plugin (opt-in), not started unconditionally.
        return;
      }

      // Any other site runs only while a custom entry covers it.
      void readPromptCoverage(location.host).then((covered) => {
        if (covered) initializeFeatures();
      });
      return;
    }
    chrome.storage?.onChanged?.addListener(onStorageChanged);
    cleanupManager.registerCleanupFunction(
      () => chrome.storage?.onChanged?.removeListener(onStorageChanged),
      CleanupPositions.RemoveStorageOnChangedListener,
    );

    const delay = getInitializationDelay();

    if (delay === 0) {
      // Immediate initialization for foreground tabs
      initializeFeatures();
    } else {
      // Delayed initialization for background tabs
      initializationTimer = window.setTimeout(() => {
        initializationTimer = null;
        initializeFeatures();
      }, delay);
    }

    // Listen for visibility changes to handle tab switching
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Setup cleanup on page unload to prevent memory leaks
    window.addEventListener('beforeunload', () => {
      try {
        cleanupManager.executeCleanups();
      } catch (e) {
        if (isExtensionContextInvalidatedError(e)) {
          return;
        }
        console.error('[Gemini Voyager] Cleanup error:', e);
      }
    });
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) {
      return;
    }
    console.error('[Gemini Voyager] Fatal initialization error:', e);
  }
})();
