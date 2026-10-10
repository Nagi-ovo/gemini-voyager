/**
 * Adjusts the font size (in px) of folder names and conversation titles inside
 * Gemini Voyager's folder panel. Default 13px matches Gemini's native sidebar
 * after the May 2026 redesign; users can pick anything in [12, 18].
 */
import {
  FOLDER_FONT_SIZE,
  clampFolderDisplay,
  folderDisplayProperties,
  folderItemLineHeight,
  watchSyncSetting,
} from '../folder/folderDisplay';

const STYLE_ID = 'gv-folder-item-font-size-style';

export function clampFolderItemFontSize(value: unknown): number {
  return clampFolderDisplay(FOLDER_FONT_SIZE, value);
}

function applyFontSize(px: number) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  const lineHeight = folderItemLineHeight(px);
  const properties = Object.entries(folderDisplayProperties(FOLDER_FONT_SIZE, px))
    .map(([name, value]) => `${name}: ${value};`)
    .join('\n      ');
  // The sidebar tree renders in a shadow root and reads the custom properties.
  style.textContent = `
    .gv-folder-container:not(.gv-aistudio) {
      ${properties}
    }
    .gv-folder-container:not(.gv-aistudio) .gv-folder-name,
    .gv-folder-container:not(.gv-aistudio) .gv-conversation-title {
      font-size: ${px}px !important;
      line-height: ${lineHeight}px !important;
    }
  `;
}

function removeStyles() {
  document.getElementById(STYLE_ID)?.remove();
}

export function startFolderItemFontSizeAdjuster() {
  const stop = watchSyncSetting(FOLDER_FONT_SIZE.storageKey, (value) =>
    applyFontSize(clampFolderItemFontSize(value)),
  );

  window.addEventListener(
    'beforeunload',
    () => {
      removeStyles();
      stop();
    },
    { once: true },
  );
}
