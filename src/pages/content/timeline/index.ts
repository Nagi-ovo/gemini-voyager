import { TimelineManager } from './manager';

function isGeminiConversationRoute(pathname = location.pathname): boolean {
  // Support account-scoped routes like /u/1/app or /u/0/gem/
  // Matches: "/app", "/gem/", "/u/<num>/app", "/u/<num>/gem/"
  return /^\/(?:u\/\d+\/)?(app|gem)(\/|$)/.test(pathname);
}

type HistoryStateArgs = Parameters<History['pushState']>;

let timelineManagerInstance: TimelineManager | null = null;
let currentUrl = location.href;
let currentPathAndSearch = location.pathname + location.search;
let routeCheckIntervalId: number | null = null;
let routeListenersAttached = false;
let activeObservers: MutationObserver[] = [];
let cleanupHandlers: (() => void)[] = [];
let historyPatched = false;
let originalPushState: History['pushState'] | null = null;
let originalReplaceState: History['replaceState'] | null = null;

function initializeTimeline(): void {
  if (timelineManagerInstance) {
    try {
      timelineManagerInstance.destroy();
    } catch {}
    timelineManagerInstance = null;
  }
  try {
    document.querySelector('.gemini-timeline-bar')?.remove();
  } catch {}
  try {
    document.querySelector('.timeline-left-slider')?.remove();
  } catch {}
  try {
    document.getElementById('gemini-timeline-tooltip')?.remove();
  } catch {}
  timelineManagerInstance = new TimelineManager();
  timelineManagerInstance
    .init()
    .catch((err) => console.error('Timeline initialization failed:', err));
}

let urlChangeTimer: number | null = null;

function handleUrlChange(): void {
  if (location.href === currentUrl) return;

  const newPathAndSearch = location.pathname + location.search;
  const pathChanged = newPathAndSearch !== currentPathAndSearch;

  // Update current URL
  currentUrl = location.href;

  // Only reinitialize if pathname or search changed, not just hash
  if (!pathChanged) {
    console.log('[Timeline] Only hash changed, keeping existing timeline');
    return;
  }

  currentPathAndSearch = newPathAndSearch;

  // Clear any pending initialization
  if (urlChangeTimer) {
    clearTimeout(urlChangeTimer);
    urlChangeTimer = null;
  }

  if (isGeminiConversationRoute()) {
    // Add delay to allow DOM to update after SPA navigation
    console.log('[Timeline] URL changed to conversation route, scheduling initialization');
    urlChangeTimer = window.setTimeout(() => {
      console.log('[Timeline] Initializing timeline after URL change');
      initializeTimeline();
      urlChangeTimer = null;
    }, 500); // Wait for DOM to settle
  } else {
    console.log('[Timeline] URL changed to non-conversation route, cleaning up');
    if (timelineManagerInstance) {
      try {
        timelineManagerInstance.destroy();
      } catch {}
      timelineManagerInstance = null;
    }
    try {
      document.querySelector('.gemini-timeline-bar')?.remove();
    } catch {}
    try {
      document.querySelector('.timeline-left-slider')?.remove();
    } catch {}
    try {
      document.getElementById('gemini-timeline-tooltip')?.remove();
    } catch {}
  }
}

function patchHistoryOnce(): void {
  if (historyPatched) return;
  try {
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    history.pushState = (...args: HistoryStateArgs): void => {
      originalPushState?.apply(history, args);
      handleUrlChange();
    };
    history.replaceState = (...args: HistoryStateArgs): void => {
      originalReplaceState?.apply(history, args);
      handleUrlChange();
    };

    historyPatched = true;
    cleanupHandlers.push(() => {
      if (!historyPatched) return;
      if (originalPushState) history.pushState = originalPushState;
      if (originalReplaceState) history.replaceState = originalReplaceState;
      historyPatched = false;
      originalPushState = null;
      originalReplaceState = null;
    });
  } catch (e) {
    console.warn('[Timeline] Failed to patch history API:', e);
  }
}

function attachRouteListenersOnce(): void {
  if (routeListenersAttached) return;
  routeListenersAttached = true;
  patchHistoryOnce();
  window.addEventListener('popstate', handleUrlChange);
  window.addEventListener('hashchange', handleUrlChange);
  routeCheckIntervalId = window.setInterval(() => {
    if (location.href !== currentUrl) handleUrlChange();
  }, 800);

  // Register cleanup handlers for proper resource management
  cleanupHandlers.push(() => {
    window.removeEventListener('popstate', handleUrlChange);
    window.removeEventListener('hashchange', handleUrlChange);
  });
}

/**
 * Cleanup function to prevent memory leaks
 * Disconnects all observers, clears intervals, and removes event listeners
 */
function cleanup(): void {
  // Cancel any pending delayed initialization
  if (urlChangeTimer) {
    clearTimeout(urlChangeTimer);
    urlChangeTimer = null;
  }

  // Disconnect all active MutationObservers
  activeObservers.forEach((observer) => {
    try {
      observer.disconnect();
    } catch (e) {
      console.error('[Gemini Voyager] Failed to disconnect observer during cleanup:', e);
    }
  });
  activeObservers = [];

  // Clear the route check interval
  if (routeCheckIntervalId !== null) {
    clearInterval(routeCheckIntervalId);
    routeCheckIntervalId = null;
  }

  // Execute all registered cleanup handlers
  cleanupHandlers.forEach((handler) => {
    try {
      handler();
    } catch (e) {
      console.error('[Gemini Voyager] Failed to run cleanup handler:', e);
    }
  });
  cleanupHandlers = [];

  // Reset flag
  routeListenersAttached = false;
}

export function startTimeline(): void {
  const setup = (): void => {
    attachRouteListenersOnce();
    if (isGeminiConversationRoute() && !timelineManagerInstance) {
      initializeTimeline();
    }
  };

  if (document.body) {
    setup();
  } else {
    const initialObserver = new MutationObserver(() => {
      if (!document.body) return;

      // Disconnect and remove from tracking
      initialObserver.disconnect();
      activeObservers = activeObservers.filter((obs) => obs !== initialObserver);

      setup();
    });

    // Track observer for cleanup
    activeObservers.push(initialObserver);
    initialObserver.observe(document.documentElement || document.body, {
      childList: true,
      subtree: true,
    });
  }

  // Setup cleanup on page unload
  window.addEventListener('beforeunload', cleanup, { once: true });

  // Also cleanup on extension unload (if content script is removed)
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onSuspend?.addListener?.(cleanup);
  }
}
