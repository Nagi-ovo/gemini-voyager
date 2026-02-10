/**
 * Send Behavior Module
 *
 * Modifies Gemini's input behavior:
 * - Enter key inserts a newline instead of sending
 * - Ctrl+Enter sends the message
 *
 * This feature is controlled by the `gvCtrlEnterSend` storage setting.
 *
 * ARCHITECTURE:
 * - Observer and listeners are ONLY active when the feature is enabled
 * - When disabled, no DOM observation or event handling occurs (zero performance overhead)
 * - Storage listener remains active to respond to setting changes
 */
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { getTextOffset, setCaretPosition } from './utils';

// ============================================================================
// Constants
// ============================================================================

/** Selectors for finding the send button */
const SEND_BUTTON_SELECTORS = [
  '.update-button', // Explicit class for Edit mode (User provided)
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[data-tooltip*="Send"]',
  'button[data-tooltip*="send"]',
  'button mat-icon[fonticon="send"]',
  '[data-send-button]',
  '.send-button',
  // Fallback selectors
  'button[aria-label*="Update"]',
  'button[aria-label*="Save"]',
  'button[aria-label*="更新"]',
] as const;

/** Selector for editable elements */
const EDITABLE_SELECTORS = '[contenteditable="true"], [role="textbox"], textarea';

/** Log prefix for consistent logging */
const LOG_PREFIX = '[SendBehavior]';

// ============================================================================
// State
// ============================================================================

let isEnabled = false;
let observer: MutationObserver | null = null;
let cleanupFns: (() => void)[] = [];
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;

/** Track elements that already have listeners attached to prevent duplicates */
const attachedElements = new WeakSet<HTMLElement>();

// ============================================================================
// DOM Helpers
// ============================================================================

/**
 * Find the send button associated with the current input element.
 *
 * Strategy:
 * 1. Contextual Search: Look for `.update-button` or similar in the container.
 * 2. Global Search: Fallback to the main send button (Main chat).
 */
function findSendButton(inputElement: HTMLElement): HTMLElement | null {
  // --- 1. Contextual Search ---

  // Traverse up to find a container
  let parent = inputElement.parentElement;
  let attempts = 0;
  // Gemini structure: input -> div -> div.edit-container (so ~3 levels up)
  const MAX_LEVELS = 5;

  while (parent && attempts < MAX_LEVELS) {
    // 1. Explicitly check for the ".update-button" class (User provided)
    const updateButton = parent.querySelector('.update-button');
    if (updateButton instanceof HTMLElement && updateButton.offsetParent !== null) {
      // Double check: if it's disabled, we might want to return it anyway (to block default enter)
      // or ignore it? Logic: If disabled, clicking does nothing, but we should consume the event
      // to prevent newline insertion if it was a submit attempt.
      // However, standard behavior is usually: click logic handles validity.
      // We'll return it so we can click() it (which does nothing if disabled).
      return updateButton.closest('button') ?? updateButton;
    }

    // 2. Fallback Contextual: Regex on aria-labels
    const UPDATE_REGEX = /update|save|confirm|submit|更新|保存|提交|修改/i;
    const buttons = Array.from(parent.querySelectorAll('button'));

    const matchedBtn = buttons.find((btn) => {
      const label =
        btn.getAttribute('aria-label') || btn.getAttribute('data-tooltip') || btn.textContent || '';
      return UPDATE_REGEX.test(label) && btn.offsetParent !== null;
    });

    if (matchedBtn) {
      return matchedBtn;
    }

    // 3. Proximity Check for generic Send buttons (very close only)
    if (attempts <= 2) {
      const localSend = buttons.find((btn) => {
        const hasSendIcon =
          btn.querySelector('mat-icon[fonticon="send"]') ||
          btn.querySelector('.material-symbols-outlined')?.textContent === 'send';
        return hasSendIcon && btn.offsetParent !== null;
      });
      if (localSend) return localSend;
    }

    parent = parent.parentElement;
    attempts++;
  }

  // --- 2. Global Search (Fallback for Main Chat) ---

  // Try predefined selectors
  for (const selector of SEND_BUTTON_SELECTORS) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        const button = element.closest('button') ?? element;
        if (button instanceof HTMLElement && button.offsetParent !== null) {
          return button;
        }
      }
    } catch {
      // Invalid selector, continue to next
    }
  }

  // Fallback: Find button with send icon by icon text
  const allButtons = document.querySelectorAll('button');
  for (const button of allButtons) {
    const iconElement = button.querySelector('.material-symbols-outlined, mat-icon');
    if (iconElement?.textContent?.trim().toLowerCase() === 'send') {
      return button;
    }
  }

  return null;
}

/**
 * Insert a newline in a contenteditable element
 *
 * Gemini uses Quill editor (identified by class "ql-editor").
 * Direct DOM manipulation with <br> elements doesn't work well with Quill
 * because it manages its own DOM state.
 *
 * Strategy:
 * 1. First try document.execCommand('insertLineBreak') - works in most browsers
 * 2. If that fails, simulate a Shift+Enter keypress which Quill handles natively
 */
function insertNewlineInContentEditable(target: HTMLElement): void {
  // Method 1: Try execCommand (deprecated but still works in most browsers)
  // This is the most reliable method for contenteditable elements
  // 1. SNAPSHOT: Remember where the cursor is (text offset)
  const currentOffset = getTextOffset(target);

  // 2. EXECUTE: Native command
  // This might trigger a React re-render, creating a new DOM structure
  const success = document.execCommand('insertLineBreak', false);

  if (success) {
    // 3. RESTORE: Put the cursor back where it belongs
    // Use requestAnimationFrame to wait for any immediate React re-renders to settle
    if (currentOffset !== null) {
      // +1 to account for the newly inserted newline character
      const newOffset = currentOffset + 1;

      // Try immediate restore (for synchronous DOM updates)
      setCaretPosition(target, newOffset);

      // Also try next frame (for asynchronous React updates)
      requestAnimationFrame(() => {
        setCaretPosition(target, newOffset);
      });
    }

    // Trigger input event to notify listeners (ensure data sync)
    // NOTE: Maintainer's code had this. We kept it but manage the cursor consequence.
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  // Method 2: Try insertHTML with a <br> tag
  const htmlSuccess = document.execCommand('insertHTML', false, '<br><br>');

  if (htmlSuccess) {
    target.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }

  // Method 3: Simulate Shift+Enter keypress as fallback
  // This tells Quill to handle the newline in its own way
  const shiftEnterEvent = new KeyboardEvent('keydown', {
    key: 'Enter',
    code: 'Enter',
    keyCode: 13,
    which: 13,
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  });

  target.dispatchEvent(shiftEnterEvent);
}

/**
 * Insert a newline in a textarea
 */
function insertNewlineInTextarea(textarea: HTMLTextAreaElement): void {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const value = textarea.value;

  textarea.value = value.substring(0, start) + '\n' + value.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + 1;

  // Trigger input event to notify any listeners
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

// ============================================================================
// Event Handlers
// ============================================================================

/**
 * Handle keydown events on the input area
 */
function handleKeyDown(event: KeyboardEvent): void {
  // Early exit if feature is disabled (should not happen, but defensive check)
  if (!isEnabled) return;

  // Fix for Issue 260: Ignore events during IME composition
  if (event.isComposing) return;

  // Only handle Enter key
  if (event.key !== 'Enter') return;

  const target = event.target as HTMLElement;

  // Check if we're in an editable area (Gemini uses contenteditable divs)
  const isContentEditable =
    target.isContentEditable || target.getAttribute('contenteditable') === 'true';
  const isTextarea = target.tagName === 'TEXTAREA';

  // Ignore INPUT elements - they are usually single-line (search, rename)
  // and pressing Enter there should trigger the default submit action
  if (!isContentEditable && !isTextarea) return;

  // Ctrl+Enter or Cmd+Enter: Send the message
  if (event.ctrlKey || event.metaKey) {
    const sendButton = findSendButton(target);
    if (sendButton) {
      event.preventDefault();
      event.stopPropagation();
      sendButton.click();
    }
    return;
  }

  // Shift+Enter: Default behavior (already inserts newline in most cases)
  if (event.shiftKey) return;

  // Plain Enter: Insert a newline instead of sending
  event.preventDefault();
  event.stopPropagation();

  if (isContentEditable) {
    insertNewlineInContentEditable(target);
  } else if (isTextarea) {
    insertNewlineInTextarea(target as HTMLTextAreaElement);
  }
}

// ============================================================================
// Attachment Logic
// ============================================================================

/**
 * Attach event listener to an input element
 */
function attachToInput(element: HTMLElement): void {
  // Prevent duplicate listeners
  if (attachedElements.has(element)) return;

  // Use capture phase to intercept before other handlers
  element.addEventListener('keydown', handleKeyDown, { capture: true });
  attachedElements.add(element);

  cleanupFns.push(() => {
    element.removeEventListener('keydown', handleKeyDown, { capture: true });
    attachedElements.delete(element);
  });
}

/**
 * Find and attach to all input areas on the page
 */
function attachToAllInputs(): void {
  const editables = document.querySelectorAll<HTMLElement>(EDITABLE_SELECTORS);
  editables.forEach(attachToInput);
}

// ============================================================================
// Observer Management
// ============================================================================

/**
 * Setup observer to watch for dynamically added input elements
 * NOTE: Only call this when the feature is enabled!
 */
function setupObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Check if the node itself is an input
        if (
          node.isContentEditable ||
          node.getAttribute('role') === 'textbox' ||
          node.tagName === 'TEXTAREA'
        ) {
          attachToInput(node);
        }

        // Check descendants
        const editables = node.querySelectorAll<HTMLElement>(EDITABLE_SELECTORS);
        editables.forEach(attachToInput);
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Disconnect the observer
 */
function disconnectObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// ============================================================================
// Feature Enable/Disable
// ============================================================================

/**
 * Enable the feature: attach listeners and start observing
 */
function enableFeature(): void {
  if (isEnabled) return;

  isEnabled = true;
  attachToAllInputs();
  setupObserver();

  console.log(LOG_PREFIX, 'Feature enabled');
}

/**
 * Disable the feature: remove all listeners and stop observing
 */
function disableFeature(): void {
  if (!isEnabled) return;

  isEnabled = false;

  // Remove all event listeners
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];

  // Stop observing DOM changes
  disconnectObserver();

  console.log(LOG_PREFIX, 'Feature disabled');
}

// ============================================================================
// Storage & Initialization
// ============================================================================

/**
 * Load the enabled state from storage
 */
async function loadSettings(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage?.sync?.get) {
        resolve(false);
        return;
      }
      chrome.storage.sync.get({ [StorageKeys.CTRL_ENTER_SEND]: false }, (result) => {
        const enabled = result?.[StorageKeys.CTRL_ENTER_SEND] === true;
        resolve(enabled);
      });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        resolve(false);
        return;
      }
      console.warn(LOG_PREFIX, 'Failed to load settings:', error);
      resolve(false);
    }
  });
}

/**
 * Setup storage change listener
 * NOTE: This listener remains active even when feature is disabled,
 * so we can respond to setting changes.
 */
function setupStorageListener(): void {
  if (storageListener) return;

  storageListener = (changes, areaName) => {
    if (areaName !== 'sync') return;
    if (!(StorageKeys.CTRL_ENTER_SEND in changes)) return;

    const newValue = changes[StorageKeys.CTRL_ENTER_SEND].newValue === true;

    if (newValue && !isEnabled) {
      enableFeature();
    } else if (!newValue && isEnabled) {
      disableFeature();
    }
  };

  try {
    chrome.storage?.onChanged?.addListener(storageListener);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) {
      return;
    }
    console.warn(LOG_PREFIX, 'Failed to setup storage listener:', error);
  }
}

/**
 * Cleanup all resources
 */
function cleanup(): void {
  disableFeature();

  if (storageListener) {
    try {
      chrome.storage?.onChanged?.removeListener(storageListener);
    } catch {
      // Ignore cleanup errors
    }
    storageListener = null;
  }

  console.log(LOG_PREFIX, 'Cleanup complete');
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the send behavior module
 * @returns A cleanup function to be called on unmount
 */
export async function startSendBehavior(): Promise<() => void> {
  // Always setup storage listener first (to respond to setting changes)
  setupStorageListener();

  // Load initial setting and enable if needed
  const initialEnabled = await loadSettings();
  if (initialEnabled) {
    enableFeature();
  } else {
    console.log(LOG_PREFIX, 'Feature disabled, skipping initialization');
  }

  return cleanup;
}
