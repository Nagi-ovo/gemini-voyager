import { getTranslationSync } from '../../../utils/i18n';
import { expandInputCollapseIfNeeded } from '../inputCollapse/index';

// ============================================================================
// Constants
// ============================================================================

/** CSS class names for quote reply button */
const CSS_CLASSES = {
  BUTTON: 'gv-quote-btn',
  HIDDEN: 'gv-hidden',
} as const;

/** Timing constants (in milliseconds) */
const TIMING = {
  /** Delay before performing insertion to wait for UI expansion transitions */
  INSERTION_DELAY_MS: 200,
  /** Delay before retrying focus for editors that need extra time */
  FOCUS_RETRY_DELAY_MS: 50,
  /** Debounce delay for selection change detection */
  SELECTION_DEBOUNCE_MS: 10,
} as const;

/** UI positioning constants (in pixels) */
const POSITIONING = {
  /** Minimum distance from viewport edge */
  MIN_EDGE_OFFSET_PX: 10,
  /** Gap between button and selection */
  BUTTON_SELECTION_GAP_PX: 10,
} as const;

/** SVG icon for the quote button */
const QUOTE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"></path></svg>`;

const STYLE_ID = 'gemini-voyager-quote-reply-style';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gv-quote-btn {
      position: fixed;
      z-index: 9999;
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      background-color: #1e1e1e;
      color: #fff;
      border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s ease;
      border: 1px solid rgba(255,255,255,0.1);
      transform: translateY(0);
      opacity: 1;
      pointer-events: auto;
    }
    .gv-quote-btn:hover {
      background-color: #2d2d2d;
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.2);
    }
    .gv-quote-btn svg {
      width: 14px;
      height: 14px;
      opacity: 0.9;
    }
    .gv-quote-btn.gv-hidden {
      opacity: 0;
      transform: translateY(4px);
      pointer-events: none;
      visibility: hidden;
    }
    /* Light mode support */
    @media (prefers-color-scheme: light) {
      .gv-quote-btn {
        background-color: #fff;
        color: #1f1f1f;
        border: 1px solid rgba(0,0,0,0.08);
      }
      .gv-quote-btn:hover {
        background-color: #f5f5f5;
      }
    }
    /* Check for specific theme attributes if Gemini uses them */
    body[data-theme="light"] .gv-quote-btn {
      background-color: #fff;
      color: #1f1f1f;
      border: 1px solid rgba(0,0,0,0.08);
    }
    body[data-theme="light"] .gv-quote-btn:hover {
       background-color: #f5f5f5;
    }
  `;
  document.head.appendChild(style);
}

// Function to find the chat input
function getChatInput(): HTMLElement | null {
  // Gemini usually has a rich-textarea
  // Try multiple selectors from most specific to generic
  const selectors = [
    'rich-textarea [contenteditable="true"]',
    'div[contenteditable="true"][role="textbox"]',
    '.input-area textarea',
    'textarea[placeholder*="Ask"]',
    'textarea', // Fallback, might be dangerous
  ];

  for (const selector of selectors) {
    // We probably want the one in the main footer/input area, not others (like edit mode)
    // Usually the main input is visible and larger.
    const els = document.querySelectorAll(selector);
    for (const el of Array.from(els)) {
      // Check if it's visible
      if (el.getBoundingClientRect().height > 0) {
        return el as HTMLElement;
      }
    }
  }
  return null;
}

export function startQuoteReply() {
  injectStyles();

  let quoteBtn: HTMLElement | null = null;
  let currentSelectionRange: Range | null = null;
  let isInternalClick = false;

  // Create button
  function createButton() {
    if (quoteBtn) return;
    quoteBtn = document.createElement('div');
    quoteBtn.className = `${CSS_CLASSES.BUTTON} ${CSS_CLASSES.HIDDEN}`;
    const text = getTranslationSync('quoteReply');

    quoteBtn.innerHTML = `${QUOTE_ICON}<span>${text}</span>`;

    quoteBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      isInternalClick = true;
      handleQuoteClick();
    });

    document.body.appendChild(quoteBtn);
  }

  function handleQuoteClick() {
    if (!currentSelectionRange) return;
    const selectedText = currentSelectionRange.toString().trim();
    if (!selectedText) return;

    const input = getChatInput();
    if (input) {
      expandInputCollapseIfNeeded();

      // Format: > selection
      // Prepare quote body (without leading/trailing newlines - those are added at insertion time)
      const quoteBody = selectedText
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');

      // Ensure the input is visible
      input.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Robust insertion and focus logic
      const performInsertion = () => {
        // First focus attempt
        input.focus();

        // Check input state at insertion time to avoid race conditions
        // (user might type or another quote might be inserted during the delay)
        const currentContent =
          input instanceof HTMLTextAreaElement ? input.value : input.textContent || '';
        const isInputEmpty = currentContent.trim().length === 0;

        // 1. Add a newline at the end (any quote)
        // 2. Add a newline at the start if not the first quote
        // Example:
        // ------------
        // |> Quote 1 |
        // |New text 1|
        // |> Quote 2 |
        // |New text 2|
        // ------------
        const quoted = isInputEmpty ? `${quoteBody}\n` : `\n${quoteBody}\n`;

        if (input instanceof HTMLTextAreaElement) {
          // Standard Textarea logic - simplified append
          input.value += quoted;
          input.selectionStart = input.selectionEnd = input.value.length;
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          // Contenteditable (Gemini/Quill) logic
          // Use modern Range/Selection API instead of deprecated execCommand
          const sel = window.getSelection();

          // Move cursor to the end first
          if (sel) {
            const range = document.createRange();
            range.selectNodeContents(input);
            range.collapse(false); // Move cursor to very end
            sel.removeAllRanges();
            sel.addRange(range);
          }

          // Insert text node directly (modern approach, no deprecated APIs)
          const textNode = document.createTextNode(quoted);
          if (sel && sel.rangeCount > 0) {
            const insertRange = sel.getRangeAt(0);
            insertRange.insertNode(textNode);

            // Move cursor to after the inserted text
            insertRange.setStartAfter(textNode);
            insertRange.setEndAfter(textNode);
            sel.removeAllRanges();
            sel.addRange(insertRange);
          } else {
            // Fallback: just append to the input
            input.appendChild(textNode);
          }

          // Re-force cursor to the end after insertion
          const finalRange = document.createRange();
          finalRange.selectNodeContents(input);
          finalRange.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(finalRange);

          input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        // Final focus force
        input.focus();
        // Some editors need an extra click or focus to show the cursor
        setTimeout(() => input.focus(), TIMING.FOCUS_RETRY_DELAY_MS);
      };

      // Use a slightly longer delay to wait for any expansion transitions
      setTimeout(performInsertion, TIMING.INSERTION_DELAY_MS);

      // Hide button and clear original selection
      hideButton();
      window.getSelection()?.removeAllRanges();
    } else {
      console.warn('[Gemini Voyager] Could not find chat input.');
    }
  }

  function showButton(rect: DOMRect) {
    if (!quoteBtn) createButton();
    if (!quoteBtn) return;

    quoteBtn.classList.remove(CSS_CLASSES.HIDDEN);

    // Position above the selection
    const btnRect = quoteBtn.getBoundingClientRect();
    const top = rect.top - btnRect.height - POSITIONING.BUTTON_SELECTION_GAP_PX + window.scrollY;
    const left = rect.left + rect.width / 2 - btnRect.width / 2 + window.scrollX;

    quoteBtn.style.top = `${Math.max(POSITIONING.MIN_EDGE_OFFSET_PX, top)}px`;
    quoteBtn.style.left = `${Math.max(POSITIONING.MIN_EDGE_OFFSET_PX, left)}px`;
  }

  function hideButton() {
    if (quoteBtn) {
      quoteBtn.classList.add(CSS_CLASSES.HIDDEN);
    }
  }

  function handleSelectionChange() {
    // Use a small timeout to let selection settle
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        hideButton();
        currentSelectionRange = null;
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        hideButton();
        currentSelectionRange = null;
        return;
      }

      // Check if selection is within a message user/model bubble
      // We don't want to quote random UI elements
      const anchor = selection.anchorNode;
      if (!anchor) return;

      const element =
        anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as HTMLElement);

      // Check if selection is inside main content area
      // Gemini uses <main> or sometimes specific classes. We want to avoid nav, sidebar, etc.
      const mainContent = document.querySelector('main');
      if (mainContent && !mainContent.contains(element)) {
        hideButton();
        return;
      }

      // Also explicitly check for sidebar classes just in case
      if (
        element?.closest('nav') ||
        element?.closest('[role="navigation"]') ||
        element?.closest('.sidebar') ||
        element?.closest('.mat-drawer')
      ) {
        hideButton();
        return;
      }

      // Selectors for valid areas: user-query-container, model-response, conversation-container
      // Or just check if it's not the input box itself
      if (element?.closest('[contenteditable="true"]')) {
        hideButton();
        return;
      }

      // Also check if we are selecting code block content? Might be fine.

      const range = selection.getRangeAt(0);
      currentSelectionRange = range;
      const rect = range.getBoundingClientRect();

      // If rect is zero (e.g. invisible), don't show
      if (rect.width === 0 && rect.height === 0) return;

      showButton(rect);
    }, TIMING.SELECTION_DEBOUNCE_MS);
  }

  function onMouseUp(e: MouseEvent) {
    if (isInternalClick) {
      isInternalClick = false;
      return;
    }
    handleSelectionChange();
  }

  // Listen to selection changes via mouseup (often better for "finished" selection)
  // selectionchange event fires too often while dragging.
  document.addEventListener('mouseup', onMouseUp);

  // Also listen to keyup for keyboard selection
  document.addEventListener('keyup', (e) => {
    if (e.key === 'Shift' || e.key.startsWith('Arrow')) {
      handleSelectionChange();
    }
  });

  // Cleanup
  return () => {
    document.removeEventListener('mouseup', onMouseUp);
    if (quoteBtn) quoteBtn.remove();
    const style = document.getElementById(STYLE_ID);
    if (style) style.remove();
  };
}
