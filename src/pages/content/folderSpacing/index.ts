/**
 * Adjusts the spacing (gap) between folders and conversations in the sidebar
 * based on user settings stored in chrome.storage.sync.
 *
 * Gemini and AI Studio use separate storage keys so users can configure
 * each platform independently (similar to sidebar width).
 *
 * Platform differences:
 * - Gemini: folder-item-header padding 8px 12px, conversation 8px 6px
 * - AI Studio: folder-item-header padding 6px 10px, more compact sidebar
 */

type FolderSpacingPlatform = 'gemini' | 'aistudio';

const STYLE_ID = 'gv-folder-spacing-style';
const STORAGE_KEYS: Record<FolderSpacingPlatform, string> = {
  gemini: 'gvFolderSpacing',
  aistudio: 'gvAIStudioFolderSpacing',
};
const DEFAULT_SPACING = 2;
const MIN_SPACING = 0;
const MAX_SPACING = 16;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPACING;
  return Math.min(MAX_SPACING, Math.max(MIN_SPACING, Math.round(value)));
}

function applyGeminiSpacing(clamped: number, style: HTMLStyleElement) {
  // Gemini defaults: header 8px, conversation 8px
  //   At spacing 0 → 4px, spacing 2 → 5px, spacing 16 → 12px
  const vPad = Math.max(4, Math.round(4 + clamped * 0.5));

  style.textContent = `
    .gv-folder-list {
      gap: ${clamped}px !important;
    }
    .gv-folder-content {
      gap: ${clamped}px !important;
    }
    .gv-folder-item-header {
      padding-top: ${vPad}px !important;
      padding-bottom: ${vPad}px !important;
    }
    .gv-folder-conversation {
      padding-top: ${vPad}px !important;
      padding-bottom: ${vPad}px !important;
    }
  `;
}

function applyAIStudioSpacing(clamped: number, style: HTMLStyleElement) {
  // AI Studio defaults: header 6px, more compact sidebar
  //   At spacing 0 → 3px, spacing 2 → 4px, spacing 16 → 10px
  const vPad = Math.max(3, Math.round(3 + clamped * 0.45));

  style.textContent = `
    .gv-aistudio .gv-folder-list {
      gap: ${clamped}px !important;
    }
    .gv-aistudio .gv-folder-content {
      gap: ${clamped}px !important;
    }
    .gv-aistudio .gv-folder-item-header {
      padding-top: ${vPad}px !important;
      padding-bottom: ${vPad}px !important;
    }
    .gv-aistudio .gv-folder-conversation {
      padding-top: ${vPad}px !important;
      padding-bottom: ${vPad}px !important;
    }
    .gv-aistudio .gv-folder-uncategorized-content {
      gap: ${clamped}px !important;
    }
  `;
}

function applySpacing(spacing: number, platform: FolderSpacingPlatform) {
  const clamped = clamp(spacing);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  if (platform === 'aistudio') {
    applyAIStudioSpacing(clamped, style);
  } else {
    applyGeminiSpacing(clamped, style);
  }
}

function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

/**
 * Start the folder spacing adjuster for a specific platform.
 * Each platform reads/writes its own storage key so settings are independent.
 */
export function startFolderSpacingAdjuster(platform: FolderSpacingPlatform = 'gemini') {
  const storageKey = STORAGE_KEYS[platform];
  let currentSpacing = DEFAULT_SPACING;

  // Load initial spacing from storage
  chrome.storage?.sync?.get({ [storageKey]: DEFAULT_SPACING }, (res) => {
    const stored = res?.[storageKey];
    if (typeof stored === 'number') {
      currentSpacing = clamp(stored);
    }
    applySpacing(currentSpacing, platform);
  });

  // Listen for changes from popup or other sources
  const storageChangeHandler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'sync' && changes[storageKey]) {
      const newValue = changes[storageKey].newValue;
      if (typeof newValue === 'number') {
        currentSpacing = clamp(newValue);
        applySpacing(currentSpacing, platform);
      }
    }
  };

  chrome.storage?.onChanged?.addListener(storageChangeHandler);

  // Cleanup on page unload
  window.addEventListener(
    'beforeunload',
    () => {
      removeStyles();
      try {
        chrome.storage?.onChanged?.removeListener(storageChangeHandler);
      } catch {
        // Ignore errors during cleanup
      }
    },
    { once: true },
  );
}
