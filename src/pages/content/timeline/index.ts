import { TimelineManager } from './manager';

function isGeminiConversationRoute(pathname = location.pathname): boolean {
  // Support account-scoped routes like /u/1/app or /u/0/gem/
  // Matches: "/app", "/gem/", "/u/<num>/app", "/u/<num>/gem/"
  return /^\/(?:u\/\d+\/)?(app|gem)(\/|$)/.test(pathname);
}

let timelineManagerInstance: TimelineManager | null = null;
let currentUrl = location.href;
let routeCheckIntervalId: number | null = null;
let routeListenersAttached = false;
let activeObservers: MutationObserver[] = [];
let cleanupHandlers: (() => void)[] = [];

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

function handleUrlChange(): void {
  if (location.href === currentUrl) return;
  currentUrl = location.href;
  if (isGeminiConversationRoute()) initializeTimeline();
  else {
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

function attachRouteListenersOnce(): void {
  if (routeListenersAttached) return;
  routeListenersAttached = true;
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
  // Disconnect all active MutationObservers
  activeObservers.forEach((observer) => {
    try {
      observer.disconnect();
    } catch {}
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
    } catch {}
  });
  cleanupHandlers = [];

  // Reset flag
  routeListenersAttached = false;
}

export function startTimeline(): void {
  // Immediately initialize if we're already on a conversation page
  if (document.body && isGeminiConversationRoute()) {
    initializeTimeline();
  }

  const initialObserver = new MutationObserver(() => {
    if (document.body) {
      if (isGeminiConversationRoute()) initializeTimeline();

      // Disconnect and remove from tracking
      initialObserver.disconnect();
      activeObservers = activeObservers.filter((obs) => obs !== initialObserver);

      // Create page observer for URL changes
      const pageObserver = new MutationObserver(handleUrlChange);
      pageObserver.observe(document.body, { childList: true, subtree: true });
      activeObservers.push(pageObserver);

      attachRouteListenersOnce();
    }
  });

  // Track observer for cleanup
  activeObservers.push(initialObserver);

  initialObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });

  // Setup cleanup on page unload
  window.addEventListener('beforeunload', cleanup, { once: true });

  // Also cleanup on extension unload (if content script is removed)
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    chrome.runtime.onSuspend?.addListener?.(cleanup);
  }
}
