/**
 * Send Behavior Module
 *
 * Modifies Gemini's input behavior:
 * - Enter key inserts a newline instead of sending
 * - Ctrl+Enter sends the message
 *
 * This feature is controlled by the `gvCtrlEnterSend` storage setting.
 */
import { StorageKeys } from '@/core/types/common';

let isEnabled = false;
let observer: MutationObserver | null = null;
let cleanupFns: (() => void)[] = [];

/**
 * Handle keydown events on the input area
 */
function handleKeyDown(event: KeyboardEvent): void {
  if (!isEnabled) return;

  // Only handle Enter key
  if (event.key !== 'Enter') return;

  // Get the target element
  const target = event.target as HTMLElement;

  // Check if we're in a contenteditable input area (Gemini uses contenteditable divs)
  const isContentEditable =
    target.isContentEditable || target.getAttribute('contenteditable') === 'true';
  const isTextarea = target.tagName === 'TEXTAREA';

  // We explicitly ignore INPUT elements because they are usually single-line (search, rename)
  // and pressing Enter there should trigger the default submit action, not insert a newline.
  if (!isContentEditable && !isTextarea) return;

  // Ctrl+Enter or Cmd+Enter: Allow default behavior (send message)
  if (event.ctrlKey || event.metaKey) {
    // Find and click the send button
    const sendButton = findSendButton();
    if (sendButton) {
      event.preventDefault();
      event.stopPropagation();
      sendButton.click();
    }
    // If no send button found, let the default behavior happen
    return;
  }

  // Shift+Enter: Default behavior (already inserts newline in most cases)
  if (event.shiftKey) return;

  // Plain Enter: Insert a newline instead of sending
  event.preventDefault();
  event.stopPropagation();

  if (isContentEditable) {
    // For contenteditable, insert a line break manually using Range API
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const br = document.createElement('br');
      range.deleteContents();
      range.insertNode(br);
      // Move cursor after the br
      range.setStartAfter(br);
      range.setEndAfter(br);
      selection.removeAllRanges();
      selection.addRange(range);
      // Scroll to view
      br.scrollIntoView({ block: 'nearest' });
    }
    // Trigger input event to notify any listeners (e.g. Quill editor)
    target.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (isTextarea) {
    // For textarea, insert a newline at cursor position
    const textarea = target as HTMLTextAreaElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const value = textarea.value;
    textarea.value = value.substring(0, start) + '\n' + value.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + 1;
    // Trigger input event to notify any listeners
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

/**
 * Find the send button in the Gemini UI
 */
function findSendButton(): HTMLElement | null {
  // Try multiple selectors as Gemini's UI may vary
  const selectors = [
    'button[aria-label*="Send"]',
    'button[aria-label*="send"]',
    'button[data-tooltip*="Send"]',
    'button[data-tooltip*="send"]',
    // Material icon button with send icon
    'button mat-icon[fonticon="send"]',
    // Fallback: look for send button by class or data attributes
    '[data-send-button]',
    '.send-button',
  ];

  for (const selector of selectors) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        // If we found a child element, get the button parent
        const button = element.closest('button') || element;
        if (button instanceof HTMLElement) {
          return button;
        }
      }
    } catch {
      // Selector may be invalid, skip it
    }
  }

  // Alternative: Find button with send icon by looking for the icon text
  const allButtons = document.querySelectorAll('button');
  for (const button of allButtons) {
    const iconElement = button.querySelector('.material-symbols-outlined, mat-icon');
    if (iconElement && iconElement.textContent?.trim().toLowerCase() === 'send') {
      return button;
    }
  }

  return null;
}

// Track elements that already have listeners attached to prevent duplicates
const attachedElements = new WeakSet<HTMLElement>();

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
  // Contenteditable divs (Gemini's main input)
  const contentEditables = document.querySelectorAll<HTMLElement>(
    '[contenteditable="true"], [role="textbox"]',
  );
  contentEditables.forEach(attachToInput);

  // Textareas (fallback)
  const textareas = document.querySelectorAll<HTMLTextAreaElement>('textarea');
  textareas.forEach(attachToInput);
}

/**
 * Setup observer to watch for dynamically added input elements
 */
function setupObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (!isEnabled) return;

    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;

        // Check if the node itself is an input
        if (node.isContentEditable || node.getAttribute('role') === 'textbox') {
          attachToInput(node);
        }
        if (node.tagName === 'TEXTAREA') {
          attachToInput(node);
        }

        // Check descendants
        const editables = node.querySelectorAll<HTMLElement>(
          '[contenteditable="true"], [role="textbox"], textarea',
        );
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
 * Load the enabled state from storage
 */
async function loadSettings(): Promise<void> {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage?.sync?.get) {
        resolve();
        return;
      }
      chrome.storage.sync.get({ [StorageKeys.CTRL_ENTER_SEND]: false }, (result) => {
        isEnabled = result?.[StorageKeys.CTRL_ENTER_SEND] === true;
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

/**
 * Listen for storage changes
 */
let storageListener:
  | ((changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => void)
  | null = null;

function setupStorageListener(): void {
  if (storageListener) return;

  try {
    storageListener = (changes, areaName) => {
      if (areaName !== 'sync') return;
      if (StorageKeys.CTRL_ENTER_SEND in changes) {
        isEnabled = changes[StorageKeys.CTRL_ENTER_SEND].newValue === true;

        if (isEnabled) {
          // Changed from disabled to enabled: connect everything
          attachToAllInputs();
        } else {
          // Changed from enabled to disabled: remove only event listeners
          // We don't verify full cleanup here because observer should stay active
          // to be ready if user enables it again, but we must remove listeners
          cleanupFns.forEach((fn) => fn());
          cleanupFns = [];
        }
      }
    };

    chrome.storage?.onChanged?.addListener(storageListener);
  } catch {
    // Storage API not available
  }
}

/**
 * Cleanup all event listeners
 */
function cleanup(): void {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];

  if (observer) {
    observer.disconnect();
    observer = null;
  }

  if (storageListener) {
    chrome.storage?.onChanged?.removeListener(storageListener);
    storageListener = null;
  }
}

/**
 * Initialize the send behavior module
 */
export async function startSendBehavior(): Promise<() => void> {
  await loadSettings();
  setupStorageListener();

  if (isEnabled) {
    attachToAllInputs();
  }

  setupObserver();

  return cleanup;
}
