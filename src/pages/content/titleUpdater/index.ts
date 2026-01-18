import { logger } from '@/core/services/LoggerService';

/**
 * Feature: Auto Update Tab Title
 * Description: Automatically updates the browser tab title to match the current Gemini chat title.
 */

// Candidate selectors for the chat title. 
// These are tried in order to find the most accurate title element in the DOM.
const TITLE_CANDIDATES = [
  'h1[data-test-id="conversation-title"]',
  '.conversation-title',
  'div[role="main"] h1',
  'header h1'
];

let lastTitle = '';

/**
 * Starts the title updater service.
 * Uses MutationObserver to detect page changes and updates title accordingly.
 */
export async function startTitleUpdater() {
  // Check setting before starting
  const { gvTabTitleUpdateEnabled } = await chrome.storage.sync.get({
    gvTabTitleUpdateEnabled: true
  });

  if (!gvTabTitleUpdateEnabled) {
    logger.info('TitleUpdater: Disabled by setting');
    return;
  }

  logger.info('TitleUpdater: Starting service');

  // Use MutationObserver so we react to page navigation/updates without polling
  const observer = new MutationObserver(() => {
    tryUpdateTitle();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true // Watch for text changes in title element
  });

  // Initial run
  tryUpdateTitle();
}

/**
 * Attempts to update the document title if a valid chat title is found.
 */
function tryUpdateTitle() {
  const currentTitle = findChatTitle();
  
  // If we found a valid title and it's different from the current document title (and not just "Gemini")
  if (currentTitle && currentTitle !== document.title && currentTitle !== lastTitle) {
    // We only update if it looks like a real specific title, not "Gemini" generic title
    if (currentTitle.trim().length > 0 && currentTitle !== 'Gemini') {
      document.title = `${currentTitle} - Gemini`;
      lastTitle = currentTitle;
      logger.debug('TitleUpdater: Updated tab title to', document.title);
    }
  }
}

/**
 * Locates the current chat title from the DOM.
 * Includes strict checks to ensure we only extract titles on actual conversation pages.
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

  // 1. Try specific selectors in the main view
  for (const selector of TITLE_CANDIDATES) {
    const el = document.querySelector(selector);
    if (el && el.textContent) {
      return el.textContent.trim();
    }
  }

  // 2. Try to find the active item in the sidebar (fallback)
  // Gemini usually marks the active conversation in the history list
  const activeSidebarItem = document.querySelector<HTMLElement>(
    'nav a[href][aria-current="page"], nav a[href].active, [data-test-id="conversation"][aria-selected="true"]'
  );

  if (activeSidebarItem) {
    // Verify strict URL match to prevent picking random items on homepage
    // The sidebar item should link to the current page
    const anchor = activeSidebarItem instanceof HTMLAnchorElement 
      ? activeSidebarItem 
      : activeSidebarItem.querySelector('a') || activeSidebarItem.closest('a');

    if (anchor instanceof HTMLAnchorElement) {
      try {
        const itemPath = new URL(anchor.href).pathname;
        const currentPath = location.pathname;
        
        // Only use this title if paths match significantly
        // This avoids matching when we are at "/app" and the link is "/app/abc..." (no match)
        if (itemPath !== currentPath && !currentPath.startsWith(itemPath)) {
          return null;
        }
      } catch (e) {
        // Ignore URL parsing errors
      }
    } else {
      // If we found a sidebar item but it doesn't have a link (unlikely for a conversation),
      // we shouldn't assume it matches the current page, so strictly return null.
      return null;
    }

    // Isolate text content from nested elements like tooltips or icons
    // This is a simplified extraction; might need refinement based on exact DOM
    return activeSidebarItem.textContent?.trim() || null; 
  }

  return null;
}
