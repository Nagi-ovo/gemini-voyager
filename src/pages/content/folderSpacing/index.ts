/**
 * Adjusts the spacing (gap) between folders and conversations in the sidebar
 * based on user settings stored in chrome.storage.sync.
 */

const STYLE_ID = 'gv-folder-spacing-style';
const STORAGE_KEY = 'gvFolderSpacing';
const DEFAULT_SPACING = 2;
const MIN_SPACING = 0;
const MAX_SPACING = 16;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_SPACING;
  return Math.min(MAX_SPACING, Math.max(MIN_SPACING, Math.round(value)));
}

function applySpacing(spacing: number) {
  const clamped = clamp(spacing);

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  // Scale vertical padding proportionally:
  // At spacing 0 → 4px (compact, no overlap thanks to min padding)
  // At spacing 2 (default) → 5px
  // At spacing 16 → 12px (spacious)
  // The folder-item-header has horizontal padding 12px, conversation has 6px — keep those intact.
  const itemVerticalPadding = Math.max(4, Math.round(4 + clamped * 0.5));

  style.textContent = `
    /* Gap between folder items */
    .gv-folder-list {
      gap: ${clamped}px !important;
    }
    /* Gap between conversation items within a folder */
    .gv-folder-content {
      gap: ${clamped}px !important;
    }
    /* Vertical padding on folder headers */
    .gv-folder-item-header {
      padding-top: ${itemVerticalPadding}px !important;
      padding-bottom: ${itemVerticalPadding}px !important;
    }
    /* Vertical padding on conversation items */
    .gv-folder-conversation {
      padding-top: ${itemVerticalPadding}px !important;
      padding-bottom: ${itemVerticalPadding}px !important;
    }
  `;
}

function removeStyles() {
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();
}

export function startFolderSpacingAdjuster() {
  let currentSpacing = DEFAULT_SPACING;

  // Load initial spacing from storage
  chrome.storage?.sync?.get({ [STORAGE_KEY]: DEFAULT_SPACING }, (res) => {
    const stored = res?.[STORAGE_KEY];
    if (typeof stored === 'number') {
      currentSpacing = clamp(stored);
    }
    applySpacing(currentSpacing);
  });

  // Listen for changes from popup or other sources
  const storageChangeHandler = (
    changes: Record<string, chrome.storage.StorageChange>,
    area: string,
  ) => {
    if (area === 'sync' && changes[STORAGE_KEY]) {
      const newValue = changes[STORAGE_KEY].newValue;
      if (typeof newValue === 'number') {
        currentSpacing = clamp(newValue);
        applySpacing(currentSpacing);
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
