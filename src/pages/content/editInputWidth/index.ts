/**
 * Adjusts the edit input textarea width based on user settings
 * Targets the bottom input field in Gemini conversations
 *
 * Based on the chatWidth implementation pattern
 */

const STYLE_ID = 'gemini-voyager-edit-input-width';
const DEFAULT_PERCENT = 60;
const MIN_PERCENT = 30;
const MAX_PERCENT = 100;
const LEGACY_BASELINE_PX = 1200;

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

/**
 * Apply width styles to the bottom input field
 * Targets .text-input-field which is the main input container
 */
function applyWidth(widthPercent: number): void {
  const normalizedPercent = normalizePercent(widthPercent, DEFAULT_PERCENT);
  const widthValue = `${normalizedPercent}vw`;

  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  style.textContent = `
    /* Remove max-width constraints from all parent containers */
    main,
    [role="main"],
    main > div,
    [role="main"] > div,
    .content-wrapper,
    .main-content,
    .content-container,
    chat-window,
    .chat-container,
    .chat-window,
    .conversation-container {
      max-width: none !important;
    }

    /* Target the input area container (the dark gray bar at bottom) */
    .input-area,
    div[class*="input-area"],
    [class*="input-area"] {
      max-width: ${widthValue} !important;
      width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Target the input container and related elements */
    .input-container,
    .chat-input-container,
    .text-input-container,
    [class*="input-container"],
    main > div:last-child,
    [role="main"] > div:last-child,
    .fixed-bottom,
    [class*="fixed"][class*="bottom"] {
      max-width: ${widthValue} !important;
      width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Target the main input field container */
    .text-input-field,
    div[class*="text-input-field"],
    [class*="text-input-field"] {
      max-width: 100% !important;
      width: 100% !important;
    }

    /* Target all children of text-input-field */
    .text-input-field *,
    .text-input-field > * {
      max-width: 100% !important;
    }

    /* Target the textarea wrapper inside input field */
    .text-input-field .text-input-field_textarea-wrapper,
    .text-input-field .text-input-field-main-area,
    .text-input-field .text-input-field_textarea-inner,
    .text-input-field rich-textarea,
    .text-input-field .ql-editor,
    .text-input-field .ql-container,
    .text-input-field .ql-editor * {
      max-width: 100% !important;
      width: 100% !important;
    }

    /* Target the leading actions wrapper (buttons below input) */
    .text-input-field .leading-actions-wrapper,
    .text-input-field .trailing-actions-wrapper {
      max-width: 100% !important;
      width: 100% !important;
    }

    /* Target specific Angular Material form fields in input area */
    .text-input-field .mat-mdc-form-field,
    .text-input-field .mat-mdc-text-field-wrapper,
    .text-input-field .mat-mdc-form-field-flex,
    .text-input-field .mdc-text-field,
    .text-input-field .mat-mdc-form-field-infix {
      max-width: 100% !important;
      width: 100% !important;
    }
  `;
}

/**
 * Removes the injected styles
 */
function removeStyles(): void {
  const style = document.getElementById(STYLE_ID);
  if (style) {
    style.remove();
  }
}

/**
 * Initializes and starts the edit input width adjuster
 */
export function startEditInputWidthAdjuster(): void {
  let currentWidthPercent = DEFAULT_PERCENT;

  // Apply default width immediately
  applyWidth(currentWidthPercent);

  // Load initial width from storage
  chrome.storage?.sync?.get({ geminiEditInputWidth: DEFAULT_PERCENT }, (res) => {
    const storedWidth = res?.geminiEditInputWidth;
    const normalized = normalizePercent(storedWidth, DEFAULT_PERCENT);
    currentWidthPercent = normalized;
    applyWidth(currentWidthPercent);

    if (typeof storedWidth === 'number' && storedWidth !== normalized) {
      try {
        chrome.storage?.sync?.set({ geminiEditInputWidth: normalized });
      } catch (e) {
        console.warn('[Gemini Voyager] Failed to migrate edit input width to %:', e);
      }
    }
  });

  // Listen for changes from storage (when user adjusts in popup)
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && changes.geminiEditInputWidth) {
      const newWidth = changes.geminiEditInputWidth.newValue;
      if (typeof newWidth === 'number') {
        const normalized = normalizePercent(newWidth, DEFAULT_PERCENT);
        currentWidthPercent = normalized;
        applyWidth(currentWidthPercent);

        if (normalized !== newWidth) {
          try {
            chrome.storage?.sync?.set({ geminiEditInputWidth: normalized });
          } catch (e) {
            console.warn('[Gemini Voyager] Failed to migrate edit input width to % on change:', e);
          }
        }
      }
    }
  });

  // Re-apply styles when DOM changes (for dynamic content)
  let debounceTimer: number | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
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
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  // Clean up on unload
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    removeStyles();
  });
}
