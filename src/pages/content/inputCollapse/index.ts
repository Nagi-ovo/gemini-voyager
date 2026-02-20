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
  chrome.storage?.sync?.get({ gvInputCollapseEnabled: false }, (res) => {
    if (res?.gvInputCollapseEnabled === false) {
      // Feature is disabled, don't initialize
      console.log('[Gemini Voyager] Input collapse is disabled');
      return;
    }

    // Feature is enabled, proceed with initialization
    initInputCollapse();
  });

  // Listen for setting changes
  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'sync' && changes.gvInputCollapseEnabled) {
      if (changes.gvInputCollapseEnabled.newValue === false) {
        // Disable: remove styles and classes
        cleanup();
      } else {
        // Enable: re-initialize
        initInputCollapse();
      }
    }
  });
}

let observer: MutationObserver | null = null;
let initialized = false;
let eventController: AbortController | null = null;

function cleanup() {
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

function initInputCollapse() {
  if (initialized) return;
  initialized = true;

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
      container.addEventListener(
        'focusin',
        () => {
          expand(container);
        },
        { signal },
      );

      container.addEventListener(
        'focusout',
        (e) => {
          const newFocus = e.relatedTarget as HTMLElement;
          if (newFocus && container.contains(newFocus)) {
            return; // Focus is still inside
          }

          tryCollapse(container);
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

function expand(container: HTMLElement) {
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
    }
  }
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

    if (!isStillFocused && isInputEmpty(container)) {
      container.classList.add(COLLAPSED_CLASS);
    }
  }, 150);
}
