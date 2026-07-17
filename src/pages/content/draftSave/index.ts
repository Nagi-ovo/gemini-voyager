/**
 * Draft Auto-Save Module
 *
 * Automatically saves input box content as a draft and restores it
 * when the user returns to the same conversation after page refresh
 * or accidental tab close.
 *
 * - Drafts are keyed by conversation URL path
 * - Saved to chrome.storage.local (persists across sessions)
 * - Cleared when a message is sent
 * - Controlled by the `gvDraftAutoSave` storage setting
 *
 * ARCHITECTURE:
 * - Observer and listeners are ONLY active when the feature is enabled
 * - When disabled, no DOM observation or event handling occurs
 * - Storage listener remains active to respond to setting changes
 */
import { StorageKeys } from '@/core/types/common';
import { isExtensionContextInvalidatedError } from '@/core/utils/extensionContext';

import { stripInstructionBlock } from '../folderProject/instructionBlock';
import { setInputText } from '../utils/inputHelper';
import { watchRouteChanges } from '../utils/routeWatcher';

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = '[DraftSave]';

/** Storage key prefix for draft entries in chrome.storage.local */
const DRAFT_STORAGE_PREFIX = 'gvDraft_';

/** Maximum number of drafts to keep (oldest are pruned) */
const MAX_DRAFTS = 5;

/** Debounce delay for saving drafts (ms) */
const SAVE_DEBOUNCE_MS = 1000;

/** Only run pruneOldDrafts every N saves to avoid reading all storage too often */
const PRUNE_EVERY_N_SAVES = 10;

/** Delay before restoring a draft to ensure input is ready (ms) */
const RESTORE_DELAY_MS = 500;

/** Interval to check if a message was sent and clear draft (ms) */
const SEND_CHECK_INTERVAL_MS = 1000;

/** Keep a send intent only long enough to cover SPA navigation. */
const SEND_INTENT_TIMEOUT_MS = 2000;

const SEND_BUTTON_SELECTOR = [
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[data-tooltip*="Send"]',
  'button[data-tooltip*="send"]',
  '[data-send-button]',
  '.send-button',
].join(', ');

/** Selectors for finding the chat input */
const INPUT_SELECTORS = [
  'rich-textarea [contenteditable="true"]',
  'div[contenteditable="true"][role="textbox"]',
  '.input-area textarea',
  'textarea[placeholder*="Ask"]',
] as const;

// ============================================================================
// State
// ============================================================================

let isEnabled = false;
let observer: MutationObserver | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let sendCheckTimer: ReturnType<typeof setInterval> | null = null;
let stopRouteWatcher: (() => void) | null = null;
let currentPath = '';
let lastSavedContent = '';
let saveCount = 0;
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let inputListener: ((event: Event) => void) | null = null;
let attachedInput: HTMLElement | null = null;
let hasRestoredForCurrentPath = false;
let pendingSave: { content: string; path: string } | null = null;
let pendingSendPath: string | null = null;
let sendIntentTimer: number | null = null;
let sendIntentListener: ((event: Event) => void) | null = null;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the conversation path for use as a draft key.
 * Strips hash and query, keeps the path.
 * e.g. "/app/abc123" or "/u/0/app/abc123"
 */
function getConversationPath(): string {
  return window.location.pathname;
}

/**
 * Get the storage key for a conversation path.
 */
function getDraftStorageKey(path: string): string {
  return `${DRAFT_STORAGE_PREFIX}${path}`;
}

/**
 * Find the visible main chat input element.
 */
function findChatInput(): HTMLElement | null {
  for (const selector of INPUT_SELECTORS) {
    const els = document.querySelectorAll(selector);
    for (const el of Array.from(els)) {
      if (el.getBoundingClientRect().height > 0) {
        return el as HTMLElement;
      }
    }
  }
  return null;
}

/**
 * Get the text content of the chat input.
 */
function getInputText(input: HTMLElement): string {
  if (input instanceof HTMLTextAreaElement) {
    return input.value;
  }
  return input.innerText ?? input.textContent ?? '';
}

/**
 * Check if input content is effectively empty.
 */
function isInputEffectivelyEmpty(input: HTMLElement): boolean {
  const text = getInputText(input).trim();
  if (text.length === 0) return true;

  // Check if the text is just placeholder text
  const richTextarea = input.closest('rich-textarea');
  const placeholders = [
    input.getAttribute('data-placeholder'),
    input.getAttribute('aria-placeholder'),
    input.getAttribute('placeholder'),
    richTextarea?.getAttribute('data-placeholder'),
    richTextarea?.getAttribute('aria-placeholder'),
    richTextarea?.getAttribute('placeholder'),
  ].filter((v): v is string => Boolean(v));

  return placeholders.some((p) => p.trim() === text);
}

// ============================================================================
// Draft Storage Operations
// ============================================================================

/**
 * Save a draft for the current conversation.
 */
function saveDraft(path: string, content: string): void {
  const sanitizedContent = stripInstructionBlock(content).trim();

  if (!sanitizedContent) {
    // Remove draft if content is empty
    removeDraft(path);
    return;
  }

  const key = getDraftStorageKey(path);
  const data = {
    content: sanitizedContent,
    timestamp: Date.now(),
    path,
  };

  try {
    chrome.storage?.local?.set({ [key]: data }, () => {
      if (chrome.runtime.lastError) {
        console.warn(LOG_PREFIX, 'Failed to save draft:', chrome.runtime.lastError.message);
        return;
      }
      if (path === currentPath) lastSavedContent = sanitizedContent;
      // Prune old drafts periodically (not every save)
      saveCount++;
      if (saveCount % PRUNE_EVERY_N_SAVES === 0) {
        pruneOldDrafts();
      }
    });
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return;
    console.warn(LOG_PREFIX, 'Failed to save draft:', error);
  }
}

/**
 * Remove a draft for a given path.
 */
function removeDraft(path: string): void {
  const key = getDraftStorageKey(path);
  try {
    chrome.storage?.local?.remove(key);
    if (path === currentPath) lastSavedContent = '';
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return;
    console.warn(LOG_PREFIX, 'Failed to remove draft:', error);
  }
}

/**
 * Load a draft for a given path.
 */
async function loadDraft(path: string): Promise<string | null> {
  const key = getDraftStorageKey(path);
  return new Promise((resolve) => {
    try {
      chrome.storage?.local?.get(key, (result) => {
        const data = result?.[key] as { content?: string } | undefined;
        resolve(data?.content ?? null);
      });
    } catch (error) {
      if (isExtensionContextInvalidatedError(error)) {
        resolve(null);
        return;
      }
      console.warn(LOG_PREFIX, 'Failed to load draft:', error);
      resolve(null);
    }
  });
}

/**
 * Prune old drafts to keep storage usage bounded.
 */
function pruneOldDrafts(): void {
  try {
    chrome.storage?.local?.get(null, (items) => {
      if (chrome.runtime.lastError) return;

      const draftEntries: { key: string; timestamp: number }[] = [];
      for (const [key, value] of Object.entries(items)) {
        if (key.startsWith(DRAFT_STORAGE_PREFIX) && value && typeof value === 'object') {
          const entry = value as { timestamp?: number };
          draftEntries.push({ key, timestamp: entry.timestamp ?? 0 });
        }
      }

      if (draftEntries.length <= MAX_DRAFTS) return;

      // Sort by timestamp ascending (oldest first)
      draftEntries.sort((a, b) => a.timestamp - b.timestamp);

      const toRemove = draftEntries.slice(0, draftEntries.length - MAX_DRAFTS).map((e) => e.key);
      chrome.storage?.local?.remove(toRemove);
    });
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return;
  }
}

// ============================================================================
// Input Monitoring
// ============================================================================

/**
 * Handle input changes with debounce.
 */
function flushPendingSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;

  const pending = pendingSave;
  pendingSave = null;
  if (!pending) return;

  if (pending.path === currentPath && pending.content === lastSavedContent) return;

  saveDraft(pending.path, pending.content);
}

function discardPendingSave(path: string): void {
  if (pendingSave?.path !== path) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  pendingSave = null;
}

function clearSendIntent(): void {
  pendingSendPath = null;
  if (sendIntentTimer !== null) {
    window.clearTimeout(sendIntentTimer);
    sendIntentTimer = null;
  }
}

function markSendIntent(): void {
  pendingSendPath = getConversationPath();
  if (sendIntentTimer !== null) window.clearTimeout(sendIntentTimer);
  sendIntentTimer = window.setTimeout(clearSendIntent, SEND_INTENT_TIMEOUT_MS);
}

function handleInputChange(input: HTMLElement): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  const content = stripInstructionBlock(getInputText(input)).trim();
  if (!content && pendingSendPath) {
    const sentPath = pendingSendPath;
    discardPendingSave(sentPath);
    removeDraft(sentPath);
    clearSendIntent();
    return;
  }

  pendingSave = {
    content,
    // Read the live route at the input event. The shared route watcher is a
    // fallback poller and can intentionally lag a sidebar navigation by 400ms.
    path: getConversationPath(),
  };

  saveTimer = setTimeout(() => {
    flushPendingSave();
  }, SAVE_DEBOUNCE_MS);
}

/**
 * Attach input listener to the chat input.
 */
function attachInputListener(input: HTMLElement): void {
  if (attachedInput === input) return;

  detachInputListener();

  inputListener = () => handleInputChange(input);
  input.addEventListener('input', inputListener, { capture: true });
  attachedInput = input;
}

/**
 * Detach input listener.
 */
function detachInputListener(): void {
  if (attachedInput && inputListener) {
    attachedInput.removeEventListener('input', inputListener, { capture: true });
  }
  attachedInput = null;
  inputListener = null;
}

// ============================================================================
// Send Detection
// ============================================================================

/**
 * Start polling to detect when a message is sent.
 * When the input becomes empty after having content, the draft is cleared.
 */
function startSendDetection(): void {
  if (sendCheckTimer) return;

  let wasNonEmpty = false;
  let observedPath = currentPath || getConversationPath();

  sendCheckTimer = setInterval(() => {
    const path = getConversationPath();
    if (path !== observedPath) {
      observedPath = path;
      wasNonEmpty = false;
      return;
    }

    const input = findChatInput();
    if (!input) return;

    const empty = isInputEffectivelyEmpty(input);

    if (wasNonEmpty && empty) {
      // Input went from non-empty to empty — message was likely sent
      discardPendingSave(observedPath);
      removeDraft(observedPath);
      clearSendIntent();
      wasNonEmpty = false;
    } else if (!empty) {
      wasNonEmpty = true;
    }
  }, SEND_CHECK_INTERVAL_MS);
}

function startSendIntentDetection(): void {
  if (sendIntentListener) return;

  sendIntentListener = (event) => {
    if (event.type === 'submit') {
      const form = event.target;
      if (form instanceof HTMLFormElement && attachedInput && form.contains(attachedInput)) {
        markSendIntent();
      }
      return;
    }

    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest(SEND_BUTTON_SELECTOR);
    if (!button || !attachedInput) return;

    const composer = button.closest('form, .text-input-field, ms-prompt-input-wrapper');
    if (!composer || composer.contains(attachedInput)) markSendIntent();
  };

  document.addEventListener('click', sendIntentListener, true);
  document.addEventListener('submit', sendIntentListener, true);
}

function stopSendIntentDetection(): void {
  if (sendIntentListener) {
    document.removeEventListener('click', sendIntentListener, true);
    document.removeEventListener('submit', sendIntentListener, true);
    sendIntentListener = null;
  }
  clearSendIntent();
}

/**
 * Stop send detection polling.
 */
function stopSendDetection(): void {
  if (sendCheckTimer) {
    clearInterval(sendCheckTimer);
    sendCheckTimer = null;
  }
}

// ============================================================================
// Draft Restoration
// ============================================================================

/**
 * Attempt to restore a draft for the current conversation.
 */
async function restoreDraft(): Promise<void> {
  const path = getConversationPath();
  if (hasRestoredForCurrentPath && path === currentPath) return;

  const savedContent = await loadDraft(path);
  if (path !== currentPath || path !== getConversationPath()) return;

  const content = savedContent ? stripInstructionBlock(savedContent).trim() : null;
  if (!content) {
    hasRestoredForCurrentPath = true;
    return;
  }

  // Wait for the input to be available
  const tryRestore = (attempts: number) => {
    if (path !== currentPath || path !== getConversationPath()) return;

    const input = findChatInput();
    if (input && isInputEffectivelyEmpty(input)) {
      setInputText(input, content);
      lastSavedContent = content;
      hasRestoredForCurrentPath = true;
      return;
    }

    if (input && !isInputEffectivelyEmpty(input)) {
      // Input already has content (user typed something), don't overwrite
      hasRestoredForCurrentPath = true;
      return;
    }

    if (attempts > 0) {
      setTimeout(() => tryRestore(attempts - 1), RESTORE_DELAY_MS);
    }
  };

  tryRestore(5);
}

// ============================================================================
// URL Change Detection
// ============================================================================

/**
 * Watch for URL changes (SPA navigation) and restore drafts.
 */
function startUrlWatcher(): void {
  if (stopRouteWatcher) return;

  currentPath = getConversationPath();

  stopRouteWatcher = watchRouteChanges(() => {
    const newPath = getConversationPath();
    if (newPath !== currentPath) {
      const previousPath = currentPath;
      if (pendingSendPath === previousPath) {
        // Sending a first message navigates /app to /app/<id>. Do not flush the
        // still-debounced, already-sent text back into the old draft key.
        discardPendingSave(previousPath);
        removeDraft(previousPath);
        clearSendIntent();
      } else {
        // Sidebar navigation should preserve the source draft. The pending
        // entry carries the route captured at the actual input event.
        flushPendingSave();
      }

      currentPath = newPath;
      lastSavedContent = '';
      hasRestoredForCurrentPath = false;

      // Restore draft for the new page after a short delay
      setTimeout(() => restoreDraft(), RESTORE_DELAY_MS);
    }
  });
}

/**
 * Stop URL watcher.
 */
function stopUrlWatcher(): void {
  stopRouteWatcher?.();
  stopRouteWatcher = null;
}

// ============================================================================
// Observer Management
// ============================================================================

/**
 * Setup observer to watch for dynamically added input elements.
 */
function setupObserver(): void {
  if (observer) return;

  observer = new MutationObserver(() => {
    const input = findChatInput();
    if (input) {
      attachInputListener(input);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

/**
 * Disconnect the observer.
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
 * Enable the feature.
 */
function enableFeature(): void {
  if (isEnabled) return;

  isEnabled = true;
  currentPath = getConversationPath();
  lastSavedContent = '';
  hasRestoredForCurrentPath = false;

  // Attach to existing input
  const input = findChatInput();
  if (input) {
    attachInputListener(input);
  }

  setupObserver();
  startSendDetection();
  startSendIntentDetection();
  startUrlWatcher();

  // Restore draft for the current page
  restoreDraft();
}

/**
 * Disable the feature.
 */
function disableFeature(): void {
  if (!isEnabled) return;

  isEnabled = false;

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingSave = null;

  detachInputListener();
  disconnectObserver();
  stopSendDetection();
  stopSendIntentDetection();
  stopUrlWatcher();
}

// ============================================================================
// Storage & Initialization
// ============================================================================

/**
 * Load the enabled state from storage.
 */
async function loadSettings(): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!chrome.storage?.sync?.get) {
        resolve(false);
        return;
      }
      chrome.storage.sync.get({ [StorageKeys.DRAFT_AUTO_SAVE]: false }, (result) => {
        const enabled = result?.[StorageKeys.DRAFT_AUTO_SAVE] === true;
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
 * Setup storage change listener.
 */
function setupStorageListener(): void {
  if (storageListener) return;

  storageListener = (changes, areaName) => {
    if (areaName !== 'sync') return;
    if (!(StorageKeys.DRAFT_AUTO_SAVE in changes)) return;

    const newValue = changes[StorageKeys.DRAFT_AUTO_SAVE].newValue === true;

    if (newValue && !isEnabled) {
      enableFeature();
    } else if (!newValue && isEnabled) {
      disableFeature();
    }
  };

  try {
    chrome.storage?.onChanged?.addListener(storageListener);
  } catch (error) {
    if (isExtensionContextInvalidatedError(error)) return;
    console.warn(LOG_PREFIX, 'Failed to setup storage listener:', error);
  }
}

/**
 * Cleanup all resources.
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
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Initialize the draft auto-save module.
 * @returns A cleanup function to be called on unmount
 */
export async function startDraftSave(): Promise<() => void> {
  setupStorageListener();

  const initialEnabled = await loadSettings();
  if (initialEnabled) {
    enableFeature();
  }

  return cleanup;
}
