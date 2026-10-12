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
import { sanitizeDraftAt } from '@/features/plugins/verbs/draftSave/draftPolicy';

import { watchRouteChanges } from '../utils/routeWatcher';
import { DraftStore, draftStoreOptions } from './draftStore';
import { registerDraftFlush } from './draftUnloadFlush';
import { GEMINI_DRAFT_INPUT_SELECTOR_LIST, geminiDraftPolicy } from './geminiDraftPolicy';
import { startGeminiDraftSendDetection } from './geminiDraftSendDetection';

// ============================================================================
// Constants
// ============================================================================

const LOG_PREFIX = '[DraftSave]';

/** Debounce delay for saving drafts (ms) */
const SAVE_DEBOUNCE_MS = 1000;

/** Delay before restoring a draft to ensure input is ready (ms) */
const RESTORE_DELAY_MS = 500;

/** Interval to check if a message was sent and clear draft (ms) */
const SEND_CHECK_INTERVAL_MS = 1000;

const INPUT_SELECTOR_LIST = GEMINI_DRAFT_INPUT_SELECTOR_LIST;

const policy = geminiDraftPolicy();

// ============================================================================
// State
// ============================================================================

let isEnabled = false;
let observer: MutationObserver | null = null;
let inputLookupFrame: number | null = null;
let composerFocusListener: ((event: Event) => void) | null = null;
/** Bumped on enable and disable so restores started earlier stop at their next step. */
let restoreGeneration = 0;
/** Bumped by every toggle event so a slower startup read cannot override it. */
let settingsChangeCount = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let sendCheckTimer: ReturnType<typeof setInterval> | null = null;
let stopRouteWatcher: (() => void) | null = null;
let currentPath = '';
let lastSavedContent = '';
const drafts = new DraftStore(
  (path, content) => {
    if (path === currentPath) lastSavedContent = content;
  },
  draftStoreOptions(policy, document),
);
let storageListener:
  | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
  | null = null;
let inputListener: ((event: Event) => void) | null = null;
let attachedInput: HTMLElement | null = null;
let hasRestoredForCurrentPath = false;
let pendingSave: { content: string; path: string } | null = null;
let sendDetection: ReturnType<typeof startGeminiDraftSendDetection> | null = null;
let unregisterUnloadFlush: (() => void) | null = null;
/** Typing or sending makes a pending old restore obsolete even when the composer empties again. */
let inputRevision = 0;
let sentRevision = 0;

// ============================================================================
// Helpers
// ============================================================================

/**
 * Get the conversation path for use as a draft key.
 * Strips hash and query, keeps the path.
 * e.g. "/app/abc123" or "/u/0/app/abc123"
 */
function getConversationPath(): string {
  // Gemini's policy keys every page by its pathname; only catalog temporary chats get `null`.
  return policy.keyFor(window.location) ?? window.location.pathname;
}

function isEligiblePage(): boolean {
  return policy.eligible(window.location, document);
}

/**
 * Find the visible main chat input element.
 */
function findChatInput(): HTMLElement | null {
  return policy.findInput(document);
}

function isInputEffectivelyEmpty(input: HTMLElement): boolean {
  return policy.isEmpty(input);
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

  drafts.save(pending.path, pending.content);
}

function discardPendingSave(path: string): void {
  if (pendingSave?.path !== path) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  pendingSave = null;
}

function handleInputChange(input: HTMLElement): void {
  inputRevision += 1;
  const content = sanitizeDraftAt(policy, 'input', policy.readText(input)).trim();
  if (!content) {
    const previousSentRevision = sentRevision;
    sendDetection?.checkSent();
    if (sentRevision !== previousSentRevision) return;
    // Gemini may clear the old composer after routing, before the route watcher flushes its draft.
    if (getConversationPath() !== currentPath) return;
  }
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
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
 * Rebind when Gemini reveals another mounted composer without adding nodes.
 * Send confirmation belongs to the shared detector, never to an empty field alone.
 */
function startSendDetection(): void {
  if (sendCheckTimer) return;

  sendCheckTimer = setInterval(() => {
    const input = findChatInput();
    if (!input) return;
    // A connected input is not necessarily the active composer: Gemini can
    // hide it and reveal another mounted one without adding nodes.
    attachInputListener(input);
  }, SEND_CHECK_INTERVAL_MS);
}

function startSendIntentDetection(): void {
  if (sendDetection) return;
  sendDetection = startGeminiDraftSendDetection({
    doc: document,
    policy,
    onIntent: () => {
      inputRevision += 1;
    },
    onSent: (path) => {
      inputRevision += 1;
      sentRevision += 1;
      discardPendingSave(path);
      drafts.remove(path);
    },
  });
}

function stopSendIntentDetection(): void {
  sendDetection?.stop();
  sendDetection = null;
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
async function restoreDraft(generation = restoreGeneration): Promise<void> {
  const identity = policy.restoreIdentity(document);
  const revision = inputRevision;
  // Every continuation re-checks this: a restore that outlives disable or
  // cleanup must not rebind the input or write a draft into it, and one whose
  // page turned out to be Enterprise while it waited must not fill its
  // composer (the store refuses writes there for the same reason).
  const isCurrent = () =>
    isEnabled &&
    generation === restoreGeneration &&
    revision === inputRevision &&
    identity === policy.restoreIdentity(document) &&
    isEligiblePage();
  if (!isCurrent()) return;
  const path = getConversationPath();
  if (hasRestoredForCurrentPath && path === currentPath) return;

  const savedContent = await drafts.load(path);
  if (!isCurrent()) return;
  if (path !== currentPath || path !== getConversationPath()) return;

  const content = savedContent ? sanitizeDraftAt(policy, 'restore', savedContent).trim() : null;
  if (!content) {
    hasRestoredForCurrentPath = true;
    return;
  }

  // Wait for the input to be available
  const tryRestore = (attempts: number) => {
    if (!isCurrent()) return;
    if (path !== currentPath || path !== getConversationPath()) return;

    const input = findChatInput();
    if (input) attachInputListener(input);
    if (input && isInputEffectivelyEmpty(input)) {
      policy.write(input, content);
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
      // A send intent alone cannot distinguish first-send navigation from a sidebar click.
      sendDetection?.checkSent();
      flushPendingSave();

      currentPath = newPath;
      restoreGeneration += 1;
      lastSavedContent = '';
      hasRestoredForCurrentPath = false;

      // Restore draft for the new page after a short delay
      const generation = restoreGeneration;
      setTimeout(() => restoreDraft(generation), RESTORE_DELAY_MS);
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
 * Whether a body mutation batch can change which chat input to listen to.
 * Selector and identity checks only: finding the input reads layout, and
 * Gemini mutates `body` for every streamed chunk and sidebar row (#1040).
 */
function mutationsMayReplaceChatInput(mutations: readonly MutationRecord[]): boolean {
  if (!attachedInput?.isConnected) return true;
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (!(node instanceof Element)) continue;
      if (node.matches(INPUT_SELECTOR_LIST) || node.querySelector(INPUT_SELECTOR_LIST)) return true;
    }
  }
  return false;
}

function scheduleInputLookup(): void {
  if (inputLookupFrame !== null) return;
  inputLookupFrame = window.requestAnimationFrame(() => {
    inputLookupFrame = null;
    const input = findChatInput();
    if (input) {
      attachInputListener(input);
    }
  });
}

/**
 * Setup observer to watch for dynamically added input elements, and a focus
 * listener for a mounted composer becoming the active one.
 */
function setupObserver(): void {
  if (observer) return;

  observer = new MutationObserver((mutations) => {
    if (inputLookupFrame !== null || !mutationsMayReplaceChatInput(mutations)) return;
    scheduleInputLookup();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  composerFocusListener = (event) => {
    const target = event.target;
    if (target === attachedInput || !(target instanceof Element)) return;
    if (!target.matches(INPUT_SELECTOR_LIST)) return;
    // Rebind before returning: Prompt Manager focuses the composer and
    // dispatches `input` in the same tick, before any frame callback runs.
    const input = findChatInput();
    if (input) attachInputListener(input);
  };
  document.addEventListener('focusin', composerFocusListener, true);
}

/**
 * Disconnect the observer.
 */
function disconnectObserver(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (inputLookupFrame !== null) {
    window.cancelAnimationFrame(inputLookupFrame);
    inputLookupFrame = null;
  }
  if (composerFocusListener) {
    document.removeEventListener('focusin', composerFocusListener, true);
    composerFocusListener = null;
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
  restoreGeneration += 1;
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
  unregisterUnloadFlush = registerDraftFlush(flushPendingSave);

  // Restore draft for the current page
  restoreDraft();
}

/**
 * Disable the feature.
 */
function disableFeature(): void {
  if (!isEnabled) return;

  isEnabled = false;
  restoreGeneration += 1;

  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  pendingSave = null;
  unregisterUnloadFlush?.();
  unregisterUnloadFlush = null;

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

    settingsChangeCount += 1;
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

  const changesBeforeRead = settingsChangeCount;
  const initialEnabled = await loadSettings();
  if (initialEnabled && settingsChangeCount === changesBeforeRead) {
    enableFeature();
  }

  return cleanup;
}
