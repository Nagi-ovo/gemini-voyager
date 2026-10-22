import { createFolderIcon } from '@/core/icons/folderIcons';
import type { Folder } from '@/core/types/folder';
import { getTranslationSyncUnsafe } from '@/utils/i18n';

import { getFolderColor, isDarkMode } from '../folder/folderColors';
import { newChatFolderIsFor, pendingNewChatFolder, takeNewChatFolder } from './pendingFolder';

interface FolderProjectPickerOptions {
  loadFolders: () => Promise<readonly Folder[]>;
  /** The folders already loaded, read without loading again (a load may announce itself). */
  loadedFolders?: () => readonly Folder[];
  /** Whose folders the picker lists now; a handoff from another account is not taken. */
  currentAccount?: () => string | null;
  canMount: () => boolean;
  onSelect: (folder: Folder | null, source: 'user' | 'pending') => void;
}

function t(key: string): string {
  return getTranslationSyncUnsafe(key);
}

/** Shows the selected folder on the chip: a line folder icon and its name. */
function showSelectedFolder(chip: HTMLButtonElement, folder: Folder): void {
  const icon = createFolderIcon(16);
  icon.classList.add('gv-fp-chip-icon');
  const label = document.createElement('span');
  label.className = 'gv-fp-chip-label';
  label.textContent = folder.name;
  chip.replaceChildren(icon, label);
  chip.dataset.selected = folder.id;
}

/**
 * Waits for an element matching the selector to appear and have nonzero height.
 *
 * @param selector - CSS selector to query
 * @param timeoutMs - Maximum wait time in milliseconds
 * @returns Matched element, or null on timeout
 */
function waitForElement(selector: string, timeoutMs: number): Promise<HTMLElement | null> {
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

export function createFolderProjectPicker(options: FolderProjectPickerOptions): {
  show: () => Promise<void>;
  remove: () => void;
  /** Takes the folder this tab's "New chat in this folder" handed off, on the picker shown or one it shows. */
  applyPending: () => Promise<void>;
  /** Tries a handoff the mounted picker could not take yet again, on the loaded folders; mounts nothing. */
  retryPending: () => Promise<void>;
  /** Shows no folder chosen again, as after another account took the page. */
  resetChoice: () => void;
} {
  let pickerContainer: HTMLElement | null = null;
  let pickerCleanup: (() => void) | null = null;
  let pickerChip: HTMLButtonElement | null = null;

  async function populateDropdown(dropdown: HTMLElement, chip: HTMLButtonElement): Promise<void> {
    dropdown.innerHTML = '';
    const allFolders = await options.loadFolders();
    // A handoff the first mount could not take (its folders had not loaded) takes them now.
    const pendingId = pendingFolderForThisAccount();
    const pending = pendingId ? allFolders.find((folder) => folder.id === pendingId) : undefined;
    if (pending && takeNewChatFolder(pending.id)) {
      options.onSelect(pending, 'pending');
      showSelectedFolder(chip, pending);
    }

    if (allFolders.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'gv-fp-item';
      empty.textContent = t('folderAsProject_noFolder');
      dropdown.appendChild(empty);
      return;
    }

    // Index children by parentId for tree traversal
    const childrenOf = new Map<string, (typeof allFolders)[number][]>();
    for (const f of allFolders) {
      const key = f.parentId ?? '__root__';
      if (!childrenOf.has(key)) childrenOf.set(key, []);
      childrenOf.get(key)!.push(f);
    }

    // Handler for selecting a folder
    const selectFolder = (folder: (typeof allFolders)[number]) => {
      showSelectedFolder(chip, folder);
      dropdown.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
      options.onSelect(folder, 'user');
    };

    // "No folder" / clear selection option
    const noneItem = document.createElement('button');
    noneItem.className = 'gv-fp-item';
    noneItem.type = 'button';
    noneItem.setAttribute('role', 'option');
    noneItem.textContent = t('folderAsProject_noFolder');
    noneItem.addEventListener('click', () => {
      chip.textContent = t('folderAsProject_selectFolder');
      chip.removeAttribute('data-selected');
      dropdown.hidden = true;
      chip.setAttribute('aria-expanded', 'false');
      options.onSelect(null, 'user');
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
          arrow.setAttribute('aria-label', t('folderAsProject_expand'));
          arrow.setAttribute('aria-expanded', 'false');
          arrow.innerHTML =
            '<svg class="gv-fp-expand-icon" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d="M504-480 320-664l56-56 240 240-240 240-56-56 184-184Z"/></svg>';

          const sublist = document.createElement('div');
          sublist.className = 'gv-fp-sublist';
          sublist.hidden = true;

          arrow.addEventListener('click', (e) => {
            e.stopPropagation();
            const expanding = sublist.hidden;
            sublist.hidden = !expanding;
            arrow.classList.toggle('gv-fp-expand-btn--open', expanding);
            arrow.setAttribute('aria-expanded', String(expanding));
            arrow.setAttribute(
              'aria-label',
              expanding ? t('folderAsProject_collapse') : t('folderAsProject_expand'),
            );
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

  function buildFolderPicker(): {
    element: HTMLElement;
    chip: HTMLButtonElement;
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
        void populateDropdown(dropdown, chip);
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
      chip,
      cleanup: () => document.removeEventListener('click', closeOnOutsideClick),
    };
  }

  // ============================================================================
  // Pending folder selection (from "New chat in folder" menu)
  // ============================================================================

  /**
   * Selects the folder this tab's "New chat in this folder" handed off
   * (`pendingFolder.ts`). The handoff is taken only once the folder is among
   * the ones this page can file into; until then it stays for the next try.
   */
  function pendingFolderForThisAccount(): string | null {
    const pendingId = pendingNewChatFolder();
    if (!pendingId) return null;
    return !options.currentAccount || newChatFolderIsFor(options.currentAccount())
      ? pendingId
      : null;
  }

  async function applyPendingFolderSelection(
    chip: HTMLButtonElement,
    folders: () => Promise<readonly Folder[]> | readonly Folder[] = options.loadFolders,
  ): Promise<void> {
    const pendingId = pendingFolderForThisAccount();
    if (!pendingId) return;
    const folder = (await folders()).find((f) => f.id === pendingId);
    if (!folder || !takeNewChatFolder(pendingId)) return;

    options.onSelect(folder, 'pending');

    showSelectedFolder(chip, folder);
  }

  // ============================================================================
  // Picker lifecycle
  // ============================================================================

  function remove(): void {
    pickerCleanup?.();
    pickerCleanup = null;
    pickerContainer?.remove();
    pickerContainer = null;
    pickerChip = null;
  }

  async function show(): Promise<void> {
    if (pickerContainer) return; // Already present

    // Target the model-picker-container inside trailing-actions-wrapper (right side)
    const modelPicker = await waitForElement('.model-picker-container', 5000);

    // Guard: feature toggled off while we were waiting (slow page load) — the
    // disable path already ran remove(), so injecting now would leave a
    // picker and its document listener behind with nothing to clean them up.
    // Guard: if we navigated away while waiting, abort
    if (!options.canMount()) return;
    // Guard: don't inject twice
    if (document.querySelector('.gv-fp-picker-container')) return;

    const { element, cleanup, chip } = buildFolderPicker();

    if (modelPicker?.parentElement) {
      // Insert before the model picker in trailing-actions-wrapper
      modelPicker.parentElement.insertBefore(element, modelPicker);
      pickerContainer = element;
      pickerCleanup = cleanup;
      pickerChip = chip;
      void applyPendingFolderSelection(chip);
      return;
    }

    // Fallback: insert before rich-textarea (original behavior). The picker (and
    // its document-level outside-click listener) is already built — every abort
    // below must run its cleanup or the listener leaks.
    const richTextarea = await waitForElement('rich-textarea', 3000);
    if (!richTextarea || !options.canMount() || document.querySelector('.gv-fp-picker-container')) {
      cleanup();
      return;
    }

    const parent = richTextarea.parentElement;
    if (!parent) {
      cleanup();
      return;
    }

    parent.insertBefore(element, richTextarea);
    pickerContainer = element;
    pickerCleanup = cleanup;
    pickerChip = chip;
    void applyPendingFolderSelection(chip);
  }

  async function retryPending(): Promise<void> {
    if (!pickerChip || !pickerContainer?.isConnected) return;
    // Called when the folders finished loading: loading again here would announce another load.
    await applyPendingFolderSelection(pickerChip, options.loadedFolders ?? options.loadFolders);
  }

  function resetChoice(): void {
    if (!pickerChip) return;
    pickerChip.textContent = t('folderAsProject_selectFolder');
    pickerChip.removeAttribute('data-selected');
  }

  async function applyPending(): Promise<void> {
    if (pickerChip && pickerContainer?.isConnected) await applyPendingFolderSelection(pickerChip);
    else await show();
  }

  return { show, remove, applyPending, retryPending, resetChoice };
}
