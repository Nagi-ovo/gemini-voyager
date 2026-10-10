import { createHighlighterIcon } from '@/core/icons/highlighterIcon';

import { getTranslationSync } from '../../../utils/i18n';
import type { createHighlightColorPicker } from './highlightColorPicker';

/** CSS class names for quote reply button */
const CSS_CLASSES = {
  TOOLBAR: 'gv-selection-toolbar',
  BUTTON: 'gv-quote-btn',
  ACTION: 'gv-selection-action',
  HIGHLIGHT_BUTTON: 'gv-highlight-action',
  HIDDEN: 'gv-hidden',
} as const;

/** UI positioning constants (in pixels) */
const POSITIONING = {
  /** Minimum distance from viewport edge */
  MIN_EDGE_OFFSET_PX: 10,
  /** Gap between button and selection */
  BUTTON_SELECTION_GAP_PX: 16,
} as const;

/** SVG icon for the quote button */
const QUOTE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`;
const STYLE_ID = 'gemini-voyager-quote-reply-style';
const HIGHLIGHT_PREVIEW_CLASS = 'gv-highlight-selection-preview-active';
const HIGHLIGHT_PREVIEW_COLOR_PROPERTY = '--gv-highlight-selection-preview-color';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gv-selection-toolbar {
      position: fixed;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 2px;
      padding: 3px;
      background-color: #1e1e1e;
      color: #fff;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      font-weight: 500;
      border: 1px solid rgba(255,255,255,0.1);
      opacity: 1;
      pointer-events: auto;
    }
    .gv-selection-action {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 5px 8px;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
    }
    .gv-selection-action:hover,
    .gv-selection-action:focus-visible {
      background-color: #2d2d2d;
      outline: none;
    }
    .gv-selection-action svg {
      width: 14px;
      height: 14px;
      opacity: 0.9;
    }
    .gv-highlight-color-trigger {
      box-sizing: border-box;
      width: 22px;
      height: 22px;
      margin: 0 4px 0 1px;
      padding: 0;
      border: 2px solid rgba(255,255,255,0.72);
      border-radius: 50%;
      box-shadow: 0 0 0 1px rgba(0,0,0,0.34);
      cursor: pointer;
    }
    .gv-highlight-color-trigger:hover,
    .gv-highlight-color-trigger:focus-visible {
      outline: 2px solid #8ab4f8;
      outline-offset: 2px;
    }
    .gv-highlight-color-palette {
      position: fixed;
      display: flex;
      gap: 6px;
      padding: 7px;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      background: #1e1e1e;
      box-shadow: 0 6px 18px rgba(0,0,0,0.24);
    }
    .gv-highlight-color-option {
      position: relative;
      width: 24px;
      height: 24px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 50%;
      cursor: pointer;
    }
    .gv-highlight-color-option[aria-pressed="true"] {
      border-color: rgba(255, 255, 255, 0.94);
      outline: 2px solid #8ab4f8;
      outline-offset: 1px;
      box-shadow: 0 2px 8px rgba(138, 180, 248, 0.34);
    }
    .gv-highlight-color-option[aria-pressed="true"]::after {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff;
      content: "✓";
      font-size: 13px;
      font-weight: 800;
      line-height: 1;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.78);
    }
    .gv-highlight-color-edit {
      position: relative;
      display: grid;
      width: 26px;
      height: 26px;
      margin-inline-start: 2px;
      padding: 0;
      place-items: center;
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.08);
      color: inherit;
      cursor: pointer;
      overflow: hidden;
    }
    .gv-highlight-color-edit:hover,
    .gv-highlight-color-edit:focus-visible {
      border-color: #8ab4f8;
      background: rgba(138, 180, 248, 0.16);
      outline: none;
    }
    .gv-highlight-custom-color {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      opacity: 0;
      cursor: pointer;
    }
    html.${HIGHLIGHT_PREVIEW_CLASS}::selection,
    html.${HIGHLIGHT_PREVIEW_CLASS} *::selection {
      background-color: var(${HIGHLIGHT_PREVIEW_COLOR_PROPERTY}) !important;
      color: inherit !important;
    }
    .gv-selection-toolbar.gv-hidden {
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
    }
    .gv-selection-action.gv-hidden { display: none; }
    .gv-highlight-color-trigger.gv-hidden,
    .gv-highlight-color-palette.gv-hidden { display: none; }
    /* Light mode support */
    @media (prefers-color-scheme: light) {
      .gv-selection-toolbar {
        background-color: #fff;
        color: #1f1f1f;
        border: 1px solid rgba(0,0,0,0.08);
      }
      .gv-selection-action:hover,
      .gv-selection-action:focus-visible {
        background-color: #f5f5f5;
      }
      .gv-highlight-color-trigger {
        border-color: rgba(255,255,255,0.92);
        box-shadow: 0 0 0 1px rgba(0,0,0,0.24);
      }
      .gv-highlight-color-palette {
        border-color: rgba(0,0,0,0.10);
        background: #fff;
      }
      .gv-highlight-color-edit {
        border-color: rgba(0, 0, 0, 0.14);
        background: rgba(0, 0, 0, 0.04);
      }
    }
    /* Check for specific theme attributes if Gemini uses them */
    .theme-host.light-theme .gv-selection-toolbar,
    body[data-theme="light"] .gv-selection-toolbar {
      background-color: #fff;
      color: #1f1f1f;
      border: 1px solid rgba(0,0,0,0.08);
    }
    .theme-host.light-theme .gv-selection-action:hover,
    .theme-host.light-theme .gv-selection-action:focus-visible,
    body[data-theme="light"] .gv-selection-action:hover,
    body[data-theme="light"] .gv-selection-action:focus-visible {
       background-color: #f5f5f5;
    }
    .theme-host.light-theme .gv-highlight-color-palette,
    body[data-theme="light"] .gv-highlight-color-palette {
      border-color: rgba(0,0,0,0.10);
      background: #fff;
    }
    .theme-host.light-theme .gv-highlight-color-edit,
    body[data-theme="light"] .gv-highlight-color-edit {
      border-color: rgba(0, 0, 0, 0.14);
      background: rgba(0, 0, 0, 0.04);
    }
    .theme-host.dark-theme .gv-selection-toolbar,
    body[data-theme="dark"] .gv-selection-toolbar {
      background-color: #1e1e1e;
      color: #fff;
      border-color: rgba(255,255,255,0.1);
    }
    .theme-host.dark-theme .gv-selection-action:hover,
    .theme-host.dark-theme .gv-selection-action:focus-visible,
    body[data-theme="dark"] .gv-selection-action:hover,
    body[data-theme="dark"] .gv-selection-action:focus-visible {
      background-color: #2d2d2d;
    }
    body.gv-rtl .gv-selection-toolbar { flex-direction: row-reverse; }
  `;
  document.head.appendChild(style);
}

interface SelectionToolbarCallbacks {
  onInternalClick: () => void;
  onQuote: () => void;
  onHighlight: () => Promise<void>;
}

export function createSelectionToolbar(
  quoteEnabled: boolean,
  picker: ReturnType<typeof createHighlightColorPicker>,
  callbacks: SelectionToolbarCallbacks,
) {
  injectStyles();
  let selectionToolbar: HTMLElement | null = null;
  let quoteBtn: HTMLElement | null = null;
  let highlightBtn: HTMLButtonElement | null = null;
  let currentSelectionRange: Range | null = null;
  let scrollRafId: number | null = null;

  /** Update button position based on current selection range's viewport coordinates. */
  function updatePosition() {
    if (!selectionToolbar || !currentSelectionRange) return;

    const rangeRect = currentSelectionRange.getBoundingClientRect();

    // Hide when selection is scrolled out of viewport
    const isOffScreen = rangeRect.bottom < 0 || rangeRect.top > window.innerHeight;

    if (isOffScreen) {
      if (!selectionToolbar.classList.contains(CSS_CLASSES.HIDDEN)) {
        selectionToolbar.classList.add(CSS_CLASSES.HIDDEN);
      }
      return;
    }

    if (selectionToolbar.classList.contains(CSS_CLASSES.HIDDEN)) {
      selectionToolbar.classList.remove(CSS_CLASSES.HIDDEN);
    }

    // Ensure the button is visible before measuring to get actual dimensions
    const btnRect = selectionToolbar.getBoundingClientRect();

    // Use getClientRects to get the precise position of the first line.
    // This prevents the button from being pushed down by empty space in multi-line selections.
    const firstLineRect =
      typeof currentSelectionRange.getClientRects === 'function'
        ? currentSelectionRange.getClientRects()[0] || rangeRect
        : rangeRect;

    // position: fixed uses viewport coordinates, no scrollY/X needed
    const top = firstLineRect.top - btnRect.height - POSITIONING.BUTTON_SELECTION_GAP_PX;
    const left = rangeRect.left + rangeRect.width / 2 - btnRect.width / 2;

    // Edge protection: prevent the button from being clipped or overflowing the viewport
    const maxLeft = window.innerWidth - btnRect.width - POSITIONING.MIN_EDGE_OFFSET_PX;

    selectionToolbar.style.top = `${Math.max(POSITIONING.MIN_EDGE_OFFSET_PX, top)}px`;
    selectionToolbar.style.left = `${Math.min(maxLeft, Math.max(POSITIONING.MIN_EDGE_OFFSET_PX, left))}px`;
    picker.position();
  }

  function onScrollOrResize() {
    if (scrollRafId) return;
    scrollRafId = requestAnimationFrame(() => {
      updatePosition();
      scrollRafId = null;
    });
  }

  // Create the shared selection toolbar. Quote and Highlight deliberately use
  // the same listener/range so two floating controls never race each other.
  function createButton() {
    if (selectionToolbar) return;
    selectionToolbar = document.createElement('div');
    selectionToolbar.className = `${CSS_CLASSES.TOOLBAR} ${CSS_CLASSES.HIDDEN}`;
    selectionToolbar.setAttribute('role', 'toolbar');
    const text = getTranslationSync('quoteReply');
    selectionToolbar.setAttribute(
      'aria-label',
      `${text} / ${getTranslationSync('highlightAction')}`,
    );

    quoteBtn = document.createElement('button');
    quoteBtn.className = `${CSS_CLASSES.BUTTON} ${CSS_CLASSES.ACTION}`;
    quoteBtn.setAttribute('type', 'button');
    quoteBtn.innerHTML = `${QUOTE_ICON}<span>${text}</span>`;
    quoteBtn.classList.toggle(CSS_CLASSES.HIDDEN, !quoteEnabled);

    quoteBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      callbacks.onInternalClick();
    });
    quoteBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onQuote();
    });

    highlightBtn = document.createElement('button');
    highlightBtn.className = `${CSS_CLASSES.HIGHLIGHT_BUTTON} ${CSS_CLASSES.ACTION} ${CSS_CLASSES.HIDDEN}`;
    highlightBtn.type = 'button';
    const highlightLabel = document.createElement('span');
    highlightLabel.textContent = getTranslationSync('highlightAction');
    highlightBtn.replaceChildren(createHighlighterIcon(16), highlightLabel);
    highlightBtn.addEventListener('mousedown', (event) => {
      event.preventDefault();
      event.stopPropagation();
      callbacks.onInternalClick();
    });
    highlightBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      void callbacks.onHighlight();
    });

    selectionToolbar.append(quoteBtn, highlightBtn);
    picker.mount(selectionToolbar);
    document.body.appendChild(selectionToolbar);
  }

  function showButton() {
    if (!selectionToolbar) createButton();
    if (!selectionToolbar) return;

    // updatePosition() manages visibility (HIDDEN class) based on viewport check
    updatePosition();

    // Add listeners for scroll/resize
    window.addEventListener('scroll', onScrollOrResize, { capture: true, passive: true });
    window.addEventListener('resize', onScrollOrResize, { passive: true });
  }

  function hideButton() {
    picker.hide();
    if (selectionToolbar) {
      selectionToolbar.classList.add(CSS_CLASSES.HIDDEN);
    }
    // Remove listeners
    window.removeEventListener('scroll', onScrollOrResize, { capture: true });
    window.removeEventListener('resize', onScrollOrResize);
    if (scrollRafId) {
      cancelAnimationFrame(scrollRafId);
      scrollRafId = null;
    }
  }

  // Function to update button text when language changes
  function updateButtonText() {
    if (quoteBtn) {
      const span = quoteBtn.querySelector('span');
      if (span) {
        span.textContent = getTranslationSync('quoteReply');
      }
    }
    const highlightSpan = highlightBtn?.querySelector('span');
    if (highlightSpan) {
      highlightSpan.textContent = getTranslationSync('highlightAction');
    }
    if (selectionToolbar) {
      selectionToolbar.setAttribute(
        'aria-label',
        `${getTranslationSync('quoteReply')} / ${getTranslationSync('highlightAction')}`,
      );
    }
    picker.updateText();
  }

  function setHighlightAvailable(available: boolean): void {
    highlightBtn?.classList.toggle(CSS_CLASSES.HIDDEN, !available);
    picker.setVisible(available);
  }

  return {
    show(range: Range, canHighlight: boolean) {
      currentSelectionRange = range;
      createButton();
      quoteBtn?.classList.toggle(CSS_CLASSES.HIDDEN, !quoteEnabled);
      setHighlightAvailable(canHighlight);
      if (!quoteEnabled && !canHighlight) {
        hideButton();
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width !== 0 || rect.height !== 0) showButton();
    },
    // Storage updates do not mount controls or reject a zero-sized saved range.
    refreshAvailability(range: Range | null, canHighlight: boolean) {
      currentSelectionRange = range;
      setHighlightAvailable(canHighlight);
      if (!quoteEnabled && !canHighlight) hideButton();
      else if (range) showButton();
    },
    hide: hideButton,
    updateText: updateButtonText,
    destroy() {
      hideButton();
      selectionToolbar?.remove();
      document.getElementById(STYLE_ID)?.remove();
    },
  };
}
