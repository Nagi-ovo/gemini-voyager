/**
 * Folder-as-Project feature
 *
 * When enabled, injects a folder picker above the Gemini chat input on new-chat
 * pages. On the first send, it prepends any folder instructions just-in-time
 * and automatically assigns the new conversation to the selected folder.
 */
import { StorageKeys } from '@/core/types/common';

import { findChatInput } from '../chatInput/index';
import type { FolderManager } from '../folder/manager';
import { setInputText } from '../utils/inputHelper';
import { watchRouteChanges } from '../utils/routeWatcher';
import {
  buildInstructionBlock,
  hasInstructionBlock,
  stripInstructionBlock,
} from './instructionBlock';
import { createFolderProjectPicker } from './picker';

// ============================================================================
// Module state (per-tab, reset on navigation)
// ============================================================================

let featureInitialized = false;
let selectedFolderId: string | null = null;
let selectedFolderName: string | null = null;
let selectedFolderInstructions: string | null = null;
let picker: ReturnType<typeof createFolderProjectPicker> | null = null;
let lastHref = '';
let stopRouteWatcher: (() => void) | null = null;
let ctrlEnterSendEnabled = false;
let pendingSend = false;
let pendingSendResetTimer: ReturnType<typeof setTimeout> | null = null;
let sendClickListener: ((e: Event) => void) | null = null;
let sendKeydownListener: ((e: KeyboardEvent) => void) | null = null;
let sidebarNavClickListener: ((e: Event) => void) | null = null;

const SEND_BUTTON_SELECTOR =
  'button[aria-label*="Send"], button[aria-label*="send"], ' +
  'button[data-tooltip*="Send"], button[data-tooltip*="send"], ' +
  '[data-send-button], .send-button';

// Sidebar conversation links: /app/<convId>, /u/0/app/<convId>, /gem/<gemId>/<convId>.
// Used by sidebarNavClickListener to cancel pendingSend before URL change.
const CONVERSATION_HREF_PATTERN = /\/(u\/\d+\/)?(app|gem\/[^/]+)\/[^/?#]+/;

// pendingSend lifetime — must exceed worst-case first-response latency
// (PDF/paper analysis can take 30+ s before URL updates).
const PENDING_SEND_TIMEOUT_MS = 60_000;

// ============================================================================
// URL helpers
// ============================================================================

/**
 * Returns true when the current pathname is a new (empty) chat or gem page —
 * i.e., no conversation ID is present yet.
 *
 * Supports multi-profile paths like /u/0/app.
 *
 * @param path - `window.location.pathname` to test
 */
export function isNewChatPath(path: string): boolean {
  // Matches /app or /app/ but not /app/<convId>
  // Matches /gem/<gemId> or /gem/<gemId>/ but not /gem/<gemId>/<convId>
  return /^\/(u\/\d+\/)?(app\/?|gem\/[^/]+\/?)$/.test(path);
}

/**
 * Extracts the conversation ID from a Gemini chat or gem URL path.
 *
 * @param path - `window.location.pathname` to parse
 * @returns Conversation ID string, or null if none present
 */
export function extractConvId(path: string): string | null {
  const appMatch = path.match(/\/app\/([^/?#]+)/);
  if (appMatch?.[1]) return appMatch[1];
  const gemMatch = path.match(/\/gem\/[^/]+\/([^/?#]+)/);
  return gemMatch?.[1] ?? null;
}

// ============================================================================
// Send detection — distinguishes message sends from sidebar navigation
// ============================================================================

function readInputText(input: HTMLElement): string {
  return input instanceof HTMLTextAreaElement
    ? input.value
    : (input.innerText ?? input.textContent ?? '');
}

function clearPendingSendState(): void {
  if (pendingSendResetTimer !== null) {
    clearTimeout(pendingSendResetTimer);
    pendingSendResetTimer = null;
  }
  pendingSend = false;
}

function clearPreparedInstructions(): void {
  const input = findChatInput();
  if (!input) return;

  const currentText = readInputText(input);
  if (!hasInstructionBlock(currentText)) return;

  setInputText(input, stripInstructionBlock(currentText));
}

function prepareInputForSend(input: HTMLElement | null): void {
  if (!input || !selectedFolderInstructions || !selectedFolderName) return;

  const currentText = stripInstructionBlock(readInputText(input));
  const combined = `${buildInstructionBlock(selectedFolderName, selectedFolderInstructions)}${currentText}`;
  setInputText(input, combined);
}

function schedulePendingSendReset(): void {
  if (pendingSendResetTimer !== null) {
    clearTimeout(pendingSendResetTimer);
  }

  pendingSendResetTimer = setTimeout(() => {
    if (!pendingSend) return;
    clearPendingSendState();
    if (isNewChatPath(window.location.pathname)) {
      clearPreparedInstructions();
    }
  }, PENDING_SEND_TIMEOUT_MS);
}

/** True when the input has no user text (stray instruction block stripped first). */
function isInputEmpty(input: HTMLElement | null): boolean {
  if (!input) return true;
  return stripInstructionBlock(readInputText(input)).trim() === '';
}

function markPendingSend(input: HTMLElement | null): void {
  prepareInputForSend(input);
  pendingSend = true;
  schedulePendingSendReset();
}

/**
 * Handle an empty-input Enter press: strip any leftover instruction block so
 * Gemini's bubble-phase handler sees a truly empty input and doesn't submit
 * a message containing only the block. Returns true when the press was
 * handled (caller should skip markPendingSend).
 *
 * Click-send is NOT routed through this — Gemini only enables the send button
 * when there is text or an attachment, so an empty-input click means
 * "send the attachment" and the auto-assignment must proceed.
 */
function handleEmptyInputEnter(input: HTMLElement | null): boolean {
  if (!isInputEmpty(input)) return false;
  if (input) {
    const currentText = readInputText(input);
    if (hasInstructionBlock(currentText)) {
      setInputText(input, stripInstructionBlock(currentText));
    }
  }
  return true;
}

function isKeyboardSend(event: KeyboardEvent): boolean {
  if (event.key !== 'Enter' || event.isComposing || event.shiftKey) return false;

  if (ctrlEnterSendEnabled) {
    return event.ctrlKey || event.metaKey;
  }

  return !event.ctrlKey && !event.metaKey;
}

function isEditableTarget(target: EventTarget | null): target is HTMLElement {
  if (!(target instanceof HTMLElement)) return false;

  return (
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    target.getAttribute('contenteditable') === 'true' ||
    target.getAttribute('role') === 'textbox'
  );
}

function extractGemMetadata(path: string): { isGem: boolean; gemId?: string } {
  const gemMatch = path.match(/\/gem\/([^/]+)\/[^/?#]+/);
  if (!gemMatch?.[1]) {
    return { isGem: false };
  }

  return {
    isGem: true,
    gemId: gemMatch[1],
  };
}

function setupSendDetection(): void {
  if (sendClickListener || sendKeydownListener || sidebarNavClickListener) return;

  sendClickListener = (e: Event) => {
    if (!selectedFolderId) return;
    const target = e.target as HTMLElement;
    if (target.closest(SEND_BUTTON_SELECTOR)) {
      markPendingSend(findChatInput());
    }
  };

  sendKeydownListener = (e: KeyboardEvent) => {
    if (!selectedFolderId || !isKeyboardSend(e) || !isEditableTarget(e.target)) return;
    if (handleEmptyInputEnter(e.target)) return;
    markPendingSend(e.target);
  };

  // Cancel pendingSend when user clicks a sidebar conversation link, so the
  // resulting URL change isn't misattributed to the current send.
  sidebarNavClickListener = (e: Event) => {
    if (!pendingSend) return;
    // Plain left-click only — middle/right/modifier clicks open new tabs and
    // leave the current tab's URL on /app.
    if (!(e instanceof MouseEvent)) return;
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    // Element (not HTMLElement) so closest() works on SVG icons inside <a>.
    const target = e.target;
    if (!(target instanceof Element)) return;
    const link = target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href') ?? '';
    if (CONVERSATION_HREF_PATTERN.test(href)) {
      clearPendingSendState();
    }
  };

  document.addEventListener('click', sendClickListener, true);
  document.addEventListener('keydown', sendKeydownListener, true);
  document.addEventListener('click', sidebarNavClickListener, true);
}

function teardownSendDetection(): void {
  if (sendClickListener) {
    document.removeEventListener('click', sendClickListener, true);
    sendClickListener = null;
  }
  if (sendKeydownListener) {
    document.removeEventListener('keydown', sendKeydownListener, true);
    sendKeydownListener = null;
  }
  if (sidebarNavClickListener) {
    document.removeEventListener('click', sidebarNavClickListener, true);
    sidebarNavClickListener = null;
  }
  clearPendingSendState();
}

// ============================================================================
// Conversation title
// ============================================================================

function getConversationTitle(convId: string): string {
  const escapedId = convId.replace(/"/g, '\\"');
  const link = document.querySelector<HTMLAnchorElement>(
    `[data-test-id="conversation"][jslog*="c_${escapedId}"] a, a[href*="/app/${escapedId}"], a[href*="/gem/"][href$="/${escapedId}"]`,
  );
  return link?.textContent?.trim() || document.title || 'New Chat';
}

// ============================================================================
// URL change handler
// ============================================================================

function handleNavigation(manager: FolderManager, prevPath: string, newPath: string): void {
  const prevWasNewChat = isNewChatPath(prevPath);
  const newConvId = extractConvId(newPath);

  // User sent their first message: new-chat → conversation
  // Gate on pendingSend to avoid false assignment when clicking sidebar links
  if (prevWasNewChat && newConvId && selectedFolderId && pendingSend) {
    const title = getConversationTitle(newConvId);
    const { isGem, gemId } = extractGemMetadata(newPath);
    manager.addConversationToFolderFromNative(
      selectedFolderId,
      newConvId,
      title,
      window.location.href,
      isGem,
      gemId,
      Date.now(),
    );
    selectedFolderId = null;
    selectedFolderName = null;
    selectedFolderInstructions = null;
    clearPendingSendState();
  }

  if (isNewChatPath(newPath)) {
    // Navigated to a new chat page — (re)show picker
    selectedFolderId = null;
    selectedFolderName = null;
    selectedFolderInstructions = null;
    clearPendingSendState();
    clearPreparedInstructions();
    picker?.remove();
    void picker?.show();
  } else {
    // Left new-chat: clear folder selection so follow-up messages don't
    // re-inject instructions. Trade-off: when Branch 1 was skipped because
    // the >60s timer fired, the conversation is NOT auto-assigned (user
    // must drag it manually) — the alternative would re-introduce follow-up
    // injection on the new conversation page.
    selectedFolderId = null;
    selectedFolderName = null;
    selectedFolderInstructions = null;
    clearPendingSendState();
    picker?.remove();
  }
}

// ============================================================================
// URL watcher
// ============================================================================

function stopURLWatcher(): void {
  stopRouteWatcher?.();
  stopRouteWatcher = null;
  teardownSendDetection();
}

function startURLWatcher(manager: FolderManager): void {
  // Clean up any existing watcher (idempotent for toggle cycles)
  stopURLWatcher();
  // A pending mount may finish after an off/on cycle; keep its cleanup owner.
  picker ??= createFolderProjectPicker({
    loadFolders: async () => {
      await manager.ensureDataLoaded();
      return manager.getFolders();
    },
    canMount: () => featureInitialized && isNewChatPath(window.location.pathname),
    onSelect: (folder, source) => {
      selectedFolderId = folder?.id ?? null;
      selectedFolderName = folder?.name ?? null;
      selectedFolderInstructions = folder?.instructions ?? null;
      // Pending selection leaves the input alone; only an explicit picker choice clears it.
      if (source === 'user') clearPreparedInstructions();
    },
  });

  lastHref = window.location.href;

  const checkUrl = () => {
    const current = window.location.href;
    if (current === lastHref) return;
    const prevPath = new URL(lastHref).pathname;
    const newPath = new URL(current).pathname;
    lastHref = current;
    handleNavigation(manager, prevPath, newPath);
  };

  stopRouteWatcher = watchRouteChanges(({ trigger }) => {
    if (trigger !== 'poll') clearPendingSendState();
    checkUrl();
  });

  // Also check on initial load
  if (isNewChatPath(window.location.pathname)) {
    void picker?.show();
  }

  setupSendDetection();
}

// ============================================================================
// Entry point
// ============================================================================

/**
 * Initialise the Folder-as-Project feature. Reads the enabled flag from
 * chrome.storage.sync and sets up the URL watcher + picker injection.
 *
 * @param manager - The active FolderManager instance
 */
export function startFolderProject(manager: FolderManager): void {
  chrome.storage?.sync?.get(
    {
      [StorageKeys.FOLDER_PROJECT_ENABLED]: false,
      [StorageKeys.CTRL_ENTER_SEND]: false,
    },
    (res) => {
      ctrlEnterSendEnabled = res?.[StorageKeys.CTRL_ENTER_SEND] === true;
      if (res?.[StorageKeys.FOLDER_PROJECT_ENABLED] !== true) return;
      if (featureInitialized) return;
      featureInitialized = true;
      startURLWatcher(manager);
    },
  );

  // React to toggle changes without a page reload
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (StorageKeys.CTRL_ENTER_SEND in changes) {
      ctrlEnterSendEnabled = changes[StorageKeys.CTRL_ENTER_SEND].newValue === true;
    }

    if (!(StorageKeys.FOLDER_PROJECT_ENABLED in changes)) return;
    const enabled = changes[StorageKeys.FOLDER_PROJECT_ENABLED].newValue === true;
    if (enabled && !featureInitialized) {
      featureInitialized = true;
      startURLWatcher(manager);
    } else if (!enabled) {
      featureInitialized = false;
      stopURLWatcher();
      clearPreparedInstructions();
      picker?.remove();
      selectedFolderId = null;
      selectedFolderName = null;
      selectedFolderInstructions = null;
      // Drop any pending folder selection so re-enabling later doesn't auto-select a stale folder
      void chrome.storage?.local?.remove([StorageKeys.FOLDER_PROJECT_PENDING_FOLDER_ID]);
    }
  });
}
