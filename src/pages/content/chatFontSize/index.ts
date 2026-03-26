/**
 * Adjusts the chat message font size based on user settings (stored as percentage)
 */

const STYLE_ID = 'gemini-voyager-chat-font-size';
const DEFAULT_PERCENT = 100;
const MIN_PERCENT = 80;
const MAX_PERCENT = 150;

const ENABLED_KEY = 'gvChatFontSizeEnabled';
const VALUE_KEY = 'gvChatFontSize';

const clampPercent = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

const normalizePercent = (value: number, fallback: number) => {
  if (!Number.isFinite(value)) return fallback;
  return clampPercent(value, MIN_PERCENT, MAX_PERCENT);
};

function applyFontSize(percent: number) {
  const normalized = normalizePercent(percent, DEFAULT_PERCENT);
  const sizeValue = `${normalized}%`;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    /* User message inner text elements (Gemini sets font-size on these directly) */
    .query-text,
    .query-text-line,
    user-query-content .gds-body-l,
    user-query .gds-body-l,
    .user-query-bubble-with-background .gds-body-l,
    div[aria-label="User message"] .gds-body-l,
    [data-message-author-role="user"] .gds-body-l {
      font-size: ${sizeValue} !important;
      line-height: 1.6 !important;
    }

    /* Model response inner text elements */
    message-content,
    .response-content,
    model-response .markdown,
    model-response .markdown-main-panel,
    .model-response .markdown,
    .model-response .markdown-main-panel,
    response-container .markdown,
    response-container .markdown-main-panel,
    .response-container .markdown,
    .response-container .markdown-main-panel,
    .presented-response-container .markdown,
    .presented-response-container .markdown-main-panel,
    [data-message-author-role="assistant"] .markdown,
    [data-message-author-role="model"] .markdown {
      font-size: ${sizeValue} !important;
      line-height: 1.6 !important;
    }

    /* Markdown block elements that may have their own font-size */
    model-response p,
    model-response li,
    model-response td,
    model-response th,
    .model-response p,
    .model-response li,
    .model-response td,
    .model-response th,
    message-content p,
    message-content li,
    message-content td,
    message-content th {
      font-size: ${sizeValue} !important;
      line-height: 1.6 !important;
    }

    /* Code blocks: slightly smaller than body text */
    model-response code,
    model-response pre,
    .model-response code,
    .model-response pre,
    message-content code,
    message-content pre,
    .code-container,
    .formatted-code-block-internal-container pre,
    .formatted-code-block-internal-container code {
      font-size: calc(${sizeValue} * 0.875) !important;
      line-height: 1.5 !important;
    }
  `;
}

function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
}

export function startChatFontSizeAdjuster() {
  let currentPercent = DEFAULT_PERCENT;
  let enabled = false;

  // Load initial state
  chrome.storage?.sync?.get([VALUE_KEY, ENABLED_KEY], (res) => {
    const storedValue = res?.[VALUE_KEY];
    const numericValue = typeof storedValue === 'number' ? storedValue : DEFAULT_PERCENT;
    const normalized = normalizePercent(numericValue, DEFAULT_PERCENT);
    currentPercent = normalized;

    enabled = res?.[ENABLED_KEY] === true;

    if (enabled) {
      applyFontSize(currentPercent);
    }

    if (typeof storedValue === 'number' && storedValue !== normalized) {
      try {
        chrome.storage?.sync?.set({ [VALUE_KEY]: normalized });
      } catch {}
    }
  });

  // Listen for changes from storage
  const storageChangeHandler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'sync') return;

    if (changes[ENABLED_KEY]) {
      enabled = changes[ENABLED_KEY].newValue === true;
      if (enabled) {
        applyFontSize(currentPercent);
      } else {
        removeStyles();
      }
    }

    if (changes[VALUE_KEY]) {
      const newValue = changes[VALUE_KEY].newValue;
      if (typeof newValue === 'number') {
        const normalized = normalizePercent(newValue, DEFAULT_PERCENT);
        currentPercent = normalized;
        if (enabled) {
          applyFontSize(currentPercent);
        }

        if (normalized !== newValue) {
          try {
            chrome.storage?.sync?.set({ [VALUE_KEY]: normalized });
          } catch {}
        }
      }
    }
  };

  chrome.storage?.onChanged?.addListener(storageChangeHandler);

  // Clean up on unload
  window.addEventListener(
    'beforeunload',
    () => {
      removeStyles();
      try {
        chrome.storage?.onChanged?.removeListener(storageChangeHandler);
      } catch {}
    },
    { once: true },
  );
}
