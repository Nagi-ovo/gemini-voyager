/**
 * Adjusts the font size (in px) of folder names and conversation titles inside
 * Gemini Voyager's folder panel. Default 13px matches Gemini's native sidebar
 * after the May 2026 redesign; users can pick anything in [12, 18].
 */

const STYLE_ID = 'gv-folder-item-font-size-style';
const STORAGE_KEY = 'gvFolderItemFontSize';

export const FOLDER_ITEM_FONT_SIZE_DEFAULT = 13;
export const FOLDER_ITEM_FONT_SIZE_MIN = 12;
export const FOLDER_ITEM_FONT_SIZE_MAX = 18;

export function clampFolderItemFontSize(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return FOLDER_ITEM_FONT_SIZE_DEFAULT;
  return Math.min(FOLDER_ITEM_FONT_SIZE_MAX, Math.max(FOLDER_ITEM_FONT_SIZE_MIN, Math.round(n)));
}

function applyFontSize(px: number) {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  // Line-height tracks font-size so taller fonts breathe. Roughly the same ratio
  // (~1.3) Gemini uses for its native sidebar text.
  const lineHeight = Math.round(px * 1.3);
  style.textContent = `
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
  let current = FOLDER_ITEM_FONT_SIZE_DEFAULT;

  chrome.storage?.sync?.get({ [STORAGE_KEY]: FOLDER_ITEM_FONT_SIZE_DEFAULT }, (res) => {
    current = clampFolderItemFontSize(res?.[STORAGE_KEY]);
    applyFontSize(current);
  });

  const handler = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'sync' || !changes[STORAGE_KEY]) return;
    current = clampFolderItemFontSize(changes[STORAGE_KEY].newValue);
    applyFontSize(current);
  };

  chrome.storage?.onChanged?.addListener(handler);

  window.addEventListener(
    'beforeunload',
    () => {
      removeStyles();
      try {
        chrome.storage?.onChanged?.removeListener(handler);
      } catch {
        // ignore
      }
    },
    { once: true },
  );
}
