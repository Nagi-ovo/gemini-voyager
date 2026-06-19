/**
 * Adjusts vertical spacing between chat markdown blocks.
 */
import { StorageKeys } from '@/core/types/common';

const STYLE_ID = 'gv-chat-paragraph-spacing-style';
const DEFAULT_PX = 12;
const MIN_PX = 0;
const MAX_PX = 24;

const clampPx = (value: number) => {
  if (!Number.isFinite(value)) return DEFAULT_PX;
  return Math.min(MAX_PX, Math.max(MIN_PX, Math.round(value)));
};

function applyParagraphSpacing(px: number) {
  const spacing = clampPx(px);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    body model-response :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container),
    body .model-response :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container),
    body message-content :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container),
    body response-container :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container),
    body .response-container :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container),
    body .presented-response-container :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container),
    body [data-message-author-role="assistant"] :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container),
    body [data-message-author-role="model"] :is(p, ul, ol, pre, table, blockquote, .code-container, .formatted-code-block, .formatted-code-block-internal-container) {
      margin-top: ${spacing}px !important;
      margin-bottom: ${spacing}px !important;
    }
  `;
}

function removeStyles() {
  document.getElementById(STYLE_ID)?.remove();
}

export function startChatParagraphSpacingAdjuster() {
  let currentPx = DEFAULT_PX;
  let enabled = false;

  chrome.storage?.sync?.get(
    [StorageKeys.CHAT_PARAGRAPH_SPACING, StorageKeys.CHAT_LINE_HEIGHT_ENABLED],
    (res) => {
      const storedValue = res?.[StorageKeys.CHAT_PARAGRAPH_SPACING];
      currentPx = typeof storedValue === 'number' ? clampPx(storedValue) : DEFAULT_PX;
      enabled = res?.[StorageKeys.CHAT_LINE_HEIGHT_ENABLED] === true;

      if (enabled) {
        applyParagraphSpacing(currentPx);
      }

      if (typeof storedValue === 'number' && storedValue !== currentPx) {
        try {
          chrome.storage?.sync?.set({ [StorageKeys.CHAT_PARAGRAPH_SPACING]: currentPx });
        } catch {}
      }
    },
  );

  const storageChangeHandler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area !== 'sync') return;

    if (changes[StorageKeys.CHAT_LINE_HEIGHT_ENABLED]) {
      enabled = changes[StorageKeys.CHAT_LINE_HEIGHT_ENABLED].newValue === true;
      if (enabled) {
        applyParagraphSpacing(currentPx);
      } else {
        removeStyles();
      }
    }

    if (changes[StorageKeys.CHAT_PARAGRAPH_SPACING]) {
      const newValue = changes[StorageKeys.CHAT_PARAGRAPH_SPACING].newValue;
      if (typeof newValue === 'number') {
        currentPx = clampPx(newValue);
        if (enabled) {
          applyParagraphSpacing(currentPx);
        }

        if (currentPx !== newValue) {
          try {
            chrome.storage?.sync?.set({ [StorageKeys.CHAT_PARAGRAPH_SPACING]: currentPx });
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
