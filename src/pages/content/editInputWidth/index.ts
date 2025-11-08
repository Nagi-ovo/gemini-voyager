/**
 * Adjusts the edit input textarea width based on user settings
 * Targets the edit mode textarea in Gemini conversations
 *
 * Based on the chatWidth implementation pattern
 */

const STYLE_ID = 'gemini-voyager-edit-input-width';

/**
 * Selectors for edit mode containers
 * Based on actual DOM structure: .query-content.edit-mode
 */
function getEditModeSelectors(): string[] {
  return [
    '.query-content.edit-mode',
    'div.edit-mode',
    '[class*="edit-mode"]',
  ];
}

/**
 * Applies the specified width to edit input elements
 * Following the chatWidth pattern with container width removal and precise targeting
 */
function applyWidth(width: number): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const editModeSelectors = getEditModeSelectors();
  const editModeRules = editModeSelectors.map(sel => `${sel}`).join(',\n    ');

  style.textContent = `
    /* Remove width constraints from outer containers that contain edit mode (similar to chatWidth) */
    .content-wrapper:has(.edit-mode),
    .main-content:has(.edit-mode),
    .content-container:has(.edit-mode) {
      max-width: none !important;
    }

    /* Remove width constraints from main container when it has edit mode */
    [role="main"]:has(.edit-mode) {
      max-width: none !important;
    }

    main > div:has(.edit-mode) {
      max-width: none !important;
      width: 100% !important;
    }

    /* Target edit mode containers directly */
    ${editModeRules} {
      max-width: ${width}px !important;
      width: auto !important;
    }

    /* Target the edit-container within edit-mode */
    .edit-mode .edit-container,
    .query-content.edit-mode .edit-container {
      max-width: ${width}px !important;
      width: ${width}px !important;
    }

    /* Target Material Design form field */
    .edit-mode .mat-mdc-form-field,
    .edit-container .mat-mdc-form-field,
    .edit-mode .edit-form {
      max-width: ${width}px !important;
      width: 100% !important;
    }

    /* Target text field wrapper and flex container */
    .edit-mode .mat-mdc-text-field-wrapper,
    .edit-mode .mat-mdc-form-field-flex,
    .edit-mode .mdc-text-field {
      max-width: ${width}px !important;
      width: 100% !important;
    }

    /* Target form field infix (contains the textarea) */
    .edit-mode .mat-mdc-form-field-infix {
      max-width: ${width}px !important;
      width: 100% !important;
    }

    /* Target the textarea itself */
    .edit-mode textarea,
    .edit-container textarea,
    .edit-mode .mat-mdc-input-element,
    .edit-mode .cdk-textarea-autosize {
      max-width: ${width}px !important;
      width: 100% !important;
      box-sizing: border-box !important;
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
  let currentWidth = 600;

  // Load initial width from storage
  chrome.storage?.sync?.get({ geminiEditInputWidth: 600 }, (res) => {
    currentWidth = res?.geminiEditInputWidth || 600;
    applyWidth(currentWidth);
  });

  // Listen for changes from storage (when user adjusts in popup)
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && changes.geminiEditInputWidth) {
      const newWidth = changes.geminiEditInputWidth.newValue;
      if (typeof newWidth === 'number') {
        currentWidth = newWidth;
        applyWidth(currentWidth);
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
      applyWidth(currentWidth);
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
