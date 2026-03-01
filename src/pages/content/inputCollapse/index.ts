import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { getTranslationSync } from '../../../utils/i18n';

const STYLE_ID = 'gemini-voyager-input-collapse';
const COLLAPSED_CLASS = 'gv-input-collapsed';
const PLACEHOLDER_CLASS = 'gv-collapse-placeholder';

/**
 * Checks if the current page is the homepage or a new conversation page.
 * These pages have the URL pattern /app or /u/<num>/app without a conversation ID.
 * Examples of homepage/new conversation:
 *   - /app
 *   - /u/0/app
 *   - /u/1/app
 * Examples of existing conversations (should NOT match):
 *   - /app/abc123def456
 *   - /u/0/app/abc123def456
 *   - /gem/xxx/abc123
 */
function isHomepageOrNewConversation(): boolean {
  const pathname = window.location.pathname;
  // Match /app or /u/<num>/app exactly (no conversation ID after /app)
  // Must NOT have anything after /app except optional trailing slash
  return /^\/(?:u\/\d+\/)?app\/?$/.test(pathname);
}

/**
 * Checks if the current page is a gems editor page (create or edit).
 * These pages should not have auto-collapse behavior.
 */
function isGemsEditorPage(): boolean {
  const pathname = window.location.pathname;
  // Match /gems/create, /gems/edit/*, or /u/<num>/gems/create, /u/<num>/gems/edit/*
  return /^\/(?:u\/\d+\/)?gems\/(?:create|edit)\/?/.test(pathname);
}

/**
 * Checks if auto-collapse should be disabled on the current page.
 */
function shouldDisableAutoCollapse(): boolean {
  return isHomepageOrNewConversation() || isGemsEditorPage();
}

/**
 * Injects the CSS styles for the collapsed input state.
 */
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Transitions for the input container */
    .element-to-collapse {
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* 
     * Collapsed State Styles
     */
    .${COLLAPSED_CLASS} {
      /* Compact dimensions */
      height: 48px !important;
      min-height: 48px !important;
      max-height: 48px !important;
      
      /* Pill shape */
      border-radius: 24px !important;
      width: auto !important;
      min-width: 200px !important;
      max-width: 600px !important;
      margin-left: auto !important;
      margin-right: auto !important;
      padding: 0 24px !important;
      
      /* Hide overflow */
      overflow: hidden !important;
      
      /* Visual styling - Clean, no borders if possible to avoid "shadow edge" issues */
      background-color: var(--gm3-sys-color-surface-container, #f0f4f9) !important;
      /* Subtle shadow */
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08) !important;
      border: none !important;
      
      /* Center content */
      display: flex !important;
      align-items: center !important;
      justify-content: center !important;
      
      /* Ensure it's clickable */
      cursor: pointer !important;
      position: relative !important;
      z-index: 999 !important;
      
      /* Reset layout */
      gap: 0 !important;
      transform: none !important;
    }

    /* Hiding Strategy:
       Target ALL descendants that are NOT our placeholder.
       Use opacity 0 to hide.
    */
    .${COLLAPSED_CLASS} > *:not(.${PLACEHOLDER_CLASS}) {
      visibility: hidden !important;
      opacity: 0 !important;
      width: 0 !important;
      height: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      position: absolute !important;
      pointer-events: none !important;
    }

    /* Placeholder Styling - HIDDEN by default */
    .${PLACEHOLDER_CLASS} {
      /* Hidden by default when not collapsed */
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
    }
    
    /* Show placeholder ONLY when collapsed */
    .${COLLAPSED_CLASS} > .${PLACEHOLDER_CLASS} {
      /* Force visibility */
      visibility: visible !important;
      opacity: 1 !important;
      display: flex !important;
      position: relative !important;
      
      /* Typography - Brighter color */
      color: var(--gm3-sys-color-on-surface, #1f1f1f);
      font-family: Google Sans, Roboto, sans-serif;
      font-size: 15px; 
      font-weight: 500;
      white-space: nowrap;
      
      align-items: center;
      gap: 10px;
      pointer-events: none;
    }

    /* Dark mode adjustments */
    @media (prefers-color-scheme: dark) {
      .${COLLAPSED_CLASS} {
        background-color: var(--gm3-sys-color-surface-container-high, #2b2b2b) !important;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3) !important; 
      }
      .${COLLAPSED_CLASS} > .${PLACEHOLDER_CLASS} {
        color: var(--gm3-sys-color-on-surface, #e8eaed);
      }
    }
    
    body[data-theme="dark"] .${COLLAPSED_CLASS},
    body.dark-theme .${COLLAPSED_CLASS} {
        background-color: #2b2b2b !important;
    }
    body[data-theme="dark"] .${COLLAPSED_CLASS} > .${PLACEHOLDER_CLASS},
    body.dark-theme .${COLLAPSED_CLASS} > .${PLACEHOLDER_CLASS} {
        color: #e8eaed;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Finds the logical root of the input bar.
 * We need the container that holds the background color and the full width.
 */
function getInputContainer(): HTMLElement | null {
  const textarea = document.querySelector('rich-textarea');
  if (!textarea) return null;

  let current = textarea.parentElement;
  let bestCandidate: HTMLElement | null = null;

  // Traverse up to 8 levels
  for (let i = 0; i < 8; i++) {
    if (!current) break;

    // Check computed style for background color to find the visual "island"
    const style = window.getComputedStyle(current);
    const hasBackground =
      style.backgroundColor !== 'rgba(0, 0, 0, 0)' && style.backgroundColor !== 'transparent';
    const isFlex = style.display.includes('flex');

    // Check for specific Gemini/Material classes or roles
    // We prioritize the container that has a background color
    if (hasBackground) {
      bestCandidate = current as HTMLElement;
      // If we found a substantial container (flex + background), it's a strong candidate.
      if (isFlex) {
        // Continue one more level just in case there's a wrapper, but update bestCandidate
      }
    }

    // Stop if we hit the limit or dangerous nodes
    if (
      current.tagName === 'MAIN' ||
      current.tagName === 'BODY' ||
      current.classList.contains('content-wrapper')
    ) {
      break;
    }

    current = current.parentElement;
  }

  // If we found a candidate with a background, use it.
  // Otherwise fallback to heuristic parents.
  return bestCandidate || textarea.parentElement?.parentElement || textarea.parentElement;
}

export function expandInputCollapseIfNeeded(): void {
  const container = getInputContainer();
  if (!container) return;
  expand(container);
}

/**
 * Expands the input area and moves cursor to the end (for keyboard shortcut)
 */
export function expandInputWithCursorAtEnd(): void {
  const container = getInputContainer();
  if (!container) return;
  expand(container, true); // true = move cursor to end
}

/**
 * Collapses the input area immediately (for keyboard shortcut)
 * This bypasses the delay and state checks in tryCollapse
 */
export function collapseInput(): void {
  const container = getInputContainer();
  if (!container) return;

  // Immediately collapse (ignore delay and state checks)
  container.classList.add(COLLAPSED_CLASS);

  // Remove focus from the input
  const active = document.activeElement;
  if (active && container.contains(active)) {
    (active as HTMLElement).blur();
  }
}

/**
 * Checks if the input is effectively empty.
 */
function isInputEmpty(container: HTMLElement): boolean {
  // Check the text content of the rich-textarea
  const textarea =
    container.querySelector('rich-textarea') ||
    container.querySelector('textarea') ||
    container.querySelector('[contenteditable="true"]');
  if (!textarea) return true;

  // Check for attachments. If attachments exist, the input is not considered empty.
  const attachmentsArea =
    container.querySelector('uploader-file-preview') ||
    container.querySelector('.file-preview-wrapper');
  if (attachmentsArea) return false;

  const text = textarea.textContent?.trim() || '';
  return text.length === 0;
}

/**
 * Adds the placeholder element to the container if it doesn't exist.
 */
function ensurePlaceholder(container: HTMLElement) {
  if (container.querySelector(`.${PLACEHOLDER_CLASS}`)) return;

  const placeholder = document.createElement('div');
  placeholder.className = PLACEHOLDER_CLASS;

  // Use i18n for the placeholder text
  let text = getTranslationSync('inputCollapsePlaceholder') || 'Message Gemini';

  placeholder.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 -960 960 960" width="20" fill="currentColor">
        <path d="M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z"/>
      </svg>
      <span>${text}</span>
    `;

  container.appendChild(placeholder);
}

export function startInputCollapse() {
  // Check if feature is enabled (default: false)
  chrome.storage?.sync?.get(
    { gvInputCollapseEnabled: false, gvInputCollapseWhenNotEmpty: false },
    (res) => {
      if (res?.gvInputCollapseEnabled === false) {
        // Feature is disabled, don't initialize
        console.log('[Gemini Voyager] Input collapse is disabled');
        return;
      }

      // Feature is enabled, proceed with initialization
      initInputCollapse(res?.gvInputCollapseWhenNotEmpty === true);
    }
  );

  // Listen for setting changes
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && (changes.gvInputCollapseEnabled || changes.gvInputCollapseWhenNotEmpty)) {
      if (changes.gvInputCollapseEnabled?.newValue === false) {
        // Disable: remove styles and classes
        cleanup();
      } else {
        // Enable or setting changed: re-read both settings and re-initialize
        chrome.storage?.sync?.get(
          { gvInputCollapseWhenNotEmpty: false },
          (res) => {
            initInputCollapse(res?.gvInputCollapseWhenNotEmpty === true);
          }
        );
      }
    }
  });
}

let observer: MutationObserver | null = null;
let initialized = false;
let eventController: AbortController | null = null;
let allowCollapseWhenNotEmpty = false; // Track the "collapse when not empty" setting
let collapseTimer: number | null = null; // Timer for delayed collapse

function cleanup() {
  // Clear any pending collapse timer
  if (collapseTimer !== null) {
    clearTimeout(collapseTimer);
    collapseTimer = null;
  }

  // Abort all event listeners managed by the controller
  if (eventController) {
    eventController.abort();
    eventController = null;
  }

  // Remove styles
  const style = document.getElementById(STYLE_ID);
  if (style) style.remove();

  // Remove classes from containers
  document.querySelectorAll(`.${COLLAPSED_CLASS}`).forEach((el) => {
    el.classList.remove(COLLAPSED_CLASS);
  });
  document.querySelectorAll('.element-to-collapse').forEach((el) => {
    el.classList.remove('element-to-collapse');
  });
  document.querySelectorAll('.gv-processed').forEach((el) => {
    el.classList.remove('gv-processed');
  });
  document.querySelectorAll(`.${PLACEHOLDER_CLASS}`).forEach((el) => {
    el.remove();
  });

  // Disconnect observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  initialized = false;
}

function initInputCollapse(allowCollapseNotEmpty: boolean = false) {
  if (initialized) return;
  initialized = true;
  allowCollapseWhenNotEmpty = allowCollapseNotEmpty; // Store the setting

  injectStyles();

  let lastPathname = window.location.pathname;

  // Create AbortController for managing all event listeners
  eventController = new AbortController();
  const { signal } = eventController;

  // Auto-expand the input area when a file is dragged into the window.
  document.addEventListener(
    'dragenter',
    (e) => {
      if (e.dataTransfer?.types.includes('Files')) {
        const container = getInputContainer();
        if (container && container.classList.contains(COLLAPSED_CLASS)) {
          expand(container);
        }
      }
    },
    { signal, capture: true },
  );

  // Handle URL changes for SPA navigation
  const urlChangeHandler = () => {
    const currentPathname = window.location.pathname;
    if (currentPathname === lastPathname) return;

    lastPathname = currentPathname;

    const container = getInputContainer();
    if (!container) return;

    if (shouldDisableAutoCollapse()) {
      // On homepage/new conversation/gems create: expand the input
      container.classList.remove(COLLAPSED_CLASS);
    } else {
      // On conversation page: try to collapse if appropriate
      tryCollapse(container);
    }
  };

  // Listen for URL changes (browser back/forward)
  window.addEventListener('popstate', urlChangeHandler, { signal });

  // MutationObserver to re-apply when Gemini re-renders and detect SPA navigation
  // Use MutationObserver so we re-apply if Gemini re-renders (common in SPAs)
  observer = new MutationObserver(() => {
    // Check for URL changes on DOM mutations (catches SPA navigation)
    urlChangeHandler?.();

    const container = getInputContainer();
    if (container && !container.classList.contains('gv-processed')) {
      container.classList.add('gv-processed');
      container.classList.add('element-to-collapse'); // Add transition class

      ensurePlaceholder(container);

      // Events - use signal for automatic cleanup
      container.addEventListener(
        'click',
        () => {
          expand(container);
        },
        { signal },
      );

      // Capture focus events deeply
      // focusin cancels delayed collapse when focus returns to input area
      container.addEventListener(
        'focusin',
        () => {
          expand(container);
          // If we have a pending collapse, cancel it since focus is coming back
          if (collapseTimer !== null) {
            clearTimeout(collapseTimer);
            collapseTimer = null;
          }
        },
        { signal },
      );

      // Store container reference for use in closures
      const currentContainer = container;

      container.addEventListener(
        'focusout',
        (e) => {
          // Clear any existing timer
          if (collapseTimer !== null) {
            clearTimeout(collapseTimer);
            collapseTimer = null;
          }

          const newFocus = e.relatedTarget as HTMLElement;

          // Check if focus is still inside the container
          if (newFocus && currentContainer.contains(newFocus)) {
            return; // Focus is still inside
          }

          // Use a small delay before collapsing
          // This allows focusin events to cancel the collapse if focus returns
          collapseTimer = window.setTimeout(() => {
            // Double-check: focus should truly be away from input-related elements
            const active = document.activeElement;
            if (active && currentContainer.contains(active)) {
              return; // Focus came back, don't collapse
            }

            // Also check if the new focus is in an input-related overlay/menu
            if (newFocus && isInputRelatedElement(newFocus, currentContainer)) {
              return; // Focus moved to input-related UI, don't collapse
            }

            // Now safe to collapse
            tryCollapse(currentContainer);
            collapseTimer = null;
          }, 50); // 50ms delay - enough for focusin to cancel if needed
        },
        { signal },
      );

      // Initial check - only collapse if not on excluded pages
      if (!shouldDisableAutoCollapse()) {
        tryCollapse(container);
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Add keyboard shortcuts for collapse/expand
  document.addEventListener(
    'keydown',
    (e) => {
      const container = getInputContainer();
      if (!container) return;

      // ESC key - collapse input
      if (e.key === 'Escape') {
        // Only respond when focus is within the input container
        const active = document.activeElement;
        if (active && container.contains(active)) {
          e.preventDefault();
          e.stopPropagation();
          collapseInput();
        }
        return;
      }

      // Ctrl+I - expand input and focus with cursor at end
      if (e.key === 'i' || e.key === 'I') {
        if (e.ctrlKey || e.metaKey) {
          // Only respond when input is collapsed
          if (container.classList.contains(COLLAPSED_CLASS)) {
            e.preventDefault();
            e.stopPropagation();
            expandInputWithCursorAtEnd();
          }
        }
        return;
      }
    },
    { signal, capture: true } // capture phase to ensure we intercept before other handlers
  );

  // Listen for language changes and update placeholder text
  browser.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName === 'sync' || areaName === 'local') && changes[StorageKeys.LANGUAGE]) {
      // Update all placeholder text
      document.querySelectorAll<HTMLDivElement>(`.${PLACEHOLDER_CLASS}`).forEach((placeholder) => {
        const span = placeholder.querySelector('span');
        if (span) {
          span.textContent = getTranslationSync('inputCollapsePlaceholder') || 'Message Gemini';
        }
      });
    }
  });

  // Try once immediately
  const container = getInputContainer();
  if (container) {
    // trigger logic manually just in case
    container.classList.remove('gv-processed');
  }
}

/**
 * Check if an element is part of input-related UI (menus, overlays, etc.)
 * This prevents collapse when clicking model selector, attachment button, etc.
 */
function isInputRelatedElement(element: HTMLElement, container: HTMLElement): boolean {
  if (!element) return false;

  // Check if the element is or is inside known input-related containers
  const INPUT_RELATED_SELECTORS = [
    // Material/CDK overlays (menus, dialogs, autocomplete dropdowns)
    '.cdk-overlay-container',
    '.mat-mdc-menu-panel',
    '.mat-mdc-dialog-container',
    '.ng-trigger',
    // Model selector and related UI
    '[role="listbox"]',
    '[role="option"]',
    '[role="combobox"]',
    // Attachment and file-related UI
    '[data-test-id*="attachment"]',
    '[data-test-id*="upload"]',
    '[data-test-id*="file"]',
  ];

  // Check if element matches any of the selectors
  for (const selector of INPUT_RELATED_SELECTORS) {
    if (element.matches(selector) || element.closest(selector)) {
      return true;
    }
  }

  // Additional heuristic: check if element is within a reasonable proximity
  // to the input container (within 5 levels up, but not the body/main)
  let parent = element.parentElement;
  let levels = 0;
  while (parent && levels < 5) {
    // If we reach body or main, we've gone too far
    if (parent.tagName === 'BODY' || parent.tagName === 'MAIN') {
      break;
    }
    // If we find the container, the element is input-related
    if (parent === container) {
      return true;
    }
    parent = parent.parentElement;
    levels++;
  }

  return false;
}

function expand(container: HTMLElement, moveCursorToEnd: boolean = false) {
  if (container.classList.contains(COLLAPSED_CLASS)) {
    container.classList.remove(COLLAPSED_CLASS);

    // Auto-focus the Quill editor
    // .ql-editor is the actual contenteditable div inside rich-textarea
    const editor =
      container.querySelector('.ql-editor') ||
      container.querySelector('[contenteditable]') ||
      container.querySelector('rich-textarea');
    if (editor && editor instanceof HTMLElement) {
      editor.focus();

      // Move cursor to end if requested
      if (moveCursorToEnd) {
        moveCursorToEndOfElement(editor);
      }
    }
  }
}

/**
 * Moves the cursor to the end of the content in a contenteditable element
 */
function moveCursorToEndOfElement(element: HTMLElement): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  range.selectNodeContents(element);
  range.collapse(false); // false = collapse to end

  selection.removeAllRanges();
  selection.addRange(range);
}

function tryCollapse(container: HTMLElement) {
  // We need a small delay to handle transient states
  setTimeout(() => {
    // Don't collapse on excluded pages (homepage, new conversation, gems create)
    if (shouldDisableAutoCollapse()) {
      container.classList.remove(COLLAPSED_CLASS);
      return;
    }

    const active = document.activeElement;
    const isStillFocused = container.contains(active);

    if (!isStillFocused) {
      // Check if we should collapse based on setting and input state
      // If allowCollapseWhenNotEmpty is true, we can collapse even with content
      // Otherwise, only collapse when empty (original behavior)
      const canCollapse = allowCollapseWhenNotEmpty || isInputEmpty(container);
      if (canCollapse) {
        container.classList.add(COLLAPSED_CLASS);
      }
    }
  }, 150);
}
