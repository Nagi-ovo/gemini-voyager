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

import {
  FOLDER_SPACING,
  clampFolderDisplay,
  folderDisplayProperties,
  folderRowPadding,
  watchSyncSetting,
} from '../folder/folderDisplay';

type FolderSpacingPlatform = 'gemini' | 'aistudio';

const STYLE_ID = 'gv-folder-spacing-style';
const STORAGE_KEYS: Record<FolderSpacingPlatform, string> = {
  gemini: 'gvFolderSpacing',
  aistudio: 'gvAIStudioFolderSpacing',
};

function applyGeminiSpacing(clamped: number, style: HTMLStyleElement) {
  // Gemini defaults: header 8px, conversation 8px
  const vPad = folderRowPadding(clamped);
  const properties = Object.entries(folderDisplayProperties(FOLDER_SPACING, clamped))
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n      ');

  // The sidebar tree renders in a shadow root and reads the row padding and gap properties.
  style.textContent = `
    .gv-folder-container {
      ${properties}
    }
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
  const clamped = clampFolderDisplay(FOLDER_SPACING, spacing);

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
  let currentSpacing = FOLDER_SPACING.defaultValue;
  // A value that is not a number keeps the one shown (the default at first).
  const stop = watchSyncSetting(STORAGE_KEYS[platform], (value) => {
    if (typeof value === 'number') currentSpacing = clampFolderDisplay(FOLDER_SPACING, value);
    applySpacing(currentSpacing, platform);
  });

  // Cleanup on page unload
  window.addEventListener(
    'beforeunload',
    () => {
      removeStyles();
      stop();
    },
    { once: true },
  );
}
