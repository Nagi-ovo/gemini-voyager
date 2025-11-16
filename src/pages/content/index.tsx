import { startChatWidthAdjuster } from './chatWidth/index';
import { startEditInputWidthAdjuster } from './editInputWidth/index';
import { startExportButton } from './export/index';
import { startAIStudioFolderManager } from './folder/aistudio';
import { startFolderManager } from './folder/index';
import { startPromptManager } from './prompt/index';
import { startSidebarWidthAdjuster } from './sidebarWidth';
import { startTimeline } from './timeline/index';

import { startFormulaCopy } from '@/features/formulaCopy';

startSidebarWidthAdjuster();

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
const HEAVY_FEATURE_INIT_DELAY = 100;  // For resource-intensive features (Timeline, Folder)
const LIGHT_FEATURE_INIT_DELAY = 50;   // For lightweight features
const BACKGROUND_TAB_MIN_DELAY = 3000; // Minimum delay for background tabs
const BACKGROUND_TAB_MAX_DELAY = 8000; // Maximum delay for background tabs (3000 + 5000)

let initialized = false;
let initializationTimer: number | null = null;

/**
 * Initialize all features sequentially to reduce simultaneous load
 */
async function initializeFeatures(): Promise<void> {
  if (initialized) return;
  initialized = true;

  try {
    // Sequential initialization with small delays between features
    // to further reduce simultaneous resource usage
    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    if (location.hostname === 'gemini.google.com') {
      // Timeline is most resource-intensive, start it first
      startTimeline();
      await delay(HEAVY_FEATURE_INIT_DELAY);

      startFolderManager();
      await delay(HEAVY_FEATURE_INIT_DELAY);

      startChatWidthAdjuster();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startEditInputWidthAdjuster();
      await delay(LIGHT_FEATURE_INIT_DELAY);

      startFormulaCopy();
      await delay(LIGHT_FEATURE_INIT_DELAY);
    }

    if (
      location.hostname === 'gemini.google.com' ||
      location.hostname === 'aistudio.google.com' ||
      location.hostname === 'aistudio.google.cn'
    ) {
      startPromptManager();
      await delay(HEAVY_FEATURE_INIT_DELAY);
    }

    if (location.hostname === 'aistudio.google.com' || location.hostname === 'aistudio.google.cn') {
      startAIStudioFolderManager();
      await delay(HEAVY_FEATURE_INIT_DELAY);
    }

    startExportButton();
  } catch (e) {
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
    console.log(`[Gemini Voyager] Background tab detected, delaying initialization by ${Math.round(randomDelay)}ms`);
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
try {
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

} catch (e) {
  console.error('[Gemini Voyager] Fatal initialization error:', e);
}
