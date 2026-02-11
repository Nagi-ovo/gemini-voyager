/**
 * Feature: Auto Update Tab Title
 * Description: Automatically updates the browser tab title to match the current Gemini chat title.
 * Performance: Targeted observer on top-bar-actions + History API interception.
 */

let lastTitle = '';
let lastUrl = '';
let observer: MutationObserver | null = null;

/**
 * Starts the title updater service.
 * Uses targeted MutationObserver + History API interception for best performance.
 */
export async function startTitleUpdater() {
  const { gvTabTitleUpdateEnabled } = await chrome.storage.sync.get({
    gvTabTitleUpdateEnabled: true,
  });

  if (!gvTabTitleUpdateEnabled) return;

  lastUrl = location.href;

  // Throttled update function (500ms)
  let throttleTimer: ReturnType<typeof setTimeout> | null = null;
  const throttledUpdate = () => {
    if (throttleTimer) return;
    throttleTimer = setTimeout(() => {
      throttleTimer = null;
      tryUpdateTitle();
    }, 500);
  };

  // Handle URL changes - reset title cache and re-attach observer
  const handleUrlChange = () => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastTitle = '';
      attachObserver();
      tryUpdateTitle();
    }
  };

  // Smart observer attachment - targets top-bar-actions for minimal scope
  const attachObserver = () => {
    if (observer) observer.disconnect();

    // Target the most specific container: top-bar-actions or conversation-title-container
    const target =
      document.querySelector('top-bar-actions') ||
      document.querySelector('.conversation-title-container') ||
      document.querySelector('.center-section') ||
      document.querySelector('header');

    if (!target) {
      // Container not ready yet, watch for it
      observer = new MutationObserver(() => {
        if (document.querySelector('top-bar-actions') || document.querySelector('header')) {
          attachObserver();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      return;
    }

    observer = new MutationObserver(throttledUpdate);
    observer.observe(target, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  };

  // Intercept History API for SPA navigation detection
  const originalPushState = history.pushState.bind(history);
  const originalReplaceState = history.replaceState.bind(history);

  history.pushState = (...args) => {
    originalPushState(...args);
    handleUrlChange();
  };

  history.replaceState = (...args) => {
    originalReplaceState(...args);
    handleUrlChange();
  };

  // Also listen for browser back/forward
  window.addEventListener('popstate', handleUrlChange);

  // Initialize
  attachObserver();
  tryUpdateTitle();
}

/**
 * Updates document title based on current chat.
 * Restores default title when not on a conversation page.
 */
function tryUpdateTitle() {
  const currentTitle = findChatTitle();

  // Restore default title if not on conversation page
  if (!currentTitle) {
    if (document.title !== 'Google Gemini') {
      document.title = 'Google Gemini';
      lastTitle = '';
    }
    return;
  }

  // Update only if title actually changed
  if (currentTitle !== lastTitle) {
    document.title = `${currentTitle} - Gemini`;
    lastTitle = currentTitle;
  }
}

/**
 * Extracts chat title from top bar area only.
 * Returns null if not on a conversation page or title not found.
 */
function findChatTitle(): string | null {
  // Only run on conversation pages: /app/<id> or /gem/<name>/<id>
  // Also support multi-user prefix: /u/0/, /u/1/, etc.
  if (!/^(?:\/u\/\d+)?\/(?:app|gem\/[a-zA-Z0-9%\-_]+)\/[a-zA-Z0-9%\-_]+/.test(location.pathname)) {
    return null;
  }

  // Target the title using the stable data-test-id attribute, with class-based fallbacks
  const titleEl = document.querySelector(
    '.conversation-title-container [data-test-id="conversation-title"], ' +
      'top-bar-actions [data-test-id="conversation-title"], ' +
      '.top-bar-actions [data-test-id="conversation-title"], ' +
      '.conversation-title-container .conversation-title.gds-title-m, ' +
      'top-bar-actions .conversation-title.gds-title-m',
  );

  if (titleEl) {
    const text = titleEl.textContent?.trim();
    if (text && text !== 'New chat' && text !== 'Gemini' && text !== 'Google Gemini') {
      return text;
    }
  }

  return null;
}
