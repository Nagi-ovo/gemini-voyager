/**
 * Adjusts the chat area width based on user settings (stored as viewport %)
 */
import {
  CHAT_WIDTH_PERCENT,
  isCustomizedChatWidth,
  normalizeChatWidthPercent,
} from '@/core/utils/chatAppearanceValues';

import { buildChatWidthCss, chatWidthPx } from './chatWidthCss';
import { createUserTurnProbe } from './userTurnProbe';

const STYLE_ID = 'gemini-voyager-chat-width';
const DEFAULT_PERCENT = CHAT_WIDTH_PERCENT.default;

function applyWidth(widthPercent: number) {
  // Use screen width as reference to compute pixel-based max-width.
  // This provides adaptive behavior for split-screen / narrow windows:
  // - Fullscreen: width ≈ percent% of screen (as intended by the slider)
  // - Split-screen: content fills available space since pixel max-width > viewport
  const widthPx = chatWidthPx(widthPercent);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = buildChatWidthCss(widthPx);
}

function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
}

const ENABLED_KEY = 'gvChatWidthEnabled';

export function startChatWidthAdjuster() {
  let currentWidthPercent = DEFAULT_PERCENT;
  let enabled = false;
  const userTurnProbe = createUserTurnProbe();

  // Load initial state — request keys without defaults so we can distinguish
  // "key never existed" (upgrade) from "explicitly set to false"
  chrome.storage?.sync?.get(['geminiChatWidth', ENABLED_KEY], (res) => {
    const storedWidth = res?.geminiChatWidth;
    const normalized = normalizeChatWidthPercent(storedWidth);
    currentWidthPercent = normalized;

    const enabledRaw = res?.[ENABLED_KEY];
    if (enabledRaw === undefined) {
      // Upgrade path: enabled key was never set.
      // Auto-enable if user had previously customized the width.
      enabled = isCustomizedChatWidth(storedWidth);
      if (enabled) {
        try {
          chrome.storage?.sync?.set({ [ENABLED_KEY]: true });
        } catch {}
      }
    } else {
      enabled = enabledRaw === true;
    }

    if (enabled) {
      applyWidth(currentWidthPercent);
      userTurnProbe.check();
    }

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
    if (area !== 'sync') return;

    if (changes[ENABLED_KEY]) {
      enabled = changes[ENABLED_KEY].newValue === true;
      if (enabled) {
        applyWidth(currentWidthPercent);
        userTurnProbe.check();
      } else {
        removeStyles();
        userTurnProbe.reset();
      }
    }

    if (changes.geminiChatWidth) {
      const newWidth = changes.geminiChatWidth.newValue;
      if (typeof newWidth === 'number') {
        const normalized = normalizeChatWidthPercent(newWidth);
        currentWidthPercent = normalized;
        if (enabled) {
          applyWidth(currentWidthPercent);
        }

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
      if (enabled) {
        applyWidth(currentWidthPercent);
        userTurnProbe.check();
      }
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
      userTurnProbe.reset();
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
