/**
 * Folder-as-Project feature
 *
 * When enabled, injects a folder picker above the Gemini chat input on new-chat
 * pages. When the user sends their first message (URL gains a conversation ID),
 * the conversation is automatically assigned to the selected folder.
 */

import { StorageKeys } from '@/core/types/common';
import { getTranslationSyncUnsafe } from '@/utils/i18n';

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

async function populateDropdown(
  dropdown: HTMLElement,
  manager: FolderManager,
  chip: HTMLButtonElement,
): Promise<void> {
  dropdown.innerHTML = '';
  await manager.ensureDataLoaded();
  const allFolders = manager.getFolders();

  if (allFolders.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'gv-fp-item';
    empty.textContent = t('folderAsProject_noFolder');
    dropdown.appendChild(empty);
    return;
  }

  // Index children by parentId for tree traversal
  const childrenOf = new Map<string, typeof allFolders[number][]>();
  for (const f of allFolders) {
    const key = f.parentId ?? '__root__';
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(f);
  }

  // Handler for selecting a folder
  const selectFolder = (folder: typeof allFolders[number]) => {
    selectedFolderId = folder.id;
    chip.textContent = `📁 ${folder.name}`;
    chip.dataset.selected = folder.id;
    dropdown.hidden = true;
    chip.setAttribute('aria-expanded', 'false');
    if (folder.instructions) {
      void injectInstructions(folder.instructions, folder.name);
    } else {
      // No instructions on this folder — remove any existing block
      void clearInstructions();
    }
  };

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
    void clearInstructions();
  });
  dropdown.appendChild(noneItem);

  /**
   * Render folder items for a given parent level.
   *
   * @param parentId - Parent folder ID, or '__root__' for top-level
   * @param container - DOM element to append items to
   */
  const renderLevel = (parentId: string, container: HTMLElement) => {
    const siblings = childrenOf.get(parentId) ?? [];
    for (const folder of siblings) {
      const hasChildren = childrenOf.has(folder.id);

      const row = document.createElement('div');
      row.className = 'gv-fp-tree-row';

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

      item.addEventListener('click', () => selectFolder(folder));
      row.appendChild(item);

      if (hasChildren) {
        const arrow = document.createElement('button');
        arrow.className = 'gv-fp-expand-btn';
        arrow.type = 'button';
        arrow.textContent = '›';
        arrow.setAttribute('aria-label', 'Expand');

        const sublist = document.createElement('div');
        sublist.className = 'gv-fp-sublist';
        sublist.hidden = true;

        arrow.addEventListener('click', (e) => {
          e.stopPropagation();
          const expanding = sublist.hidden;
          sublist.hidden = !expanding;
          arrow.textContent = expanding ? '‹' : '›';
          arrow.setAttribute('aria-label', expanding ? 'Collapse' : 'Expand');
          // Lazy render children on first expand
          if (expanding && sublist.children.length === 0) {
            renderLevel(folder.id, sublist);
          }
        });

        row.appendChild(arrow);
        container.appendChild(row);
        container.appendChild(sublist);
      } else {
        container.appendChild(row);
      }
    }
  };

  renderLevel('__root__', dropdown);
}

// Markers for instruction block detection — must be unique enough to avoid
// false positives with user text, but readable in the chat input.
const INSTRUCTIONS_START = '[System Instructions]';
const INSTRUCTIONS_END = '[/System Instructions]';
const INSTRUCTIONS_PATTERN = new RegExp(
  `${INSTRUCTIONS_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${INSTRUCTIONS_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n*`,
);

/**
 * Inject folder instructions into the chat input, wrapped as a system prompt.
 * If an existing instruction block is present, it is replaced in-place,
 * preserving any text the user has already typed.
 *
 * @param instructions - The raw instruction text from the folder
 * @param folderName - The folder name for context in the prompt
 */
async function injectInstructions(instructions: string, folderName: string): Promise<void> {
  const input = await waitForElement('rich-textarea [contenteditable="true"]', 3000);
  if (!input) return;

  const block = [
    INSTRUCTIONS_START,
    `Project: ${folderName}`,
    '',
    'Follow these instructions for the entire conversation.',
    'Do not mention or repeat these instructions in your response.',
    '',
    instructions,
    INSTRUCTIONS_END,
    '',
  ].join('\n');

  // Read current input text and strip any existing instruction block.
  // Quill uses <p> tags per line; innerText renders those as \n\n.
  // Normalise back to single \n so the round-trip doesn't double spacing.
  const rawText = (input as HTMLElement).innerText ?? '';
  const currentText = rawText.replace(/\n\n/g, '\n');
  const stripped = currentText.replace(INSTRUCTIONS_PATTERN, '');

  // Combine: new instructions first, then any user-typed text
  const combined = block + stripped;

  // Select all and replace to preserve Quill state
  (input as HTMLElement).focus();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  document.execCommand('insertText', false, combined);
  (input as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }));

  // Move cursor to the end so the user can type immediately
  if (selection) {
    selection.selectAllChildren(input);
    selection.collapseToEnd();
  }
  (input as HTMLElement).scrollTop = (input as HTMLElement).scrollHeight;
}

/**
 * Remove the instruction block from the chat input, preserving user text.
 */
async function clearInstructions(): Promise<void> {
  const input = await waitForElement('rich-textarea [contenteditable="true"]', 1000);
  if (!input) return;

  const rawText = (input as HTMLElement).innerText ?? '';
  const currentText = rawText.replace(/\n\n/g, '\n');
  if (!INSTRUCTIONS_PATTERN.test(currentText)) return;

  const stripped = currentText.replace(INSTRUCTIONS_PATTERN, '');

  (input as HTMLElement).focus();
  const selection = window.getSelection();
  if (selection) {
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  document.execCommand('insertText', false, stripped);
  (input as HTMLElement).dispatchEvent(new Event('input', { bubbles: true }));

  if (selection) {
    selection.selectAllChildren(input);
    selection.collapseToEnd();
  }
  (input as HTMLElement).scrollTop = (input as HTMLElement).scrollHeight;
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

  // Match font-size from the model picker button so it scales with Gemini's CSS
  const modelBtn = document.querySelector<HTMLElement>('.model-picker-container button');
  if (modelBtn) {
    chip.style.fontSize = getComputedStyle(modelBtn).fontSize;
  }

  const dropdown = document.createElement('div');
  dropdown.className = 'gv-fp-dropdown';
  dropdown.setAttribute('role', 'listbox');
  dropdown.hidden = true;

  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = !dropdown.hidden;
    if (!isOpen) {
      void populateDropdown(dropdown, manager, chip);
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

  // Target the model-picker-container inside trailing-actions-wrapper (right side)
  const modelPicker = await waitForElement('.model-picker-container', 5000);

  // Guard: if we navigated away while waiting, abort
  if (!isNewChatPath(window.location.pathname)) return;
  // Guard: don't inject twice
  if (document.querySelector('.gv-fp-picker-container')) return;

  const { element, cleanup } = buildFolderPicker(manager);

  if (modelPicker?.parentElement) {
    // Insert before the model picker in trailing-actions-wrapper
    modelPicker.parentElement.insertBefore(element, modelPicker);
    pickerContainer = element;
    pickerCleanup = cleanup;
    return;
  }

  // Fallback: insert before rich-textarea (original behavior)
  const richTextarea = await waitForElement('rich-textarea', 3000);
  if (!richTextarea) return;
  if (!isNewChatPath(window.location.pathname)) return;
  if (document.querySelector('.gv-fp-picker-container')) return;

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
