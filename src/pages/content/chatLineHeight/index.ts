/**
 * Adjusts chat message line height based on user settings (stored as percentage).
 */
import {
  CHAT_LINE_HEIGHT_PERCENT,
  normalizeChatLineHeightPercent,
} from '@/core/utils/chatAppearanceValues';

const STYLE_ID = 'gemini-voyager-chat-line-height';
const DEFAULT_PERCENT = CHAT_LINE_HEIGHT_PERCENT.default;

const ENABLED_KEY = 'gvChatLineHeightEnabled';
const VALUE_KEY = 'gvChatLineHeight';

const formatLineHeight = (percent: number) => `${normalizeChatLineHeightPercent(percent) / 100}`;

function applyLineHeight(percent: number) {
  const lineHeightValue = formatLineHeight(percent);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    /* User message inner text elements (Gemini sets line-height on these directly) */
    body .query-text,
    body .query-text-line,
    body user-query-content .gds-body-l,
    body user-query .gds-body-l,
    body .user-query-bubble-with-background .gds-body-l,
    body div[aria-label="User message"] .gds-body-l,
    body [data-message-author-role="user"] .gds-body-l {
      line-height: ${lineHeightValue} !important;
    }

    /* Model response inner text elements */
    body message-content,
    body .response-content,
    body model-response .markdown,
    body model-response .markdown-main-panel,
    body .model-response .markdown,
    body .model-response .markdown-main-panel,
    body response-container .markdown,
    body response-container .markdown-main-panel,
    body .response-container .markdown,
    body .response-container .markdown-main-panel,
    body .presented-response-container .markdown,
    body .presented-response-container .markdown-main-panel,
    body [data-message-author-role="assistant"] .markdown,
    body [data-message-author-role="model"] .markdown {
      line-height: ${lineHeightValue} !important;
    }

    /* Markdown block elements that may have their own line-height */
    body model-response p,
    body model-response li,
    body model-response td,
    body model-response th,
    body .model-response p,
    body .model-response li,
    body .model-response td,
    body .model-response th,
    body message-content p,
    body message-content li,
    body message-content td,
    body message-content th {
      line-height: ${lineHeightValue} !important;
    }

    /* Code blocks */
    body model-response code,
    body model-response pre,
    body .model-response code,
    body .model-response pre,
    body message-content code,
    body message-content pre,
    body .code-container,
    body .formatted-code-block-internal-container pre,
    body .formatted-code-block-internal-container code {
      line-height: ${lineHeightValue} !important;
    }
  `;
}

function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
}

export function startChatLineHeightAdjuster() {
  let currentPercent = DEFAULT_PERCENT;
  let enabled = false;

  chrome.storage?.sync?.get([VALUE_KEY, ENABLED_KEY], (res) => {
    const storedValue = res?.[VALUE_KEY];
    const normalized = normalizeChatLineHeightPercent(storedValue);
    currentPercent = normalized;

    enabled = res?.[ENABLED_KEY] === true;

    if (enabled) {
      applyLineHeight(currentPercent);
    }

    if (typeof storedValue === 'number' && storedValue !== normalized) {
      try {
        chrome.storage?.sync?.set({ [VALUE_KEY]: normalized });
      } catch {}
    }
  });

  const storageChangeHandler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'sync') return;

    if (changes[ENABLED_KEY]) {
      enabled = changes[ENABLED_KEY].newValue === true;
      if (enabled) {
        applyLineHeight(currentPercent);
      } else {
        removeStyles();
      }
    }

    if (changes[VALUE_KEY]) {
      const newValue = changes[VALUE_KEY].newValue;
      if (typeof newValue === 'number') {
        const normalized = normalizeChatLineHeightPercent(newValue);
        currentPercent = normalized;
        if (enabled) {
          applyLineHeight(currentPercent);
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
