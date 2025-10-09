import { TimelineManager } from './manager';

function isGeminiConversationRoute(pathname = location.pathname): boolean {
  return pathname.startsWith('/app') || pathname.startsWith('/gem/');
}

let timelineManagerInstance: TimelineManager | null = null;
let currentUrl = location.href;
let routeCheckIntervalId: number | null = null;
let routeListenersAttached = false;

function initializeTimeline(): void {
  if (timelineManagerInstance) {
    try {
      timelineManagerInstance.destroy();
    } catch {}
    timelineManagerInstance = null;
  }
  try {
    document.querySelector('.chatgpt-timeline-bar')?.remove();
  } catch {}
  try {
    document.querySelector('.timeline-left-slider')?.remove();
  } catch {}
  try {
    document.getElementById('chatgpt-timeline-tooltip')?.remove();
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
      document.querySelector('.chatgpt-timeline-bar')?.remove();
    } catch {}
    try {
      document.querySelector('.timeline-left-slider')?.remove();
    } catch {}
    try {
      document.getElementById('chatgpt-timeline-tooltip')?.remove();
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
}

export function startTimeline(): void {
  // Immediately initialize if we're already on a conversation page
  if (document.body && isGeminiConversationRoute()) {
    initializeTimeline();
  }
  
  const initialObserver = new MutationObserver(() => {
    if (document.body) {
      if (isGeminiConversationRoute()) initializeTimeline();
      initialObserver.disconnect();
      const pageObserver = new MutationObserver(handleUrlChange);
      pageObserver.observe(document.body, { childList: true, subtree: true });
      attachRouteListenersOnce();
    }
  });
  initialObserver.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
  });
}
