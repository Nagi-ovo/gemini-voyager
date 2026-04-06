/**
 * Folder-as-Project feature
 *
 * When enabled, injects a folder picker above the Gemini chat input on new-chat
 * pages. When the user sends their first message (URL gains a conversation ID),
 * the conversation is automatically assigned to the selected folder.
 */

import { StorageKeys } from '@/core/types/common';
import { getTranslationSyncUnsafe } from '@/utils/i18n';

import { listFilesForFolder } from '@/core/utils/folderFileStore';
import { isSafari } from '@/core/utils/browser';

import { getFolderColor, isDarkMode } from '../folder/folderColors';
import type { FolderManager } from '../folder/manager';
import { setInputText } from '../utils/inputHelper';

// ============================================================================
// Module state (per-tab, reset on navigation)
// ============================================================================

let featureInitialized = false;
let selectedFolderId: string | null = null;
let pickerContainer: HTMLElement | null = null;
let pickerCleanup: (() => void) | null = null;
let lastHref = '';

// ============================================================================
// i18n helper
// ============================================================================

function t(key: string): string {
  return getTranslationSyncUnsafe(key);
}

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
// DOM helper
// ============================================================================

/**
 * Waits for an element matching the selector to appear and have nonzero height.
 *
 * @param selector - CSS selector to query
 * @param timeoutMs - Maximum wait time in milliseconds
 * @returns Matched element, or null on timeout
 */
export function waitForElement(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLElement>(selector);
    if (existing && existing.getBoundingClientRect().height > 0) {
      resolve(existing);
      return;
    }
    const deadline = Date.now() + timeoutMs;
    const check = () => {
      const el = document.querySelector<HTMLElement>(selector);
      if (el && el.getBoundingClientRect().height > 0) {
        resolve(el);
        return;
      }
      if (Date.now() > deadline) {
        resolve(null);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  });
}

// ============================================================================
// Picker UI
// ============================================================================

function populateDropdown(
  dropdown: HTMLElement,
  manager: FolderManager,
  chip: HTMLButtonElement,
): void {
  dropdown.innerHTML = '';
  const folders = manager.getFolders();

  if (folders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'gv-fp-item';
    empty.textContent = t('folderAsProject_noFolder');
    dropdown.appendChild(empty);
    return;
  }

  // "No folder" / clear selection option
  const noneItem = document.createElement('button');
  noneItem.className = 'gv-fp-item';
  noneItem.type = 'button';
  noneItem.setAttribute('role', 'option');
  noneItem.textContent = t('folderAsProject_noFolder');
  noneItem.addEventListener('click', () => {
    selectedFolderId = null;
    chip.textContent = t('folderAsProject_selectFolder');
    chip.removeAttribute('data-selected');
    dropdown.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
  });
  dropdown.appendChild(noneItem);

  for (const folder of folders) {
    const item = document.createElement('button');
    item.className = 'gv-fp-item';
    item.type = 'button';
    item.setAttribute('role', 'option');
    item.dataset.folderId = folder.id;

    if (folder.color && folder.color !== 'default') {
      const dot = document.createElement('span');
      dot.className = 'gv-fp-color-dot';
      dot.style.backgroundColor = getFolderColor(folder.color, isDarkMode());
      item.appendChild(dot);
    }

    const label = document.createElement('span');
    label.textContent = folder.name;
    item.appendChild(label);

    item.addEventListener('click', () => {
      selectedFolderId = folder.id;
      chip.textContent = `📁 ${folder.name}`;
      chip.dataset.selected = folder.id;
      dropdown.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
      // Inject folder instructions into the chat input if set
      if (folder.instructions) {
        void injectInstructions(folder.instructions, folder.instructions.length);
      }
      // Auto-attach folder files (skipped on Safari)
      if (folder.attachments && folder.attachments.length > 0) {
        void tryAutoAttachFiles(folder.id, folder.attachments.length);
      }
    });
    dropdown.appendChild(item);
  }
}

/**
 * Inject folder instructions into the chat input and show a brief info banner.
 *
 * @param instructions - The text to inject
 * @param charCount - Character count for the banner
 */
async function injectInstructions(instructions: string, charCount: number): Promise<void> {
  const input = await waitForElement('rich-textarea [contenteditable="true"]', 3000);
  if (!input) return;

  setInputText(input as HTMLElement, instructions);

  // Show a transient info banner
  showInstructionsBanner(charCount);
}

/**
 * Show a short-lived banner above the picker noting how many instruction
 * characters were loaded.
 *
 * @param charCount - Number of instruction characters injected
 */
function showInstructionsBanner(charCount: number): void {
  // Remove any existing banner
  document.querySelector('.gv-fp-banner')?.remove();

  const banner = document.createElement('div');
  banner.className = 'gv-fp-banner';
  banner.textContent = `${t('folderAsProject_instructionsBanner')} ${charCount} ${t('folderAsProject_instructionsCount').replace('{n}', String(charCount))}`;

  pickerContainer?.parentElement?.insertBefore(banner, pickerContainer);

  setTimeout(() => banner.remove(), 4000);
}

/**
 * Attempt to programmatically attach folder files to the Gemini chat input.
 *
 * Skipped on Safari due to fetch-interceptor limitations. Falls back to a
 * notification if attachment via DataTransfer events fails.
 *
 * @param folderId - The folder ID to load files from
 * @param expectedCount - Number of files the user expects to attach
 */
async function tryAutoAttachFiles(folderId: string, expectedCount: number): Promise<void> {
  if (isSafari()) {
    showAttachNotification(t('folderAsProject_attachFailed'));
    return;
  }

  const files = await listFilesForFolder(folderId);
  if (files.length === 0) return;

  // Look for the Gemini file-upload button / attachment trigger
  const attachBtn = document.querySelector<HTMLElement>(
    '[data-test-id*="attachment"], [data-test-id*="upload"], [aria-label*="attach"], [aria-label*="upload"]',
  );

  if (!attachBtn) {
    showAttachNotification(t('folderAsProject_attachFailed'));
    return;
  }

  // Build a DataTransfer with reconstructed File objects
  const dt = new DataTransfer();
  for (const sf of files) {
    const blob = new Blob([sf.data], { type: sf.mimeType });
    const file = new File([blob], sf.name, { type: sf.mimeType });
    dt.items.add(file);
  }

  // Dispatch a drop event on the attachment button's parent area
  const dropTarget = attachBtn.closest('form') ?? attachBtn.parentElement ?? document.body;
  const dropEvent = new DragEvent('drop', {
    bubbles: true,
    cancelable: true,
    dataTransfer: dt,
  });

  let attached = false;
  try {
    attached = dropTarget.dispatchEvent(dropEvent);
  } catch {
    // Ignore dispatch errors
  }

  if (attached) {
    showAttachNotification(
      t('folderAsProject_filesAttached').replace('{n}', String(files.length)),
    );
  } else {
    showAttachNotification(t('folderAsProject_attachFailed'));
  }

  void expectedCount; // suppress lint warning
}

/**
 * Show a short-lived notification above the picker.
 *
 * @param message - Text to display in the notification
 */
function showAttachNotification(message: string): void {
  document.querySelector('.gv-fp-attach-notification')?.remove();
  const note = document.createElement('div');
  note.className = 'gv-fp-banner gv-fp-attach-notification';
  note.textContent = message;
  pickerContainer?.parentElement?.insertBefore(note, pickerContainer);
  setTimeout(() => note.remove(), 5000);
}

function buildFolderPicker(manager: FolderManager): {
  element: HTMLElement;
  cleanup: () => void;
} {
  const container = document.createElement('div');
  container.className = 'gv-fp-picker-container';

  const chip = document.createElement('button');
  chip.className = 'gv-fp-chip';
  chip.type = 'button';
  chip.setAttribute('aria-haspopup', 'listbox');
  chip.setAttribute('aria-expanded', 'false');
  chip.textContent = t('folderAsProject_selectFolder');

  const dropdown = document.createElement('div');
  dropdown.className = 'gv-fp-dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.hidden = true;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    if (!isOpen) {
      populateDropdown(dropdown, manager, chip);
    }
    dropdown.hidden = isOpen;
    chip.setAttribute('aria-expanded', String(!isOpen));
  });

  const closeOnOutsideClick = (e: MouseEvent) => {
    if (!container.contains(e.target as Node)) {
      dropdown.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
    }
  };
  document.addEventListener('click', closeOnOutsideClick);

  container.appendChild(chip);
  container.appendChild(dropdown);
  return {
    element: container,
    cleanup: () => document.removeEventListener('click', closeOnOutsideClick),
  };
}

// ============================================================================
// Picker lifecycle
// ============================================================================

function removePicker(): void {
  pickerCleanup?.();
  pickerCleanup = null;
  pickerContainer?.remove();
  pickerContainer = null;
}

async function injectPicker(manager: FolderManager): Promise<void> {
  if (pickerContainer) return; // Already present

  const richTextarea = await waitForElement('rich-textarea', 8000);
  if (!richTextarea) return;

  // Guard: if we navigated away while waiting, abort
  if (!isNewChatPath(window.location.pathname)) return;
  // Guard: don't inject twice
  if (document.querySelector('.gv-fp-picker-container')) return;

  const { element, cleanup } = buildFolderPicker(manager);
  const parent = richTextarea.parentElement;
  if (parent) {
    parent.insertBefore(element, richTextarea);
    pickerContainer = element;
    pickerCleanup = cleanup;
  }
}

// ============================================================================
// Conversation title
// ============================================================================

function getConversationTitle(convId: string): string {
  const escapedId = convId.replace(/"/g, '\\"');
  const link = document.querySelector<HTMLAnchorElement>(
    `[data-test-id="conversation"][jslog*="c_${escapedId}"] a, a[href*="/app/${escapedId}"]`,
  );
  return link?.textContent?.trim() || document.title || 'New Chat';
}

// ============================================================================
// URL change handler
// ============================================================================

function handleNavigation(
  manager: FolderManager,
  prevPath: string,
  newPath: string,
): void {
  const prevWasNewChat = isNewChatPath(prevPath);
  const newConvId = extractConvId(newPath);

  // User sent their first message: new-chat → conversation
  if (prevWasNewChat && newConvId && selectedFolderId) {
    const title = getConversationTitle(newConvId);
    manager.addConversationToFolderFromNative(
      selectedFolderId,
      newConvId,
      title,
      window.location.href,
    );
    selectedFolderId = null;
  }

  if (isNewChatPath(newPath)) {
    // Navigated to a new chat page — (re)show picker
    selectedFolderId = null;
    removePicker();
    void injectPicker(manager);
  } else {
    // Left the new-chat page — hide picker
    removePicker();
  }
}

// ============================================================================
// URL watcher
// ============================================================================

function startURLWatcher(manager: FolderManager): void {
  lastHref = window.location.href;

  const checkUrl = () => {
    const current = window.location.href;
    if (current === lastHref) return;
    const prevPath = new URL(lastHref).pathname;
    const newPath = new URL(current).pathname;
    lastHref = current;
    handleNavigation(manager, prevPath, newPath);
  };

  const pollInterval = setInterval(checkUrl, 500);
  window.addEventListener('popstate', checkUrl);
  window.addEventListener('hashchange', checkUrl);

  // Also check on initial load
  if (isNewChatPath(window.location.pathname)) {
    void injectPicker(manager);
  }

  // No cleanup needed — URL watcher runs for the lifetime of the content script.
  // The setInterval is deliberately kept running to support SPA navigation.
  void pollInterval; // suppress lint warning
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
    { [StorageKeys.FOLDER_PROJECT_ENABLED]: false },
    (res) => {
      if (res?.[StorageKeys.FOLDER_PROJECT_ENABLED] !== true) return;
      if (featureInitialized) return;
      featureInitialized = true;
      startURLWatcher(manager);
    },
  );

  // React to toggle changes without a page reload
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'sync') return;
    if (!(StorageKeys.FOLDER_PROJECT_ENABLED in changes)) return;
    const enabled = changes[StorageKeys.FOLDER_PROJECT_ENABLED].newValue === true;
    if (enabled && !featureInitialized) {
      featureInitialized = true;
      startURLWatcher(manager);
    } else if (!enabled) {
      featureInitialized = false;
      removePicker();
      selectedFolderId = null;
    }
  });
}
