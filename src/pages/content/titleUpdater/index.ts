/**
 * Feature: Auto Update Tab Title
 * Description: Automatically updates the browser tab title to match the current Gemini chat title.
 */

// Fallback selectors - from Gemini Voyager folder manager
const FOLDER_MANAGER_SELECTORS = [
  '.gv-folder-conversation-selected .gv-conversation-title',
  '.gv-folder-conversation.gv-folder-conversation-selected .gv-conversation-title',
];

let lastTitle = '';
let lastUrl = '';

/**
 * Starts the title updater service.
 * Uses MutationObserver with throttle for responsive title updates.
 */
export async function startTitleUpdater() {
  // Check setting before starting
  const { gvTabTitleUpdateEnabled } = await chrome.storage.sync.get({
    gvTabTitleUpdateEnabled: true
  });

  if (!gvTabTitleUpdateEnabled) {
    return;
  }

  // Initialize URL tracking
  lastUrl = location.href;

  // Throttled check function - limits execution frequency
  let isThrottled = false;
  const throttledCheck = () => {
    if (isThrottled) return;
    isThrottled = true;
    
    setTimeout(() => {
      isThrottled = false;
      
      // Check URL change
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        lastTitle = ''; // Reset to allow new title
      }
      
      // Check if page title changed
      const currentPageTitle = findChatTitle();
      if (currentPageTitle && currentPageTitle !== lastTitle) {
        tryUpdateTitle();
      }
    }, 500); // 500ms throttle
  };

  // Strategy 1: Listen for browser back/forward navigation
  window.addEventListener('popstate', () => {
    lastUrl = location.href;
    lastTitle = '';
    tryUpdateTitle();
  });

  // Strategy 2: MutationObserver on header only (where title lives)
  // This is very lightweight - header changes rarely
  const observer = new MutationObserver(throttledCheck);
  
  const setupObserver = () => {
    // Only observe header element - title is inside header
    const header = document.querySelector('header');
    if (header) {
      observer.observe(header, {
        childList: true,
        subtree: true,
        characterData: true // Watch text changes in header (title text)
      });
    } else {
      // Fallback: observe body's direct children only (very lightweight)
      observer.observe(document.body, {
        childList: true,
        subtree: false
      });
    }
  };

  // Set up observer when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupObserver);
  } else {
    setupObserver();
  }

  // Strategy 3: Low-frequency polling as fallback (every 3 seconds)
  // Catches edge cases where observer might miss changes
  setInterval(() => {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      lastTitle = '';
    }
    const currentPageTitle = findChatTitle();
    if (currentPageTitle && currentPageTitle !== lastTitle) {
      tryUpdateTitle();
    }
  }, 3000);

  // Initial run
  tryUpdateTitle();
}

/**
 * Attempts to update the document title if a valid chat title is found.
 * Restores default title when not on a conversation page.
 */
function tryUpdateTitle() {
  const currentTitle = findChatTitle();
  
  // If not on a conversation page or no title found, restore default
  if (!currentTitle) {
    if (lastTitle !== '' && document.title !== 'Google Gemini') {
      document.title = 'Google Gemini';
      lastTitle = '';
    }
    return;
  }
  
  // If we found a valid title and it's different from the last one
  if (currentTitle !== lastTitle) {
    // We only update if it looks like a real specific title, not "Gemini" generic title
    if (currentTitle.trim().length > 0 && currentTitle !== 'Gemini' && currentTitle !== 'Google Gemini') {
      document.title = `${currentTitle} - Gemini`;
      lastTitle = currentTitle;
    }
  }
}

/**
 * Locates the current chat title from the DOM.
 * Includes strict checks to ensure we only extract titles on actual conversation pages.
 * IMPORTANT: Only get title from header area to avoid picking up sidebar items during page load.
 */
function findChatTitle(): string | null {
  const pathname = location.pathname;

  // Strict check: Only run title update if we are on a specific conversation page.
  // URL pattern must be /app/<id>. Use a regex that requires at least one character after /app/.
  // Valid examples: /app/123, /app/abc-def
  // Invalid examples: /app, /app/, /app?param=1
  const isConversationPage = /^\/app\/[a-zA-Z0-9%\-_]+/.test(pathname);

  if (!isConversationPage) {
    return null;
  }

  // Helper to extract and validate text
  const getText = (el: Element | null): string | null => {
    const text = el?.textContent?.trim();
    // Filter out generic/invalid titles
    if (!text || text.length === 0 || text === 'New chat' || text === 'Gemini' || text === 'Google Gemini') {
      return null;
    }
    return text;
  };

  // Helper to check if element is inside sidebar/nav (should be excluded)
  const isInSidebar = (el: Element): boolean => {
    return el.closest('nav') !== null || el.closest('[role="navigation"]') !== null;
  };

  // Strategy 1: Find conversation-title that is NOT in sidebar
  try {
    const allTitles = document.querySelectorAll('span.conversation-title.gds-title-m, .conversation-title.gds-title-m');
    for (const el of allTitles) {
      if (!isInSidebar(el)) {
        const title = getText(el);
        if (title) {
          return title;
        }
      }
    }
  } catch {
    // Ignore errors
  }

  // Strategy 2: Try Gemini Voyager folder manager (if installed and active)
  for (const selector of FOLDER_MANAGER_SELECTORS) {
    try {
      const el = document.querySelector(selector);
      const title = getText(el);
      if (title) {
        return title;
      }
    } catch {
      // Ignore selector errors
    }
  }

  // Don't fall back to sidebar selectors - they can pick up wrong items during page load
  return null;
}
