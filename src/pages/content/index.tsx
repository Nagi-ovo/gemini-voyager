import { isSafari } from '@/core/utils/browser';
import {
  hasValidExtensionContext,
  isExtensionContextInvalidatedError,
} from '@/core/utils/extensionContext';
import { isGeminiEnterpriseEnvironment } from '@/core/utils/gemini';
import { startFormulaCopy } from '@/features/formulaCopy';
import { initI18n } from '@/utils/i18n';

import { startChatWidthAdjuster } from './chatWidth/index';
import { startContextSync } from './contextSync';
import { startDeepResearchExport } from './deepResearch/index';
import DefaultModelManager from './defaultModel/modelLocker';
import { startEditInputWidthAdjuster } from './editInputWidth/index';
import { startExportButton } from './export/index';
import { startAIStudioFolderManager } from './folder/aistudio';
import { startFolderManager } from './folder/index';
import { startFolderSpacingAdjuster } from './folderSpacing/index';
import { startGemsHider } from './gemsHider/index';
import { startInputCollapse } from './inputCollapse/index';
import { initKaTeXConfig } from './katexConfig';
import { startMarkdownPatcher } from './markdownPatcher/index';
import { startMermaid } from './mermaid/index';
import { startPreventAutoScroll } from './preventAutoScroll/index';
import { startPromptManager } from './prompt/index';
import { startQuoteReply } from './quoteReply/index';
import { startRecentsHider } from './recentsHider/index';
import { startSendBehavior } from './sendBehavior/index';
import { startSidebarAutoHide } from './sidebarAutoHide';
import { startSidebarWidthAdjuster } from './sidebarWidth';
import { startSnowEffect } from './snowEffect/index';
import { startTimeline } from './timeline/index';
import { startTitleUpdater } from './titleUpdater';
import { startWatermarkRemover } from './watermarkRemover/index';

// Suppress Vite's CSS preload errors in the Chrome extension content script context.
// Dynamic imports (e.g., mermaid) trigger Vite's __vitePreload helper which tries to
// create <link> elements with paths like "/assets/foo.css". In a content script, these
// resolve to the web page origin (e.g., https://gemini.google.com/assets/foo.css)
// instead of the extension, causing false "Unable to preload CSS" errors.
// The CSS is already injected via contentStyle.css, so these preloads are unnecessary.
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
});

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

let initialized = false;
let initializationTimer: number | null = null;
let folderManagerInstance: Awaited<ReturnType<typeof startFolderManager>> | null = null;

let promptManagerInstance: Awaited<ReturnType<typeof startPromptManager>> | null = null;
let quoteReplyCleanup: (() => void) | null = null;
let sendBehaviorCleanup: (() => void) | null = null;

/**
 * Check if current hostname matches any custom websites
 */
async function isCustomWebsite(): Promise<boolean> {
  try {
    const result = await chrome.storage?.sync?.get({ gvPromptCustomWebsites: [] });
    const customWebsites = Array.isArray(result?.gvPromptCustomWebsites)
      ? result.gvPromptCustomWebsites
      : [];

    // Normalize current hostname
    const currentHost = location.hostname.toLowerCase().replace(/^www\./, '');

    console.log('[Gemini Voyager] Checking custom websites:', {
      currentHost,
      customWebsites,
      hostname: location.hostname,
    });

    const isCustom = customWebsites.some((website: string) => {
      const normalizedWebsite = website.toLowerCase().replace(/^www\./, '');
      const matches =
        currentHost === normalizedWebsite || currentHost.endsWith('.' + normalizedWebsite);
      console.log('[Gemini Voyager] Comparing:', { currentHost, normalizedWebsite, matches });
      return matches;
    });

    console.log('[Gemini Voyager] Is custom website:', isCustom);
    return isCustom;
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) {
      return false;
    }
    console.error('[Gemini Voyager] Error checking custom websites:', e);
    return false;
  }
}

/**
 * Initialize all features sequentially to reduce simultaneous load
 */
async function initializeFeatures(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    if (!hasValidExtensionContext()) {
      return;
    }
    // Sequential initialization with small delays between features
    // to further reduce simultaneous resource usage
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

    // Check if this is a custom website (only prompt manager should be enabled)
    const isCustomSite = await isCustomWebsite();

    if (isCustomSite) {
      // Only start prompt manager for custom websites
      console.log('[Gemini Voyager] Custom website detected, starting Prompt Manager only');

      promptManagerInstance = await startPromptManager();
      return;
    }

    console.log('[Gemini Voyager] Not a custom website, checking for Gemini/AI Studio');

    const isEnterprise = isGeminiEnterpriseEnvironment(
      {
        hostname: location.hostname,
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
      },
      document,
    );

    if (isEnterprise) {
      console.log('[Gemini Voyager] Gemini Enterprise detected, starting Prompt Manager only');
      promptManagerInstance = await startPromptManager();
      return;
    }

    if (location.hostname === 'gemini.google.com') {
      // Timeline is most resource-intensive, start it first
      startTimeline();
      await delay(HEAVY_FEATURE_INIT_DELAY);

      folderManagerInstance = await startFolderManager();
      await delay(HEAVY_FEATURE_INIT_DELAY);

      startFolderSpacingAdjuster('gemini');
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startChatWidthAdjuster();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startEditInputWidthAdjuster();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startSidebarWidthAdjuster();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startSidebarAutoHide();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startSnowEffect();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startInputCollapse();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startPreventAutoScroll();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startFormulaCopy();

      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Quote Reply - conditionally start based on storage setting
      const quoteReplyResult = await new Promise<{ gvQuoteReplyEnabled?: boolean }>((resolve) => {
        try {
          chrome.storage?.sync?.get({ gvQuoteReplyEnabled: true }, resolve);
        } catch {
          resolve({ gvQuoteReplyEnabled: true });
        }
      });
      if (quoteReplyResult.gvQuoteReplyEnabled !== false) {
        quoteReplyCleanup = startQuoteReply();
      }
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Watermark remover - based on gemini-watermark-remover by journey-ad
      // https://github.com/journey-ad/gemini-watermark-remover
      // Skip on Safari due to fetch interceptor limitations in extension sandbox
      if (!isSafari()) {
        startWatermarkRemover();
      }
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startTitleUpdater();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startDeepResearchExport();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startContextSync();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Send behavior (Ctrl+Enter to send)
      sendBehaviorCleanup = await startSendBehavior();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Recents hider - hide/show toggle for recent items section
      startRecentsHider();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Gems hider - hide/show toggle for Gems list section
      startGemsHider();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Markdown Patcher - fixes broken bold tags due to HTML injection
      startMarkdownPatcher();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Default Model Manager
      DefaultModelManager.getInstance().init();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startExportButton();
      await delay(LIGHT_FEATURE_INIT_DELAY);
    }

    if (
      location.hostname === 'gemini.google.com' ||
      location.hostname === 'aistudio.google.com' ||
      location.hostname === 'aistudio.google.cn'
    ) {
      promptManagerInstance = await startPromptManager();
      await delay(HEAVY_FEATURE_INIT_DELAY);
    }

    if (location.hostname === 'gemini.google.com') {
      // Initialize Mermaid rendering (lightweight)
      startMermaid();
      await delay(LIGHT_FEATURE_INIT_DELAY);
    }

    if (location.hostname === 'aistudio.google.com' || location.hostname === 'aistudio.google.cn') {
      startAIStudioFolderManager();
      await delay(HEAVY_FEATURE_INIT_DELAY);

      startFolderSpacingAdjuster('aistudio');
      await delay(LIGHT_FEATURE_INIT_DELAY);

      // Formula copy support for AI Studio
      startFormulaCopy();
      await delay(LIGHT_FEATURE_INIT_DELAY);
    }
  } catch (e) {
    if (isExtensionContextInvalidatedError(e)) {
      return;
    }
    console.error('[Gemini Voyager] Initialization error:', e);
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
    window.addEventListener('error', onWindowError);

    // Quick check: only run on supported websites
    const hostname = location.hostname.toLowerCase();
    const isSupportedSite =
      hostname.includes('gemini.google.com') ||
      hostname.includes('business.gemini.google') ||
      hostname.includes('aistudio.google.com') ||
      hostname.includes('aistudio.google.cn');

    // Initialize KaTeX configuration early to suppress Unicode warnings
    // This must run before any formulas are rendered on the page
    if (isSupportedSite) {
      initKaTeXConfig();
      // Initialize i18n early to ensure translations are available
      initI18n().catch((e) => console.error('[Gemini Voyager] i18n init error:', e));
    }

    // If not a known site, check if it's a custom website (async)
    if (!isSupportedSite) {
      // For unknown sites, check storage asynchronously
      chrome.storage?.sync?.get({ gvPromptCustomWebsites: [] }, (result) => {
        const customWebsites = Array.isArray(result?.gvPromptCustomWebsites)
          ? result.gvPromptCustomWebsites
          : [];
        const currentHost = hostname.replace(/^www\./, '');

        const isCustomSite = customWebsites.some((website: string) => {
          const normalizedWebsite = website.toLowerCase().replace(/^www\./, '');
          return currentHost === normalizedWebsite || currentHost.endsWith('.' + normalizedWebsite);
        });

        if (isCustomSite) {
          console.log('[Gemini Voyager] Custom website detected:', hostname);
          initializeFeatures();
        } else {
          // Not a supported site, exit early
          console.log('[Gemini Voyager] Not a supported website, skipping initialization');
        }
      });
      return;
    }

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
        window.removeEventListener('unhandledrejection', onUnhandledRejection);
        window.removeEventListener('error', onWindowError);
        if (folderManagerInstance) {
          folderManagerInstance.destroy();
          folderManagerInstance = null;
        }
        if (promptManagerInstance) {
          promptManagerInstance.destroy();
          promptManagerInstance = null;
        }
        if (quoteReplyCleanup) {
          quoteReplyCleanup();
          quoteReplyCleanup = null;
        }
        if (sendBehaviorCleanup) {
          sendBehaviorCleanup();
          sendBehaviorCleanup = null;
        }
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
