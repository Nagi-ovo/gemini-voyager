import browser from 'webextension-polyfill';

import {
  getGemIcon,
  DEFAULT_GEM_ICON,
  DEFAULT_CONVERSATION_ICON,
} from './gemConfig';
import type { Folder, FolderData, ConversationReference, DragData } from './types';

const STORAGE_KEY = 'gvFolderData';
const IS_DEBUG = false; // Set to true to enable debug logging

export class FolderManager {
  private debug(...args: any[]): void {
    if (IS_DEBUG) {
      console.log('[FolderManager]', ...args);
    }
  }

  private debugWarn(...args: any[]): void {
    if (IS_DEBUG) {
      console.warn('[FolderManager]', ...args);
    }
  }
  private data: FolderData = { folders: [], folderContents: {} };
  private containerElement: HTMLElement | null = null;
  private sidebarContainer: HTMLElement | null = null;
  private recentSection: HTMLElement | null = null;
  private tooltipElement: HTMLElement | null = null;
  private tooltipTimeout: number | null = null;

  constructor() {
    this.loadData();
    this.createTooltip();
  }

  async init(): Promise<void> {
    try {
      // Wait for sidebar to be available
      await this.waitForSidebar();

      // Find the Recent section
      this.findRecentSection();

      if (!this.recentSection) {
        this.debugWarn('Could not find Recent section');
        return;
      }

      // Create and inject folder UI
      this.createFolderUI();

      // Make conversations draggable
      this.makeConversationsDraggable();

      // Set up mutation observer to handle dynamically added conversations
      this.setupMutationObserver();

      this.debug('Initialized successfully');
    } catch (error) {
      console.error('[FolderManager] Initialization error:', error);
    }
  }

  private async waitForSidebar(): Promise<void> {
    return new Promise((resolve) => {
      const checkSidebar = () => {
        // Look for the overflow-container which holds the sidebar content
        const container = document.querySelector('[data-test-id="overflow-container"]');
        if (container) {
          this.sidebarContainer = container as HTMLElement;
          resolve();
        } else {
          setTimeout(checkSidebar, 500);
        }
      };
      checkSidebar();
    });
  }

  private findRecentSection(): void {
    if (!this.sidebarContainer) return;

    // Find conversations-list (Recent section) by looking for the conversations container
    // Try multiple selectors to find the Recent section
    let conversationsList = this.sidebarContainer.querySelector('[data-test-id="all-conversations"]');

    if (!conversationsList) {
      // Fallback: find by class name
      conversationsList = this.sidebarContainer.querySelector('.chat-history');
    }

    if (!conversationsList) {
      // Fallback: find the element that contains conversation items
      const conversationItems = this.sidebarContainer.querySelectorAll('[data-test-id="conversation"]');
      if (conversationItems.length > 0) {
        // Find the parent that contains these conversations
        conversationsList = conversationItems[0].closest('.chat-history, [class*="conversation"]');
      }
    }

    if (conversationsList) {
      this.recentSection = conversationsList as HTMLElement;
    } else {
      this.debugWarn('Could not find Recent section - will retry');
      // Retry after a delay
      setTimeout(() => {
        this.findRecentSection();
        if (this.recentSection && !this.containerElement) {
          this.createFolderUI();
          this.makeConversationsDraggable();
          this.setupMutationObserver();
        }
      }, 2000);
    }
  }

  private createFolderUI(): void {
    if (!this.recentSection) return;

    // Create folder container
    this.containerElement = document.createElement('div');
    this.containerElement.className = 'gv-folder-container';

    // Create header
    const header = this.createHeader();
    this.containerElement.appendChild(header);

    // Create folders list
    const foldersList = this.createFoldersList();
    this.containerElement.appendChild(foldersList);

    // Insert before Recent section
    this.recentSection.parentElement?.insertBefore(this.containerElement, this.recentSection);
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'gv-folder-header';

    // Match the style of Recent section title
    const titleContainer = document.createElement('div');
    titleContainer.className = 'title-container';

    const title = document.createElement('h1');
    title.className = 'title gds-label-l'; // Match Recent section style
    title.textContent = this.t('folder_title');
    title.style.visibility = 'visible';

    titleContainer.appendChild(title);

    const addButton = document.createElement('button');
    addButton.className = 'gv-folder-add-btn';
    addButton.innerHTML = `<mat-icon role="img" class="mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">add</mat-icon>`;
    addButton.title = this.t('folder_create');
    addButton.addEventListener('click', () => this.createFolder());

    header.appendChild(titleContainer);
    header.appendChild(addButton);

    return header;
  }

  private createFoldersList(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'gv-folder-list';

    // Render root level folders
    const rootFolders = this.data.folders.filter((f) => f.parentId === null);
    rootFolders.forEach((folder) => {
      const folderElement = this.createFolderElement(folder);
      list.appendChild(folderElement);
    });

    return list;
  }

  private createFolderElement(folder: Folder, level = 0): HTMLElement {
    const folderEl = document.createElement('div');
    folderEl.className = 'gv-folder-item';
    folderEl.dataset.folderId = folder.id;
    folderEl.dataset.level = level.toString();

    // Folder header
    const folderHeader = document.createElement('div');
    folderHeader.className = 'gv-folder-item-header';
    folderHeader.style.paddingLeft = `${level * 16 + 8}px`;

    // Expand/collapse button
    const expandBtn = document.createElement('button');
    expandBtn.className = 'gv-folder-expand-btn';
    expandBtn.innerHTML = folder.isExpanded
      ? '<span class="google-symbols">expand_more</span>'
      : '<span class="google-symbols">chevron_right</span>';
    expandBtn.addEventListener('click', () => this.toggleFolder(folder.id));

    // Folder icon
    const folderIcon = document.createElement('span');
    folderIcon.className = 'gv-folder-icon google-symbols';
    folderIcon.textContent = 'folder';

    // Folder name
    const folderName = document.createElement('span');
    folderName.className = 'gv-folder-name gds-label-l';
    folderName.textContent = folder.name;
    folderName.addEventListener('dblclick', () => this.renameFolder(folder.id));

    // Add tooltip event listeners
    folderName.addEventListener('mouseenter', () =>
      this.showTooltip(folderName, folder.name),
    );
    folderName.addEventListener('mouseleave', () => this.hideTooltip());

    // Actions menu
    const actionsBtn = document.createElement('button');
    actionsBtn.className = 'gv-folder-actions-btn';
    actionsBtn.innerHTML = '<span class="google-symbols">more_vert</span>';
    actionsBtn.addEventListener('click', (e) => this.showFolderMenu(e, folder.id));

    folderHeader.appendChild(expandBtn);
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(folderName);
    folderHeader.appendChild(actionsBtn);

    // Setup drop zone for conversations
    this.setupDropZone(folderHeader, folder.id);

    folderEl.appendChild(folderHeader);

    // Folder content (conversations and subfolders)
    if (folder.isExpanded) {
      const content = document.createElement('div');
      content.className = 'gv-folder-content';

      // Render conversations in this folder
      const conversations = this.data.folderContents[folder.id] || [];
      conversations.forEach((conv) => {
        const convEl = this.createConversationElement(conv, folder.id, level + 1);
        content.appendChild(convEl);
      });

      // Render subfolders
      const subfolders = this.data.folders.filter((f) => f.parentId === folder.id);
      subfolders.forEach((subfolder) => {
        const subfolderEl = this.createFolderElement(subfolder, level + 1);
        content.appendChild(subfolderEl);
      });

      folderEl.appendChild(content);
    }

    return folderEl;
  }

  private createConversationElement(
    conv: ConversationReference,
    folderId: string,
    level: number
  ): HTMLElement {
    const convEl = document.createElement('div');
    convEl.className = 'gv-folder-conversation';
    convEl.dataset.conversationId = conv.conversationId;
    convEl.dataset.folderId = folderId;
    // Increase indentation for conversations under folders
    convEl.style.paddingLeft = `${level * 16 + 24}px`; // More indentation for tree structure

    // Make conversation draggable within folders
    convEl.draggable = true;
    convEl.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      const dragData = {
        conversationId: conv.conversationId,
        title: conv.title,
        url: conv.url,
        isGem: conv.isGem,
        gemId: conv.gemId,
        sourceFolderId: folderId, // Track where it's being dragged from
      };
      e.dataTransfer!.setData('application/json', JSON.stringify(dragData));
      convEl.style.opacity = '0.5';
    });

    convEl.addEventListener('dragend', () => {
      convEl.style.opacity = '1';
    });

    // Conversation icon - use Gem-specific icons
    const icon = document.createElement('mat-icon');
    icon.className = 'mat-icon notranslate gv-conversation-icon google-symbols mat-ligature-font mat-icon-no-color';
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-hidden', 'true');

    // Set icon based on conversation type
    let iconName = DEFAULT_CONVERSATION_ICON;
    if (conv.isGem && conv.gemId) {
      iconName = getGemIcon(conv.gemId);
    }
    icon.setAttribute('fonticon', iconName);
    icon.textContent = iconName;

    // Conversation title
    const title = document.createElement('span');
    title.className = 'gv-conversation-title gds-label-l';
    title.textContent = conv.title;

    // Add tooltip event listeners
    title.addEventListener('mouseenter', () => this.showTooltip(title, conv.title));
    title.addEventListener('mouseleave', () => this.hideTooltip());

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'gv-conversation-remove-btn';
    removeBtn.innerHTML = '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">close</mat-icon>';
    removeBtn.title = this.t('folder_remove_conversation');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmRemoveConversation(folderId, conv.conversationId, conv.title, e);
    });

    // Click to navigate - use SPA-style navigation like original conversations
    convEl.addEventListener('click', () => {
      // Don't capture conv object in closure - look up latest data
      this.navigateToConversationById(folderId, conv.conversationId);
    });

    // Double-click to rename
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.renameConversation(folderId, conv.conversationId, title);
    });

    convEl.appendChild(icon);
    convEl.appendChild(title);
    convEl.appendChild(removeBtn);

    return convEl;
  }

  private setupDropZone(element: HTMLElement, folderId: string): void {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      element.classList.add('gv-folder-dragover');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('gv-folder-dragover');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      element.classList.remove('gv-folder-dragover');

      const data = e.dataTransfer?.getData('application/json');
      if (!data) return;

      try {
        const dragData: DragData = JSON.parse(data);
        this.addConversationToFolder(folderId, dragData);
      } catch (error) {
        console.error('[FolderManager] Drop error:', error);
      }
    });
  }

  private makeConversationsDraggable(): void {
    if (!this.sidebarContainer) return;

    const conversations = this.sidebarContainer.querySelectorAll('[data-test-id="conversation"]');
    conversations.forEach((conv) => this.makeConversationDraggable(conv as HTMLElement));
  }

  private makeConversationDraggable(element: HTMLElement): void {
    element.draggable = true;
    element.style.cursor = 'grab';

    element.addEventListener('dragstart', (e) => {
      const title = element.querySelector('.conversation-title')?.textContent?.trim() || 'Untitled';
      const conversationId = this.extractConversationId(element);

      // Extract URL and conversation metadata together
      const conversationData = this.extractConversationData(element);

      this.debug('Drag start:', {
        title,
        isGem: conversationData.isGem,
        gemId: conversationData.gemId,
        url: conversationData.url
      });

      const dragData: DragData = {
        conversationId,
        title,
        url: conversationData.url,
        isGem: conversationData.isGem,
        gemId: conversationData.gemId,
      };

      e.dataTransfer?.setData('application/json', JSON.stringify(dragData));
      element.style.opacity = '0.5';
    });

    element.addEventListener('dragend', () => {
      element.style.opacity = '1';
    });
  }

  private extractConversationId(element: HTMLElement): string {
    // Extract from jslog attribute which contains the conversation ID
    const jslog = element.getAttribute('jslog');
    if (jslog) {
      // Match conversation ID - it appears in quotes like ["c_3456c77162722c1a",...]
      // Also try without quotes in case format changes
      const match = jslog.match(/[",\[]c_([a-f0-9]+)[",\]]/);
      if (match) {
        const conversationId = `c_${match[1]}`;
        this.debug('Extracted conversation ID:', conversationId, 'from jslog:', jslog);
        return conversationId;
      }
      // Fallback: try matching without surrounding characters
      const simpleMatch = jslog.match(/c_[a-f0-9]+/);
      if (simpleMatch) {
        this.debug('Extracted conversation ID (simple):', simpleMatch[0]);
        return simpleMatch[0];
      }
    }

    // Fallback: generate unique ID from element attributes
    // Use multiple attributes to ensure uniqueness
    const title = element.querySelector('.conversation-title')?.textContent?.trim() || '';
    const index = Array.from(element.parentElement?.children || []).indexOf(element);

    // Generate unique ID combining title, index, random, and timestamp
    const uniqueString = `${title}_${index}_${Math.random()}_${Date.now()}`;
    const fallbackId = `conv_${this.hashString(uniqueString)}`;
    this.debugWarn('Could not extract ID from jslog, using fallback:', fallbackId);
    return fallbackId;
  }

  private extractConversationData(element: HTMLElement): { url: string; isGem: boolean; gemId?: string } {
    // Extract conversation ID from jslog
    const jslog = element.getAttribute('jslog');
    if (!jslog) {
      return { url: window.location.href, isGem: false };
    }

    // Match conversation ID from jslog - extract just the hex part without c_ prefix
    const match = jslog.match(/[",\[]c_([a-f0-9]+)[",\]]/);
    if (!match) {
      return { url: window.location.href, isGem: false };
    }

    const hexId = match[1]; // Just the hex part, e.g., "9bf19194f9afaf90"
    this.debug('Extracted hex ID:', hexId);

    const currentPath = window.location.pathname;

    // Preserve user account number (e.g., /u/1/)
    const userMatch = currentPath.match(/\/u\/(\d+)\//);

    // Build URL with user context preserved
    let url = window.location.origin;
    if (userMatch) {
      url += `/u/${userMatch[1]}`;
    }

    // Always use /app/{id} URL
    // Gemini will auto-redirect to /gem/{gem-id}/{id} if it's a Gem conversation
    // We'll detect and update the gemId after navigation completes
    url += `/app/${hexId}`;

    // Also preserve URL parameters
    const currentUrl = new URL(window.location.href);
    const searchParams = currentUrl.searchParams.toString();
    if (searchParams) {
      url += `?${searchParams}`;
    }

    this.debug('Built URL:', url);
    // Don't try to detect if it's a Gem at drag time - just store the /app/ URL
    // After first navigation, we'll detect and update to the correct /gem/ URL
    return { url, isGem: false, gemId: undefined };
  }

  private setupMutationObserver(): void {
    if (!this.sidebarContainer) return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const conversations = node.querySelectorAll('[data-test-id="conversation"]');
            conversations.forEach((conv) => this.makeConversationDraggable(conv as HTMLElement));
          }
        });
      });
    });

    observer.observe(this.sidebarContainer, {
      childList: true,
      subtree: true,
    });
  }

  private createFolder(parentId: string | null = null): void {
    // Create inline input for folder name
    const inputContainer = document.createElement('div');
    inputContainer.className = 'gv-folder-inline-input';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gv-folder-name-input';
    input.placeholder = this.t('folder_name_prompt');
    input.maxLength = 50;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'gv-folder-inline-btn gv-folder-inline-save';
    saveBtn.innerHTML = '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">check</mat-icon>';
    saveBtn.title = this.t('pm_save');

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-folder-inline-btn gv-folder-inline-cancel';
    cancelBtn.innerHTML = '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">close</mat-icon>';
    cancelBtn.title = this.t('pm_cancel');

    inputContainer.appendChild(input);
    inputContainer.appendChild(saveBtn);
    inputContainer.appendChild(cancelBtn);

    const save = () => {
      const name = input.value.trim();
      if (!name) {
        inputContainer.remove();
        return;
      }

      const folder: Folder = {
        id: this.generateId(),
        name,
        parentId,
        isExpanded: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      this.data.folders.push(folder);
      this.data.folderContents[folder.id] = [];
      this.saveData();
      this.refresh();
    };

    const cancel = () => {
      inputContainer.remove();
    };

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') cancel();
    });

    // Insert input into the folder list
    const folderList = this.containerElement?.querySelector('.gv-folder-list');
    if (folderList) {
      if (parentId) {
        // Insert after the parent folder
        const parentFolder = folderList.querySelector(`[data-folder-id="${parentId}"]`);
        if (parentFolder) {
          const parentContent = parentFolder.querySelector('.gv-folder-content');
          if (parentContent) {
            parentContent.insertBefore(inputContainer, parentContent.firstChild);
          } else {
            parentFolder.insertAdjacentElement('afterend', inputContainer);
          }
        } else {
          folderList.appendChild(inputContainer);
        }
      } else {
        folderList.insertBefore(inputContainer, folderList.firstChild);
      }

      input.focus();
    }
  }

  private renameFolder(folderId: string): void {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    // Find the folder element
    const folderEl = this.containerElement?.querySelector(`[data-folder-id="${folderId}"]`);
    if (!folderEl) return;

    const folderNameEl = folderEl.querySelector('.gv-folder-name');
    if (!folderNameEl) return;

    // Create inline input for renaming
    const inputContainer = document.createElement('span');
    inputContainer.className = 'gv-folder-rename-inline';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gv-folder-rename-input';
    input.value = folder.name;
    input.maxLength = 50;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'gv-folder-inline-btn gv-folder-inline-save';
    saveBtn.innerHTML = '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">check</mat-icon>';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-folder-inline-btn gv-folder-inline-cancel';
    cancelBtn.innerHTML = '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">close</mat-icon>';

    inputContainer.appendChild(input);
    inputContainer.appendChild(saveBtn);
    inputContainer.appendChild(cancelBtn);

    const save = () => {
      const newName = input.value.trim();
      if (!newName) {
        restore();
        return;
      }

      folder.name = newName;
      folder.updatedAt = Date.now();
      this.saveData();
      this.refresh();
    };

    const restore = () => {
      folderNameEl.textContent = folder.name;
      inputContainer.remove();
      folderNameEl.classList.remove('gv-hidden');
    };

    const cancel = () => {
      restore();
    };

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', cancel);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') save();
      if (e.key === 'Escape') cancel();
    });

    // Hide original name and show input
    folderNameEl.classList.add('gv-hidden');
    folderNameEl.parentElement?.insertBefore(inputContainer, folderNameEl.nextSibling);
    input.focus();
    input.select();
  }

  private deleteFolder(folderId: string, event?: MouseEvent): void {
    // Create inline confirmation
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'gv-folder-confirm-dialog';
    confirmDialog.innerHTML = `
      <div class="gv-folder-confirm-message">${this.t('folder_delete_confirm')}</div>
      <div class="gv-folder-confirm-actions">
        <button class="gv-folder-confirm-btn gv-folder-confirm-yes">${this.t('pm_delete')}</button>
        <button class="gv-folder-confirm-btn gv-folder-confirm-no">${this.t('pm_cancel')}</button>
      </div>
    `;

    // Position near the folder
    const folderEl = this.containerElement?.querySelector(`[data-folder-id="${folderId}"]`);
    if (folderEl) {
      const rect = folderEl.getBoundingClientRect();
      confirmDialog.style.position = 'fixed';
      confirmDialog.style.top = `${rect.bottom + 4}px`;
      confirmDialog.style.left = `${rect.left}px`;
    }

    document.body.appendChild(confirmDialog);

    const yesBtn = confirmDialog.querySelector('.gv-folder-confirm-yes') as HTMLButtonElement;
    const noBtn = confirmDialog.querySelector('.gv-folder-confirm-no') as HTMLButtonElement;

    const cleanup = () => {
      confirmDialog.remove();
    };

    yesBtn?.addEventListener('click', () => {
      // Remove folder and all subfolders recursively
      const foldersToDelete = this.getFolderAndDescendants(folderId);
      this.data.folders = this.data.folders.filter((f) => !foldersToDelete.includes(f.id));

      // Remove folder contents
      foldersToDelete.forEach((id) => {
        delete this.data.folderContents[id];
      });

      this.saveData();
      this.refresh();
      cleanup();
    });

    noBtn?.addEventListener('click', cleanup);

    // Close on click outside
    setTimeout(() => {
      const closeOnOutside = (e: MouseEvent) => {
        if (!confirmDialog.contains(e.target as Node)) {
          cleanup();
          document.removeEventListener('click', closeOnOutside);
        }
      };
      document.addEventListener('click', closeOnOutside);
    }, 0);
  }

  private getFolderAndDescendants(folderId: string): string[] {
    const result = [folderId];
    const children = this.data.folders.filter((f) => f.parentId === folderId);
    children.forEach((child) => {
      result.push(...this.getFolderAndDescendants(child.id));
    });
    return result;
  }

  private toggleFolder(folderId: string): void {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    folder.isExpanded = !folder.isExpanded;
    folder.updatedAt = Date.now();
    this.saveData();
    this.refresh();
  }

  private addConversationToFolder(folderId: string, dragData: DragData & { sourceFolderId?: string }): void {
    this.debug('Adding conversation to folder:', {
      folderId,
      dragData,
    });

    if (!this.data.folderContents[folderId]) {
      this.data.folderContents[folderId] = [];
    }

    // Check if conversation is already in this folder
    const exists = this.data.folderContents[folderId].some(
      (c) => c.conversationId === dragData.conversationId
    );

    if (exists) {
      this.debug('Conversation already in folder:', dragData.conversationId);
      this.debug('Existing conversations:', this.data.folderContents[folderId]);
      return;
    }

    const conv: ConversationReference = {
      conversationId: dragData.conversationId,
      title: dragData.title,
      url: dragData.url,
      addedAt: Date.now(),
      isGem: dragData.isGem,
      gemId: dragData.gemId,
    };

    this.data.folderContents[folderId].push(conv);
    this.debug('Conversation added. Total in folder:', this.data.folderContents[folderId].length);

    // If this was dragged from another folder, remove it from the source
    if (dragData.sourceFolderId && dragData.sourceFolderId !== folderId) {
      this.debug('Moving from folder:', dragData.sourceFolderId);
      this.removeConversationFromFolder(dragData.sourceFolderId, dragData.conversationId);
      // Note: removeConversationFromFolder calls saveData() and refresh(), so we don't need to call them again
      return;
    }

    this.saveData();
    this.refresh();
  }

  private confirmRemoveConversation(
    folderId: string,
    conversationId: string,
    title: string,
    event: MouseEvent
  ): void {
    // Create inline confirmation dialog
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'gv-folder-confirm-dialog';
    confirmDialog.innerHTML = `
      <div class="gv-folder-confirm-message">${this.t('folder_remove_conversation_confirm').replace('{title}', title)}</div>
      <div class="gv-folder-confirm-actions">
        <button class="gv-folder-confirm-btn gv-folder-confirm-yes">${this.t('pm_delete')}</button>
        <button class="gv-folder-confirm-btn gv-folder-confirm-no">${this.t('pm_cancel')}</button>
      </div>
    `;

    // Position near the clicked element
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    confirmDialog.style.position = 'fixed';
    confirmDialog.style.top = `${rect.bottom + 4}px`;
    confirmDialog.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;

    document.body.appendChild(confirmDialog);

    const yesBtn = confirmDialog.querySelector('.gv-folder-confirm-yes') as HTMLButtonElement;
    const noBtn = confirmDialog.querySelector('.gv-folder-confirm-no') as HTMLButtonElement;

    const cleanup = () => {
      confirmDialog.remove();
    };

    yesBtn?.addEventListener('click', () => {
      this.removeConversationFromFolder(folderId, conversationId);
      cleanup();
    });

    noBtn?.addEventListener('click', cleanup);

    // Close on click outside
    setTimeout(() => {
      const closeOnOutside = (e: MouseEvent) => {
        if (!confirmDialog.contains(e.target as Node)) {
          cleanup();
          document.removeEventListener('click', closeOnOutside);
        }
      };
      document.addEventListener('click', closeOnOutside);
    }, 0);
  }

  private removeConversationFromFolder(folderId: string, conversationId: string): void {
    if (!this.data.folderContents[folderId]) return;

    this.data.folderContents[folderId] = this.data.folderContents[folderId].filter(
      (c) => c.conversationId !== conversationId
    );

    this.saveData();
    this.refresh();
  }

  private renameConversation(folderId: string, conversationId: string, titleElement: HTMLElement): void {
    // Get current title
    const conv = this.data.folderContents[folderId]?.find((c) => c.conversationId === conversationId);
    if (!conv) return;

    const currentTitle = conv.title;

    // Create inline input for renaming
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'gv-folder-name-input gv-conversation-rename-input';
    input.value = currentTitle;
    input.style.width = '100%';

    // Replace title with input
    const parent = titleElement.parentElement;
    if (!parent) return;

    titleElement.style.display = 'none';
    parent.insertBefore(input, titleElement);
    input.focus();
    input.select();

    const save = () => {
      const newTitle = input.value.trim();
      if (newTitle && newTitle !== currentTitle) {
        conv.title = newTitle;
        this.saveData();
      }
      input.remove();
      titleElement.style.display = '';
      titleElement.textContent = conv.title;
    };

    const cancel = () => {
      input.remove();
      titleElement.style.display = '';
    };

    input.addEventListener('blur', save);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        save();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    });
  }

  private showFolderMenu(event: MouseEvent, folderId: string): void {
    event.stopPropagation();

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'gv-folder-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    const menuItems = [
      { label: this.t('folder_create_subfolder'), action: () => this.createFolder(folderId) },
      { label: this.t('folder_rename'), action: () => this.renameFolder(folderId) },
      { label: this.t('folder_delete'), action: () => this.deleteFolder(folderId) },
    ];

    menuItems.forEach((item) => {
      const menuItem = document.createElement('button');
      menuItem.className = 'gv-folder-menu-item';
      menuItem.textContent = item.label;
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // Close menu on click outside
    const closeMenu = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    };
    setTimeout(() => document.addEventListener('click', closeMenu), 0);
  }

  private refresh(): void {
    if (!this.containerElement) return;

    // Find and update the folders list
    const oldList = this.containerElement.querySelector('.gv-folder-list');
    if (oldList) {
      const newList = this.createFoldersList();
      oldList.replaceWith(newList);
    }
  }

  private loadData(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.data = JSON.parse(stored);
      }
    } catch (error) {
      console.error('[FolderManager] Load data error:', error);
    }
  }

  private saveData(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      console.error('[FolderManager] Save data error:', error);
    }
  }

  private generateId(): string {
    return `folder_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private navigateToConversationById(folderId: string, conversationId: string): void {
    // Look up the latest conversation data from storage
    const conv = this.data.folderContents[folderId]?.find((c) => c.conversationId === conversationId);
    if (!conv) {
      console.error('[FolderManager] Conversation not found:', conversationId);
      return;
    }

    this.debug('Navigating to conversation:', {
      title: conv.title,
      url: conv.url,
      isGem: conv.isGem,
      gemId: conv.gemId,
    });

    this.navigateToConversation(conv.url, conv);
  }

  private navigateToConversation(url: string, conversation?: ConversationReference): void {
    // Use History API to navigate without page reload (SPA-style)
    // This mimics how Gemini's original conversation links work
    try {
      // Try to find and click the original conversation element in the sidebar
      // This is the most reliable way to trigger Gemini's navigation
      const targetUrl = new URL(url);
      const pathParts = targetUrl.pathname.split('/');
      const hexId = pathParts[pathParts.length - 1]; // Get the hex ID part

      const conversations = document.querySelectorAll('[data-test-id="conversation"]');
      for (const conv of Array.from(conversations)) {
        const jslog = conv.getAttribute('jslog');
        if (jslog && jslog.includes(hexId)) {
          // Found the matching conversation, click it
          // This will trigger SPA navigation, even if there's a brief redirect for gems
          (conv as HTMLElement).click();
          this.debug('Navigated by clicking sidebar element');

          // After navigation, check if URL changed (Gemini auto-redirected to /gem/)
          // Only check if we don't already know the gemId
          if (conversation && !conversation.gemId) {
            this.checkAndUpdateGemId(hexId);
          } else if (conversation?.gemId) {
            this.debug('Known gem conversation:', conversation.gemId);
          }
          return;
        }
      }

      // If we can't find the sidebar element, try pushState + popstate
      this.debug('Sidebar element not found, trying pushState');
      window.history.pushState({}, '', url);
      const popStateEvent = new PopStateEvent('popstate', { state: {} });
      window.dispatchEvent(popStateEvent);

      // If that doesn't work, fall back to page reload
      setTimeout(() => {
        if (window.location.pathname !== targetUrl.pathname) {
          this.debug('Falling back to page reload');
          window.location.href = url;
        }
      }, 200);
    } catch (error) {
      console.error('[FolderManager] Navigation error:', error);
      // Fallback to regular navigation
      window.location.href = url;
    }
  }

  private checkAndUpdateGemId(hexId: string): void {
    // Wait for navigation to complete and check if URL changed
    setTimeout(() => {
      const currentPath = window.location.pathname;
      this.debug('Checking URL after navigation:', currentPath);

      // If URL changed from /app/ to /gem/, update the stored gemId
      if (currentPath.includes('/gem/')) {
        const gemMatch = currentPath.match(/\/gem\/([^\/]+)/);
        if (gemMatch) {
          const gemId = gemMatch[1];
          this.debug('Detected Gem after navigation:', gemId);

          // Update all instances of this conversation in folders
          let updated = false;

          for (const folderId in this.data.folderContents) {
            const conversations = this.data.folderContents[folderId];
            for (const conv of conversations) {
              // Match by hex ID in URL
              if (conv.url.includes(hexId)) {
                const oldUrl = conv.url;
                conv.isGem = true;
                conv.gemId = gemId;
                // Update URL to use /gem/ instead of /app/
                conv.url = conv.url.replace(/\/app\/([^/?]+)/, `/gem/${gemId}/$1`);
                updated = true;
                this.debug('Updated conversation:', conv.title);
                this.debug('Old URL:', oldUrl);
                this.debug('New URL:', conv.url);
                this.debug('Gem ID:', gemId);
              }
            }
          }

          if (updated) {
            this.saveData();
            // Re-render folders to show correct icon
            this.renderAllFolders();
          }
        }
      }
    }, 500); // Wait 500ms for navigation to complete
  }

  private renderAllFolders(): void {
    if (!this.containerElement) return;

    // Find the existing folders list
    const existingList = this.containerElement.querySelector('.gv-folder-list');
    if (!existingList) return;

    // Create a new folders list
    const newList = this.createFoldersList();

    // Replace the old list with the new one
    existingList.replaceWith(newList);

    this.debug('Re-rendered all folders');
  }

  private t(key: string): string {
    try {
      // Use webextension-polyfill for cross-browser compatibility
      // This works for Chrome, Edge, Opera, Firefox, etc.
      const message = browser.i18n.getMessage(key);
      if (message && message.trim()) {
        return message;
      }
      // If message is empty or whitespace, fall through to fallback
    } catch (e) {
      this.debugWarn('i18n error for key:', key, e);
    }

    // Fallback translations if browser.i18n is not available or returns empty
    const fallback: Record<string, string> = {
      folder_title: 'Folders',
      folder_create: 'Create folder',
      folder_name_prompt: 'Enter folder name:',
      folder_rename_prompt: 'Enter new name:',
      folder_delete_confirm: 'Delete this folder and all its contents?',
      folder_create_subfolder: 'Create subfolder',
      folder_rename: 'Rename',
      folder_delete: 'Delete',
      folder_remove_conversation: 'Remove from folder',
      folder_remove_conversation_confirm: 'Remove "{title}" from this folder?',
    };
    return fallback[key] || key;
  }

  // Tooltip methods
  private createTooltip(): void {
    this.tooltipElement = document.createElement('div');
    this.tooltipElement.className = 'gv-tooltip';
    document.body.appendChild(this.tooltipElement);
  }

  private showTooltip(element: HTMLElement, text: string): void {
    if (!this.tooltipElement) return;

    // Clear any existing timeout
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
    }

    // Check if text is truncated
    const isTruncated = element.scrollWidth > element.clientWidth;
    if (!isTruncated) return;

    // Show tooltip after a short delay (200ms)
    this.tooltipTimeout = window.setTimeout(() => {
      if (!this.tooltipElement) return;

      this.tooltipElement.textContent = text;

      // Position tooltip
      const rect = element.getBoundingClientRect();
      const tooltipRect = this.tooltipElement.getBoundingClientRect();

      let left = rect.left;
      let top = rect.bottom + 8;

      // Adjust if tooltip goes off screen
      if (left + tooltipRect.width > window.innerWidth) {
        left = window.innerWidth - tooltipRect.width - 10;
      }
      if (top + tooltipRect.height > window.innerHeight) {
        top = rect.top - tooltipRect.height - 8;
      }

      this.tooltipElement.style.left = `${left}px`;
      this.tooltipElement.style.top = `${top}px`;

      // Trigger reflow for animation
      this.tooltipElement.offsetHeight;
      this.tooltipElement.classList.add('show');
    }, 200);
  }

  private hideTooltip(): void {
    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }
    if (this.tooltipElement) {
      this.tooltipElement.classList.remove('show');
    }
  }
}
