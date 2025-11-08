/**
 * Adjusts the edit input textarea width based on user settings
 * Targets the edit mode textarea in Gemini conversations
 */

const STYLE_ID = 'gemini-voyager-edit-input-width';

/**
 * Selectors for edit mode containers and input elements
 */
function getEditModeSelectors(): string[] {
  return [
    '.query-content.edit-mode',
    '.edit-container',
    '.edit-form',
    '.mat-mdc-form-field',
    '[class*="edit-mode"]',
    '[class*="edit-container"]',
    '[class*="edit-form"]',
  ];
}

/**
 * Applies the specified width to edit input elements
 */
function applyWidth(width: number): void {
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement;
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }

  const selectors = getEditModeSelectors();
  const selectorRules = selectors.map(sel => `${sel}`).join(',\n    ');

  style.textContent = `
    /* Target edit mode containers */
    ${selectorRules} {
      max-width: ${width}px !important;
      width: ${width}px !important;
    }

    /* Target the form field within edit mode */
    .edit-container .mat-mdc-form-field,
    .edit-container .edit-form,
    .query-content.edit-mode .mat-mdc-form-field {
      max-width: ${width}px !important;
      width: ${width}px !important;
    }

    /* Target textarea and text field wrappers */
    .edit-mode .mat-mdc-text-field-wrapper,
    .edit-form .mat-mdc-text-field-wrapper,
    .edit-mode .mat-mdc-form-field-flex {
      max-width: ${width}px !important;
      width: 100% !important;
    }

    /* Target the textarea itself */
    .edit-mode textarea,
    .edit-container textarea,
    .edit-form textarea,
    .mat-mdc-input-element.cdk-textarea-autosize {
      max-width: ${width}px !important;
      width: 100% !important;
      box-sizing: border-box !important;
    }

    /* Ensure parent containers don't overflow */
    .edit-mode .mat-mdc-form-field-infix {
      max-width: ${width}px !important;
      width: 100% !important;
    }

    /* Additional targeting for Material Design components */
    .edit-mode .mdc-text-field,
    .edit-mode .mdc-text-field--outlined {
      max-width: ${width}px !important;
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
