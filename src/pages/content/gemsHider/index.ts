/**
 * Gems Hider - Elegant hide/show toggle for Gems list section in sidebar
 *
 * Design Philosophy:
 * Similar to recentsHider, we use a contextual "hover reveal" pattern where
 * a subtle hide button appears on hover. When hidden, a minimal "peek bar"
 * allows users to restore the section.
 */
import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { getTranslationSync } from '../../../utils/i18n';

// Constants
const STYLE_ID = 'gv-gems-hider-style';
const HIDDEN_CLASS = 'gv-gems-hidden';
const PEEK_BAR_CLASS = 'gv-gems-peek-bar';
const TOGGLE_BTN_CLASS = 'gv-gems-toggle-btn';
const STORAGE_KEY = 'gvGemsHidden';

// Selectors - targeting the gems list container
const GEMS_CONTAINER_SELECTOR = '.gems-list-container';
const ARROW_ICON_SELECTOR = '[data-test-id="arrow-icon"]';

let initialized = false;
let observer: MutationObserver | null = null;

/**
 * Inject CSS styles for the hide/show functionality
 */
function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* Container for proper positioning */
    ${GEMS_CONTAINER_SELECTOR} {
      position: relative;
      transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Toggle button - inline next to arrow icon */
    .${TOGGLE_BTN_CLASS} {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      border: none;
      background: transparent;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transform: scale(0.8);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      color: var(--gm3-sys-color-on-surface-variant, #5f6368);
      vertical-align: middle;
      margin-right: 4px;
    }

    .${TOGGLE_BTN_CLASS}:hover {
      background: var(--gm3-sys-color-surface-container-highest, rgba(0, 0, 0, 0.12));
      transform: scale(1.1);
    }

    .${TOGGLE_BTN_CLASS}:active {
      transform: scale(0.95);
    }

    .${TOGGLE_BTN_CLASS} svg {
      width: 16px;
      height: 16px;
      transition: transform 0.2s ease;
    }

    /* Show button when hovering near arrow area */
    ${ARROW_ICON_SELECTOR}:hover .${TOGGLE_BTN_CLASS},
    .${TOGGLE_BTN_CLASS}:hover {
      opacity: 1;
      transform: scale(1);
    }

    /* Hidden state - collapse with smooth animation */
    .${HIDDEN_CLASS} {
      max-height: 0 !important;
      overflow: hidden !important;
      opacity: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      pointer-events: none !important;
    }

    /* Peek bar - minimal restore hint */
    .${PEEK_BAR_CLASS} {
      height: 6px;
      margin: 8px 16px;
      border-radius: 3px;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--gm3-sys-color-outline-variant, rgba(0, 0, 0, 0.08)) 20%,
        var(--gm3-sys-color-outline-variant, rgba(0, 0, 0, 0.08)) 80%,
        transparent 100%
      );
      cursor: pointer;
      transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      position: relative;
      display: none;
    }

    .${PEEK_BAR_CLASS}::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 40px;
      height: 4px;
      border-radius: 2px;
      background: var(--gm3-sys-color-primary, #1a73e8);
      opacity: 0;
      transition: all 0.2s ease;
    }

    .${PEEK_BAR_CLASS}:hover {
      height: 12px;
      background: linear-gradient(
        90deg,
        transparent 0%,
        var(--gm3-sys-color-primary-container, rgba(26, 115, 232, 0.12)) 15%,
        var(--gm3-sys-color-primary-container, rgba(26, 115, 232, 0.12)) 85%,
        transparent 100%
      );
    }

    .${PEEK_BAR_CLASS}:hover::after {
      opacity: 1;
      width: 60px;
    }

    /* Tooltip for peek bar */
    .${PEEK_BAR_CLASS}[data-tooltip]::before {
      content: attr(data-tooltip);
      position: absolute;
      bottom: 100%;
      left: 50%;
      transform: translateX(-50%) translateY(-4px);
      padding: 6px 12px;
      background: var(--gm3-sys-color-inverse-surface, #303030);
      color: var(--gm3-sys-color-inverse-on-surface, #f5f5f5);
      font-family: 'Google Sans', Roboto, sans-serif;
      font-size: 12px;
      font-weight: 500;
      border-radius: 8px;
      white-space: nowrap;
      opacity: 0;
      pointer-events: none;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      z-index: 1000;
    }

    .${PEEK_BAR_CLASS}:hover[data-tooltip]::before {
      opacity: 1;
      transform: translateX(-50%) translateY(-8px);
    }

    /* Show peek bar when gems is hidden */
    .${PEEK_BAR_CLASS}.gv-visible {
      display: block;
    }

    /* Dark mode adjustments */
    @media (prefers-color-scheme: dark) {
      .${TOGGLE_BTN_CLASS} {
        background: rgba(255, 255, 255, 0.08);
        color: #e8eaed;
      }
      .${TOGGLE_BTN_CLASS}:hover {
        background: rgba(255, 255, 255, 0.14);
      }
      .${PEEK_BAR_CLASS} {
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.06) 20%,
          rgba(255, 255, 255, 0.06) 80%,
          transparent 100%
        );
      }
      .${PEEK_BAR_CLASS}:hover {
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(138, 180, 248, 0.15) 15%,
          rgba(138, 180, 248, 0.15) 85%,
          transparent 100%
        );
      }
      .${PEEK_BAR_CLASS}::after {
        background: #8ab4f8;
      }
    }

    /* Explicit dark theme support */
    body[data-theme="dark"] .${TOGGLE_BTN_CLASS},
    body.dark-theme .${TOGGLE_BTN_CLASS} {
      background: rgba(255, 255, 255, 0.08);
      color: #e8eaed;
    }
    body[data-theme="dark"] .${TOGGLE_BTN_CLASS}:hover,
    body.dark-theme .${TOGGLE_BTN_CLASS}:hover {
      background: rgba(255, 255, 255, 0.14);
    }
  `;
  document.head.appendChild(style);
}

/**
 * Create the toggle button element
 */
function createToggleButton(): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.className = TOGGLE_BTN_CLASS;
  btn.setAttribute('aria-label', getTranslationSync('gemsHide') || 'Hide Gems');
  btn.title = getTranslationSync('gemsHide') || 'Hide Gems';

  // Eye-off icon (Material Symbols)
  btn.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" fill="currentColor">
      <path d="m644-428-58-58q9-47-27-88t-93-32l-58-58q17-8 34.5-12t37.5-4q75 0 127.5 52.5T660-500q0 20-4 37.5T644-428Zm128 126-58-56q38-29 67.5-63.5T832-500q-50-101-143.5-160.5T480-720q-29 0-57 4t-55 12l-62-62q41-17 84-25.5t90-8.5q151 0 269 83.5T920-500q-23 59-60.5 109.5T772-302Zm20 246L624-222q-35 11-70.5 16.5T480-200q-151 0-269-83.5T40-500q21-53 53-98.5t73-81.5L56-792l56-56 736 736-56 56ZM222-624q-29 26-53 57t-41 67q50 101 143.5 160.5T480-280q20 0 39-2.5t39-5.5l-36-38q-11 3-21 4.5t-21 1.5q-75 0-127.5-52.5T300-500q0-11 1.5-21t4.5-21l-84-82Zm319 93Zm-151 75Z"/>
    </svg>
  `;

  return btn;
}

/**
 * Create the peek bar element for restoring hidden section
 */
function createPeekBar(): HTMLDivElement {
  const bar = document.createElement('div');
  bar.className = PEEK_BAR_CLASS;
  bar.setAttribute('data-tooltip', getTranslationSync('gemsShow') || 'Show Gems');
  bar.setAttribute('role', 'button');
  bar.setAttribute('tabindex', '0');
  bar.setAttribute('aria-label', getTranslationSync('gemsShow') || 'Show Gems');

  return bar;
}

/**
 * Get the current hidden state from storage
 */
async function getHiddenState(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get({ [STORAGE_KEY]: false }, (result) => {
        resolve(result?.[STORAGE_KEY] === true);
      });
    } catch {
      // Fallback to localStorage
      resolve(localStorage.getItem(STORAGE_KEY) === 'true');
    }
  });
}

/**
 * Save the hidden state to storage
 */
async function setHiddenState(hidden: boolean): Promise<void> {
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.set({ [STORAGE_KEY]: hidden }, () => resolve());
    } catch {
      // Fallback to localStorage
      localStorage.setItem(STORAGE_KEY, String(hidden));
      resolve();
    }
  });
}

/**
 * Apply the hidden/visible state to the gems section
 */
function applyState(gemsEl: HTMLElement, peekBar: HTMLDivElement, hidden: boolean): void {
  if (hidden) {
    gemsEl.classList.add(HIDDEN_CLASS);
    peekBar.classList.add('gv-visible');
  } else {
    gemsEl.classList.remove(HIDDEN_CLASS);
    peekBar.classList.remove('gv-visible');
  }
}

/**
 * Setup the hide/show functionality for a gems container element
 */
async function setupGemsHider(containerEl: HTMLElement): Promise<void> {
  // Check if already processed
  if (document.querySelector(`.${TOGGLE_BTN_CLASS}`)) return;

  // Find the arrow icon to insert button next to it
  const arrowIcon = containerEl.querySelector(ARROW_ICON_SELECTOR);
  if (!arrowIcon) return;

  // Create UI elements
  const toggleBtn = createToggleButton();
  const peekBar = createPeekBar();

  // Insert button before arrow icon (inside the same parent)
  arrowIcon.insertBefore(toggleBtn, arrowIcon.firstChild);
  containerEl.parentElement?.insertBefore(peekBar, containerEl.nextSibling);

  // Get initial state and apply
  const isHidden = await getHiddenState();
  applyState(containerEl, peekBar, isHidden);

  // Toggle button click handler
  toggleBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    e.preventDefault();

    await setHiddenState(true);
    applyState(containerEl, peekBar, true);
  });

  // Peek bar click handler
  peekBar.addEventListener('click', async () => {
    await setHiddenState(false);
    applyState(containerEl, peekBar, false);
  });

  // Keyboard support for peek bar
  peekBar.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      await setHiddenState(false);
      applyState(containerEl, peekBar, false);
    }
  });
}

/**
 * Update UI text when language changes
 */
function updateLanguageText(): void {
  // Update toggle buttons
  document.querySelectorAll<HTMLButtonElement>(`.${TOGGLE_BTN_CLASS}`).forEach((btn) => {
    const text = getTranslationSync('gemsHide') || 'Hide Gems';
    btn.setAttribute('aria-label', text);
    btn.title = text;
  });

  // Update peek bars
  document.querySelectorAll<HTMLDivElement>(`.${PEEK_BAR_CLASS}`).forEach((bar) => {
    const text = getTranslationSync('gemsShow') || 'Show Gems';
    bar.setAttribute('data-tooltip', text);
    bar.setAttribute('aria-label', text);
  });
}

/**
 * Initialize the gems hider
 */
function initGemsHider(): void {
  if (initialized) return;
  initialized = true;

  injectStyles();

  // Setup existing gems container elements
  const gemsEls = document.querySelectorAll<HTMLElement>(GEMS_CONTAINER_SELECTOR);
  gemsEls.forEach((el) => setupGemsHider(el));

  // Observe for dynamically added gems elements (SPA navigation)
  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (node instanceof HTMLElement) {
          if (node.matches(GEMS_CONTAINER_SELECTOR)) {
            setupGemsHider(node);
          }
          // Also check children
          const children = node.querySelectorAll<HTMLElement>(GEMS_CONTAINER_SELECTOR);
          children.forEach((el) => setupGemsHider(el));
        }
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  // Listen for language changes and update UI text
  browser.storage.onChanged.addListener((changes, areaName) => {
    if ((areaName === 'sync' || areaName === 'local') && changes[StorageKeys.LANGUAGE]) {
      updateLanguageText();
    }
  });
}

/**
 * Cleanup function
 */
function cleanup(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  // Remove styles
  document.getElementById(STYLE_ID)?.remove();

  // Remove added elements
  document.querySelectorAll(`.${TOGGLE_BTN_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${PEEK_BAR_CLASS}`).forEach((el) => el.remove());
  document.querySelectorAll(`.${HIDDEN_CLASS}`).forEach((el) => {
    el.classList.remove(HIDDEN_CLASS);
  });

  initialized = false;
}

/**
 * Start the gems hider feature
 */
export function startGemsHider(): () => void {
  // Only run on gemini.google.com
  if (location.hostname !== 'gemini.google.com') {
    return () => {};
  }

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGemsHider);
  } else {
    // Small delay to ensure Gemini's UI is rendered
    setTimeout(initGemsHider, 500);
  }

  return cleanup;
}
