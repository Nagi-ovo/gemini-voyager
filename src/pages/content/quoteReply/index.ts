import { getTranslationSync } from '../../../utils/i18n';
import { startPromptManager } from '../prompt/index'; // Just for type reference/consistency if needed

// SVGs
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
        'textarea' // Fallback, might be dangerous
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
        quoteBtn.className = 'gv-quote-btn gv-hidden';
        // Check language roughly (or just use "Quote")
        // Check language roughly (or just use "Quote")
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
            input.focus();

            // Format format: > selection
            // We split by newlines to quote nicely
            const quoted = selectedText.split('\n').map(line => `> ${line}`).join('\n') + '\n\n';

            // Insert text
            // execCommand is reliable for contenteditable
            const success = document.execCommand('insertText', false, quoted);
            if (!success) {
                // Fallback for textareas
                if (input instanceof HTMLTextAreaElement) {
                    const start = input.selectionStart;
                    const end = input.selectionEnd;
                    const val = input.value;
                    input.value = val.substring(0, start) + quoted + val.substring(end);
                    input.selectionStart = input.selectionEnd = start + quoted.length;
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                } else {
                    // Fallback for contenteditable
                    input.innerText += quoted; // Very basic
                }
            }

            // Dispatch input event for contenteditable just in case framework needs it
            if (!(input instanceof HTMLTextAreaElement)) {
                // Dispatch input event to notify frameworks (React/Lit)
                input.dispatchEvent(new Event('input', { bubbles: true }));
            }

            // Hide button
            hideButton();
            // Clear selection
            window.getSelection()?.removeAllRanges();
        } else {
            console.warn('[Gemini Voyager] Could not find chat input.');
        }
    }

    function showButton(rect: DOMRect) {
        if (!quoteBtn) createButton();
        if (!quoteBtn) return;

        quoteBtn.classList.remove('gv-hidden');

        // Position above the selection
        const btnRect = quoteBtn.getBoundingClientRect();
        const top = rect.top - btnRect.height - 10 + window.scrollY;
        const left = rect.left + (rect.width / 2) - (btnRect.width / 2) + window.scrollX;

        quoteBtn.style.top = `${Math.max(10, top)}px`;
        quoteBtn.style.left = `${Math.max(10, left)}px`;
    }

    function hideButton() {
        if (quoteBtn) {
            quoteBtn.classList.add('gv-hidden');
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

            const element = anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : anchor as HTMLElement;
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
        }, 10);
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
