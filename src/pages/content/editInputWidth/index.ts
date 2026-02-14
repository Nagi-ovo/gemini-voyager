/**
 * Adjusts the edit input textarea width based on user settings
 * Targets the edit mode textarea in Gemini conversations
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
 * Selectors for edit mode containers
 * Based on actual Gemini DOM structure with multiple fallbacks
 */
function getEditModeSelectors(): string[] {
  return [
    // Primary selectors based on Gemini's actual DOM structure
    'user-query-content.editing',
    'user-query-content.edit-mode',
    '[data-test-id="edit-mode"]',
    '[data-testid="edit-mode"]',

    // Legacy selectors (kept for backward compatibility)
    '.query-content.edit-mode',
    'div.edit-mode',
    '[class*="edit-mode"]',

    // Additional fallback selectors
    '.edit-form',
    '[role="form"][data-author="user"]',
    'user-query-content form',
    'user-query-content .edit-container',
  ];
}

/**
 * Selectors for textarea elements in edit mode
 */
function getEditTextareaSelectors(): string[] {
  return [
    // Primary: direct textarea within editing containers
    'user-query-content.editing textarea',
    'user-query-content.edit-mode textarea',
    '[data-test-id="edit-mode"] textarea',
    '[data-testid="edit-mode"] textarea',

    // Legacy selectors
    '.edit-mode textarea',
    '.edit-container textarea',
    '.edit-form textarea',

    // Material Design form fields
    '.edit-mode .mat-mdc-input-element',
    '.edit-mode .cdk-textarea-autosize',
    '.edit-container .mat-mdc-input-element',

    // Generic fallbacks
    '[class*="edit-mode"] textarea',
    'user-query-content textarea[aria-label*="Edit"]',
    'user-query-content textarea[placeholder*="Edit"]',
  ];
}

/**
 * Applies the specified width (%) to edit input elements
 * Following the chatWidth pattern with container width removal and precise targeting
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

  const editModeSelectors = getEditModeSelectors();
  const editModeRules = editModeSelectors.join(',\n    ');

  const textareaSelectors = getEditTextareaSelectors();
  const textareaRules = textareaSelectors.join(',\n    ');

  // A small gap to account for scrollbars
  const GAP_PX = 10;

  style.textContent = `
    /* Remove width constraints from outer containers that contain edit mode (similar to chatWidth) */
    .content-wrapper:has(user-query-content.editing),
    .content-wrapper:has(.edit-mode),
    .main-content:has(user-query-content.editing),
    .main-content:has(.edit-mode),
    .content-container:has(user-query-content.editing),
    .content-container:has(.edit-mode) {
      max-width: none !important;
    }

    /* Remove width constraints from main container when it has edit mode */
    [role="main"]:has(user-query-content.editing),
    [role="main"]:has(.edit-mode) {
      max-width: none !important;
    }

    main > div:has(user-query-content.editing),
    main > div:has(.edit-mode) {
      max-width: none !important;
      width: 100% !important;
    }

    /* Target chat window and conversation containers when editing */
    chat-window:has(user-query-content.editing),
    chat-window:has(.edit-mode),
    .chat-container:has(user-query-content.editing),
    .chat-container:has(.edit-mode),
    .conversation-container:has(user-query-content.editing),
    .conversation-container:has(.edit-mode) {
      max-width: none !important;
    }

    /* Target edit mode containers directly with centering */
    ${editModeRules} {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
      padding-right: ${GAP_PX}px !important;
      box-sizing: border-box !important;
    }

    /* Target the edit-container within edit-mode */
    .edit-mode .edit-container,
    .query-content.edit-mode .edit-container,
    user-query-content.editing .edit-container,
    user-query-content.edit-mode .edit-container {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Target Material Design form field */
    .edit-mode .mat-mdc-form-field,
    .edit-container .mat-mdc-form-field,
    .edit-mode .edit-form,
    user-query-content.editing .mat-mdc-form-field,
    user-query-content.edit-mode .mat-mdc-form-field {
      max-width: ${widthValue} !important;
      width: 100% !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Target text field wrapper and flex container */
    .edit-mode .mat-mdc-text-field-wrapper,
    .edit-mode .mat-mdc-form-field-flex,
    .edit-mode .mdc-text-field,
    user-query-content.editing .mat-mdc-text-field-wrapper,
    user-query-content.editing .mat-mdc-form-field-flex,
    user-query-content.editing .mdc-text-field,
    user-query-content.edit-mode .mat-mdc-text-field-wrapper,
    user-query-content.edit-mode .mat-mdc-form-field-flex,
    user-query-content.edit-mode .mdc-text-field {
      max-width: ${widthValue} !important;
      width: 100% !important;
    }

    /* Target form field infix (contains the textarea) */
    .edit-mode .mat-mdc-form-field-infix,
    user-query-content.editing .mat-mdc-form-field-infix,
    user-query-content.edit-mode .mat-mdc-form-field-infix {
      max-width: ${widthValue} !important;
      width: 100% !important;
    }

    /* Target the textarea itself with comprehensive selectors */
    ${textareaRules} {
      max-width: ${widthValue} !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    /* Target user query content when in editing mode */
    user-query-content.editing,
    user-query-content.edit-mode {
      max-width: ${widthValue} !important;
      width: min(100%, ${widthValue}) !important;
      margin-left: auto !important;
      margin-right: auto !important;
    }

    /* Target user query bubble background in edit mode */
    user-query-content.editing .user-query-bubble-with-background,
    user-query-content.edit-mode .user-query-bubble-with-background {
      max-width: ${widthValue} !important;
      width: fit-content !important;
    }

    /* Fallback for browsers without :has() support */
    @supports not selector(:has(*)) {
      .content-wrapper,
      .main-content,
      .content-container {
        max-width: none !important;
      }
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
  // Use debouncing and cache the width to avoid storage reads
  let debounceTimer: number | null = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer !== null) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = window.setTimeout(() => {
      // Use cached width instead of reading from storage
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
      attributeFilter: ['class'], // Watch for class changes (e.g., edit-mode added)
    });
  }

  // Clean up on unload
  window.addEventListener('beforeunload', () => {
    observer.disconnect();
    removeStyles();
  });
}
