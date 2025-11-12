/**
 * Adjusts the chat area width based on user settings
 * CSS-only approach to avoid overlap with right-side timeline:
 * - Inject a fixed right buffer (--gv-chat-right-offset) and apply it as padding-right
 * - This is a conservative, browser-friendly change that avoids JS measurement
 */

const STYLE_ID = 'gemini-voyager-chat-width';

// Small fixed buffer to reserve on the right (change value below if needed)
const RIGHT_BUFFER = 7; // px

// Selectors based on the export functionality that already works
function getUserSelectors(): string[] {
  return [
    '.user-query-bubble-with-background',
    '.user-query-bubble-container',
    '.user-query-container',
    'user-query-content',
    'user-query',
    'div[aria-label="User message"]',
    'article[data-author="user"]',
    '[data-message-author-role="user"]',
  ];
}

function getAssistantSelectors(): string[] {
  return [
    'model-response',
    '.model-response',
    'response-container',
    '.response-container',
    '.presented-response-container',
    '[aria-label="Gemini response"]',
    '[data-message-author-role="assistant"]',
    '[data-message-author-role="model"]',
    'article[data-author="assistant"]',
  ];
}

function applyWidth(width: number) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const userSelectors = getUserSelectors();
  const assistantSelectors = getAssistantSelectors();

  // Build comprehensive CSS rules
  const userRules = userSelectors.map(sel => `${sel}`).join(',\n    ');
  const assistantRules = assistantSelectors.map(sel => `${sel}`).join(',\n    ');

  // Inject a CSS variable --gv-chat-right-offset with a fixed px buffer.
  // We apply padding-right to chat containers to avoid overlap with a right-side timeline / wide scrollbar.
  style.textContent = `
    :root { --gv-chat-right-offset: ${RIGHT_BUFFER}px !important; }

    /* Remove width constraints from outer containers that contain conversations */
    .content-wrapper:has(chat-window),
    .main-content:has(chat-window),
    .content-container:has(chat-window),
    .content-container:has(.conversation-container) {
      max-width: none !important;
    }

    /* Remove width constraints from main and conversation containers, but not buttons */
    [role="main"]:has(chat-window),
    [role="main"]:has(.conversation-container) {
      max-width: none !important;
    }

    /* Target chat window and related containers:
       apply right padding equal to the fixed buffer to avoid overlap with right-side panels */
    chat-window,
    .chat-container,
    chat-window-content,
    .chat-history-scroll-container,
    .chat-history,
    .conversation-container {
      max-width: none !important;
      padding-right: var(--gv-chat-right-offset) !important;
      box-sizing: border-box !important;
    }

    main > div:has(user-query),
    main > div:has(model-response),
    main > div:has(.conversation-container) {
      max-width: none !important;
      width: 100% !important;
      padding-right: var(--gv-chat-right-offset) !important;
      box-sizing: border-box !important;
    }

    /* Fallback for browsers without :has() support */
    @supports not selector(:has(*)) {
      .content-wrapper,
      .main-content,
      .content-container {
        max-width: none !important;
      }

      main > div:not(:has(button)):not(.main-menu-button) {
        max-width: none !important;
        width: 100% !important;
        padding-right: var(--gv-chat-right-offset) !important;
        box-sizing: border-box !important;
      }
    }

    /* User query containers */
    ${userRules} {
      max-width: ${width}px !important;
      width: auto !important;
      padding-right: var(--gv-chat-right-offset) !important;
      box-sizing: border-box !important;
    }

    /* Model response containers */
    ${assistantRules} {
      max-width: ${width}px !important;
      width: auto !important;
      padding-right: var(--gv-chat-right-offset) !important;
      box-sizing: border-box !important;
    }

    /* Additional deep targeting for nested elements */
    user-query,
    user-query > *,
    user-query > * > *,
    model-response,
    model-response > *,
    model-response > * > *,
    response-container,
    response-container > *,
    response-container > * > * {
      max-width: ${width}px !important;
      padding-right: var(--gv-chat-right-offset) !important;
      box-sizing: border-box !important;
    }

    /* Target specific internal containers that might have fixed widths */
    .user-query-bubble-with-background,
    .presented-response-container,
    [data-message-author-role] {
      max-width: ${width}px !important;
      padding-right: var(--gv-chat-right-offset) !important;
      box-sizing: border-box !important;
    }
  `;
}

function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
}

export function startChatWidthAdjuster() {
  let currentWidth = 800;

  // Load initial width
  chrome.storage?.sync?.get({ geminiChatWidth: 800 }, (res) => {
    currentWidth = res?.geminiChatWidth || 800;
    applyWidth(currentWidth);
  });

  // Listen for changes from storage
  const storageChangeHandler = (changes: any, area: string) => {
    if (area === 'sync' && changes.geminiChatWidth) {
      const newWidth = changes.geminiChatWidth.newValue;
      if (typeof newWidth === 'number') {
        currentWidth = newWidth;
        applyWidth(currentWidth);
      }
    }
  };

  chrome.storage?.onChanged?.addListener(storageChangeHandler);

  // Re-apply styles when DOM changes (for dynamic content)
  // Use debouncing and cache the width to avoid storage reads
  let debounceTimer: number | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      // Use cached width instead of reading from storage
      applyWidth(currentWidth);
      debounceTimer = null;
    }, 200);
  });

  // Observe the main conversation area for changes
  const main = document.querySelector('main');
  if (main) {
    observer.observe(main, {
      childList: true,
      subtree: true,
    });
  }

  // Clean up on unload to prevent memory leaks
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    removeStyles();
    // Remove storage listener
    try {
      chrome.storage?.onChanged?.removeListener(storageChangeHandler);
    } catch (e) {
      console.error('[Gemini Voyager] Failed to remove storage listener on unload:', e);
    }
  }, { once: true });
}