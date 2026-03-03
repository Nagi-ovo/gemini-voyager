/**
 * Adjusts the chat area width based on user settings (stored as viewport %)
 */

const STYLE_ID = 'gemini-voyager-chat-width';
const DEFAULT_PERCENT = 70;
const MIN_PERCENT = 30;
const MAX_PERCENT = 100;
const LEGACY_BASELINE_PX = 1200;

// Selectors based on the export functionality that already works
function getUserSelectors(): string[] {
  return [
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

const clampPercent = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const normalizePercent = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  if (value > MAX_PERCENT) {
    const approx = (value / LEGACY_BASELINE_PX) * 100;
    return clampPercent(approx, MIN_PERCENT, MAX_PERCENT);
  }
  return clampPercent(value, MIN_PERCENT, MAX_PERCENT);
};

function applyWidth(widthPercent: number) {
  const normalizedPercent = normalizePercent(widthPercent, DEFAULT_PERCENT);
  const widthValue = `${normalizedPercent}vw`;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const userSelectors = getUserSelectors();
  const assistantSelectors = getAssistantSelectors();

  // Build comprehensive CSS rules
  const userRules = userSelectors.map((sel) => `${sel}`).join(',\n    ');
  const assistantRules = assistantSelectors.map((sel) => `${sel}`).join(',\n    ');

  // A small gap to account for scrollbars
  const GAP_PX = 10;

  style.textContent = `
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

    /* Target chat window and related containers; A small gap to account for scrollbars */
    chat-window,
    .chat-container,
    chat-window-content,
    .chat-history-scroll-container,
    .chat-history,
    .conversation-container {
      max-width: none !important;
      padding-right: ${GAP_PX}px !important;
      box-sizing: border-box !important;
    }

    main > div:has(user-query),
    main > div:has(model-response),
    main > div:has(.conversation-container) {
      max-width: none !important;
      width: 100% !important;
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
      }
    }

    /* User query containers */
    ${userRules} {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Model response containers */
    ${assistantRules} {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }
    model-response:has(> .deferred-response-indicator),
    .response-container:has(img[src*="sparkle"]), 
    main > div:has(img[src*="sparkle"]) {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
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
      max-width: ${widthValue} !important;
    }

    /* Target specific internal containers that might have fixed widths */
    .presented-response-container,
    [data-message-author-role] {
      max-width: ${widthValue} !important;
    }

    /* Specific fix for user bubble background to fit content but respect max-width */
    .user-query-bubble-with-background {
      max-width: ${widthValue} !important;
      width: fit-content !important;
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
  let currentWidthPercent = DEFAULT_PERCENT;

  // Load initial width (%), migrating legacy px values when seen
  chrome.storage?.sync?.get({ geminiChatWidth: DEFAULT_PERCENT }, (res) => {
    const storedWidth = res?.geminiChatWidth;
    const normalized = normalizePercent(storedWidth, DEFAULT_PERCENT);
    currentWidthPercent = normalized;
    applyWidth(currentWidthPercent);

    if (typeof storedWidth === 'number' && storedWidth !== normalized) {
      try {
        chrome.storage?.sync?.set({ geminiChatWidth: normalized });
      } catch (e) {
        console.warn('[Gemini Voyager] Failed to migrate chat width to %:', e);
      }
    }
  });

  // Listen for changes from storage
  const storageChangeHandler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'sync' && changes.geminiChatWidth) {
      const newWidth = changes.geminiChatWidth.newValue;
      if (typeof newWidth === 'number') {
        const normalized = normalizePercent(newWidth, DEFAULT_PERCENT);
        currentWidthPercent = normalized;
        applyWidth(currentWidthPercent);

        if (normalized !== newWidth) {
          try {
            chrome.storage?.sync?.set({ geminiChatWidth: normalized });
          } catch (e) {
            console.warn('[Gemini Voyager] Failed to migrate chat width to % on change:', e);
          }
        }
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
      applyWidth(currentWidthPercent);
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
  window.addEventListener(
    'beforeunload',
    () => {
      observer.disconnect();
      removeStyles();
      // Remove storage listener
      try {
        chrome.storage?.onChanged?.removeListener(storageChangeHandler);
      } catch (e) {
        console.error('[Gemini Voyager] Failed to remove storage listener on unload:', e);
      }
    },
    { once: true },
  );
}
