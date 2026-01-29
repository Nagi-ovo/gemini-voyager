import browser from 'webextension-polyfill';

import { DataBackupService } from '@/core/services/DataBackupService';
import { getStorageMonitor } from '@/core/services/StorageMonitor';
import { FolderImportExportService } from '@/features/folder/services/FolderImportExportService';
import type { ImportStrategy } from '@/features/folder/types/import-export';
import { getTranslationSync, getTranslationSyncUnsafe, initI18n } from '@/utils/i18n';

import { FOLDER_COLORS, getFolderColor, isDarkMode } from './folderColors';
import { DEFAULT_CONVERSATION_ICON, DEFAULT_GEM_ICON, GEM_CONFIG, getGemIcon } from './gemConfig';
import {
  type IFolderStorageAdapter,
  createFolderStorageAdapter,
} from './storage/FolderStorageAdapter';
import type { ConversationReference, DragData, Folder, FolderData } from './types';

const STORAGE_KEY = 'gvFolderData';
const IS_DEBUG = false; // Set to true to enable debug logging
const ROOT_CONVERSATIONS_ID = '__root_conversations__'; // Special ID for root-level conversations
const NOTIFICATION_TIMEOUT_MS = 10000; // Duration to show data loss notification

// Export session backup keys for use by FolderImportExportService (deprecated, kept for compatibility)
export const SESSION_BACKUP_KEY = 'gvFolderBackup';
export const SESSION_BACKUP_TIMESTAMP_KEY = 'gvFolderBackupTimestamp';

/**
 * Validate folder data structure
 */
function validateFolderData(data: any): boolean {
  return (
    data &&
    typeof data === 'object' &&
    Array.isArray(data.folders) &&
    typeof data.folderContents === 'object'
  );
}

export class FolderManager {
  private debug(...args: any[]): void {
    if (this.isDebugEnabled()) {
      console.log('[FolderManager]', ...args);
    }
  }

  private debugWarn(...args: any[]): void {
    if (this.isDebugEnabled()) {
      console.warn('[FolderManager]', ...args);
    }
  }
  private isDebugEnabled(): boolean {
    try {
      // Enable by setting localStorage.gvFolderDebug = '1'
      return IS_DEBUG || localStorage.getItem('gvFolderDebug') === '1';
    } catch {
      // Ignore - localStorage may not be available in some contexts (e.g. incognito mode)
      return IS_DEBUG;
    }
  }
  private storage: IFolderStorageAdapter; // Storage adapter (Strategy Pattern)
  private backupService: DataBackupService<FolderData>; // Multi-layer backup system
  private data: FolderData = { folders: [], folderContents: {} };
  private containerElement: HTMLElement | null = null;
  private sidebarContainer: HTMLElement | null = null;
  private recentSection: HTMLElement | null = null;
  private tooltipElement: HTMLElement | null = null;
  private tooltipTimeout: number | null = null;
  private sideNavObserver: MutationObserver | null = null;
  private conversationObserver: MutationObserver | null = null; // Observer for conversation additions/removals
  private importInProgress: boolean = false; // Lock to prevent concurrent imports
  private exportInProgress: boolean = false; // Lock to prevent concurrent exports
  private selectedConversations: Set<string> = new Set(); // For multi-select support
  private isMultiSelectMode: boolean = false; // Multi-select mode state
  private multiSelectSource: 'folder' | 'native' | null = null; // Track where multi-select was initiated
  private multiSelectFolderId: string | null = null; // Track which folder multi-select was initiated from
  private longPressTimeout: number | null = null; // For long-press detection
  private longPressThreshold: number = 500; // Long-press duration in ms
  private folderEnabled: boolean = true; // Whether folder feature is enabled
  private hideArchivedConversations: boolean = false; // Whether to hide conversations in folders
  private navPoller: number | null = null;
  private lastPathname: string | null = null;
  private saveInProgress: boolean = false; // Lock to prevent concurrent saves
  private pendingTitleUpdates: Map<string, string> = new Map(); // Buffer title updates during render
  private pendingRemovals: Map<string, number> = new Map(); // Pending conversation removals with timer IDs
  private removalCheckDelay: number = 300; // Delay (ms) before confirming conversation deletion
  private isDestroyed: boolean = false; // Flag to prevent callbacks after destruction
  private reinitializePromise: Promise<void> | null = null; // Prevent duplicate reinitialization cascades
  private activeColorPicker: HTMLElement | null = null; // Currently open color picker dialog
  private activeColorPickerFolderId: string | null = null; // Folder ID of currently open color picker
  private activeColorPickerCloseHandler: ((e: MouseEvent) => void) | null = null; // Event handler for closing color picker

  // Cleanup references
  private routeChangeCleanup: (() => void) | null = null;
  private sidebarClickListener: ((e: Event) => void) | null = null;
  private nativeMenuObserver: MutationObserver | null = null;
  private outsideClickHandler: ((e: MouseEvent) => void) | null = null; // For exiting multi-select on outside click

  // Batch delete related properties
  private readonly MAX_BATCH_DELETE_COUNT = 50; // Maximum number of conversations to delete at once
  private batchDeleteInProgress = false; // Lock to prevent concurrent batch deletes
  private batchDeleteProgressElement: HTMLElement | null = null; // Progress indicator element

  // Batch delete timing configuration (in milliseconds)
  private readonly BATCH_DELETE_CONFIG = {
    DELAY_BETWEEN_DELETIONS: 500, // Delay between each deletion to avoid rate limiting
    MENU_APPEAR_DELAY: 300, // Wait for context menu to appear after clicking "more" button
    DIALOG_APPEAR_DELAY: 300, // Wait for confirmation dialog to appear
    DELETION_COMPLETE_DELAY: 500, // Wait for deletion animation/API call to complete
    MAX_BUTTON_WAIT_TIME: 3000, // Maximum time to wait for delete/confirm button to appear
    BUTTON_CHECK_INTERVAL: 100, // Interval for polling button appearance
    PAGE_REFRESH_DELAY: 1500, // Delay before refreshing page after batch delete
  } as const;

  private cleanupTasks: (() => void)[] = [];

  constructor() {
    // Create storage adapter based on browser (Factory Pattern)
    this.storage = createFolderStorageAdapter();
    this.debug(`Using storage backend: ${this.storage.getBackendName()}`);

    // Initialize backup service with localStorage
    this.backupService = new DataBackupService<FolderData>('gemini-folders', validateFolderData);

    // Note: Data loading moved to init() for async support
    // This allows Safari to use async browser.storage API
    this.createTooltip();

    // Initialize i18n system
    initI18n().catch((e) => {
      this.debugWarn('Failed to initialize i18n:', e);
    });
  }

  async init(): Promise<void> {
    try {
      // Initialize storage adapter (handles migration for Safari automatically)
      await this.storage.init(STORAGE_KEY);

      // Setup automatic backup before page unload
      this.backupService.setupBeforeUnloadBackup(() => this.data);

      // Initialize storage quota monitor
      const storageMonitor = getStorageMonitor({
        checkIntervalMs: 60000, // Check every minute for Gemini (more active)
      });

      // Use custom notification callback to match our style
      storageMonitor.setNotificationCallback((message, level) => {
        this.showNotificationByLevel(message, level);
      });

      // Start monitoring
      storageMonitor.startMonitoring();

      // Load folder data (async, works for both Safari and non-Safari)
      await this.loadData();

      // Load folder enabled setting
      await this.loadFolderEnabledSetting();

      // Load hide archived setting
      await this.loadHideArchivedSetting();

      // Set up storage change listener (always needed to respond to setting changes)
      this.setupStorageListener();

      // Set up message listener (for popup communication)
      this.setupMessageListener();

      // If folder feature is disabled, skip initialization
      if (!this.folderEnabled) {
        this.debug('Folder feature is disabled, skipping initialization');
        return;
      }

      // Initialize folder UI
      await this.initializeFolderUI();

      this.debug('Initialized successfully');
    } catch (error) {
      console.error('[FolderManager] Initialization error:', error);
    }
  }

  /**
   * Cleanup method to prevent memory leaks
   * Clears all pending deletion timers and observers
   */
  destroy(): void {
    this.debug('Destroying FolderManager - cleaning up resources');
    this.isDestroyed = true;

    // Clear all pending removal timers
    let clearedCount = 0;
    this.pendingRemovals.forEach((timerId, conversationId) => {
      clearTimeout(timerId);
      clearedCount++;
      this.debug(`Cleared pending removal timer for ${conversationId}`);
    });
    this.pendingRemovals.clear();

    if (clearedCount > 0) {
      this.debug(`Cleared ${clearedCount} pending removal timer(s)`);
    }

    // Clear other timers
    if (this.longPressTimeout) {
      clearTimeout(this.longPressTimeout);
      this.longPressTimeout = null;
    }

    if (this.tooltipTimeout) {
      clearTimeout(this.tooltipTimeout);
      this.tooltipTimeout = null;
    }

    if (this.navPoller) {
      clearInterval(this.navPoller);
      this.navPoller = null;
    }

    // Disconnect mutation observers
    if (this.sideNavObserver) {
      this.sideNavObserver.disconnect();
      this.sideNavObserver = null;
    }

    if (this.conversationObserver) {
      this.conversationObserver.disconnect();
      this.conversationObserver = null;
    }

    if (this.nativeMenuObserver) {
      this.nativeMenuObserver.disconnect();
      this.nativeMenuObserver = null;
    }

    // Remove event listeners
    if (this.routeChangeCleanup) {
      this.routeChangeCleanup();
      this.routeChangeCleanup = null;
    }

    if (this.sidebarClickListener && this.sidebarContainer) {
      try {
        this.sidebarContainer.removeEventListener('click', this.sidebarClickListener, true);
      } catch (e) {
        // Ignore
      }
      this.sidebarClickListener = null;
    }

    // Remove outside click handler for multi-select
    this.removeOutsideClickHandler();

    // Remove tooltip
    if (this.tooltipElement) {
      this.tooltipElement.remove();
      this.tooltipElement = null;
    }

    // Remove active color picker
    if (this.activeColorPicker) {
      this.activeColorPicker.remove();
      if (this.activeColorPickerCloseHandler) {
        document.removeEventListener('click', this.activeColorPickerCloseHandler);
        this.activeColorPickerCloseHandler = null;
      }
      this.activeColorPicker = null;
      this.activeColorPickerFolderId = null;
    }

    // Remove container
    if (this.containerElement) {
      this.containerElement.remove();
      this.containerElement = null;
    }

    // Execute custom cleanup tasks
    this.cleanupTasks.forEach((task) => task());
    this.cleanupTasks = [];

    this.debug('Cleanup complete');
  }

  private addCleanupTask(task: () => void): void {
    this.cleanupTasks.push(task);
  }

  private async initializeFolderUI(): Promise<void> {
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

    // Set up sidebar visibility observer
    this.setupSideNavObserver();

    // Initial visibility check
    this.updateVisibilityBasedOnSideNav();

    // Set up native conversation menu injection
    this.setupConversationClickTracking();
    this.setupNativeConversationMenuObserver();
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
    let conversationsList = this.sidebarContainer.querySelector(
      '[data-test-id="all-conversations"]',
    );

    if (!conversationsList) {
      // Fallback: find by class name
      conversationsList = this.sidebarContainer.querySelector('.chat-history');
    }

    if (!conversationsList) {
      // Fallback: find the element that contains conversation items
      const conversationItems = this.sidebarContainer.querySelectorAll(
        '[data-test-id="conversation"]',
      );
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

    // Create multi-select mode indicator
    const indicator = this.createMultiSelectIndicator();
    this.containerElement.appendChild(indicator);

    // Create header
    const header = this.createHeader();
    this.containerElement.appendChild(header);

    // Create folders list
    const foldersList = this.createFoldersList();
    this.containerElement.appendChild(foldersList);

    // Insert before Recent section
    this.recentSection.parentElement?.insertBefore(this.containerElement, this.recentSection);

    // Initial active conversation highlight and route listeners
    this.highlightActiveConversationInFolders();
    this.installRouteChangeListener();
    this.installSidebarClickListener();

    // Apply initial folder enabled setting
    this.applyFolderEnabledSetting();
  }

  private createMultiSelectIndicator(): HTMLElement {
    const indicator = document.createElement('div');
    indicator.className = 'gv-multi-select-indicator';
    indicator.dataset.multiSelectIndicator = 'true';

    // Apply floating styles
    Object.assign(indicator.style, {
      position: 'fixed',
      bottom: '24px',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: '9999', // Ensure it's above everything
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      cursor: 'move', // Indicate it's draggable
      transition: 'opacity 0.2s ease, transform 0.1s ease', // Only animate non-position props for performance
      // Prevent text selection while dragging
      userSelect: 'none',
      // Ensure it has a background so IT covers content behind it
      backgroundColor: 'var(--gem-sys-color-surface-container, #f0f4f9)', // Fallback color
      borderRadius: '24px',
      padding: '8px 16px',
      alignItems: 'center',
      gap: '12px',
      border: '1px solid var(--gem-sys-color-outline-variant, rgba(0,0,0,0.1))',
    });

    // --- Draggable Logic Start ---
    let isDragging = false;
    let currentX: number;
    let currentY: number;
    let initialX: number;
    let initialY: number;
    let xOffset = 0;
    let yOffset = 0;

    const dragStart = (e: MouseEvent) => {
      // Ignore if clicking buttons inside the indicator
      if ((e.target as HTMLElement).closest('button')) return;

      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;

      if (e.target === indicator || indicator.contains(e.target as Node)) {
        isDragging = true;
        indicator.style.cursor = 'grabbing';
      }
    };

    const dragEnd = () => {
      isDragging = false;
      indicator.style.cursor = 'move';
    };

    const drag = (e: MouseEvent) => {
      if (isDragging) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        setTranslate(currentX, currentY, indicator);
      }
    };

    const setTranslate = (xPos: number, yPos: number, el: HTMLElement) => {
      el.style.transform = `translate3d(calc(-50% + ${xPos}px), ${yPos}px, 0)`;
    };

    indicator.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);

    // Cleanup listeners when destroyed (adding to a cleanup list if possible, or attaching to element)
    // Since we attach to document, we MUST clean this up in destroy()
    // We'll wrap these in a cleanup function and store it
    this.addCleanupTask(() => {
      indicator.removeEventListener('mousedown', dragStart);
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', dragEnd);
    });
    // --- Draggable Logic End ---

    const content = document.createElement('div');
    content.className = 'gv-multi-select-indicator-content';
    // Ensure content (text/icon) doesn't capture drag events aggressively
    content.style.pointerEvents = 'none';

    const icon = document.createElement('mat-icon');
    icon.className = 'mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color';
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'check_circle';

    const text = document.createElement('span');
    text.className = 'gv-multi-select-indicator-text';
    text.textContent = '0 selected';
    text.dataset.selectionCount = 'true';

    content.appendChild(icon);
    content.appendChild(text);
    indicator.appendChild(content);

    // Actions container (will be populated dynamically)
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'gv-multi-select-actions';
    actionsContainer.dataset.multiSelectActions = 'true';
    // Re-enable pointer events for buttons
    actionsContainer.style.pointerEvents = 'auto';
    indicator.appendChild(actionsContainer);

    return indicator;
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

    // Actions container for buttons
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'gv-folder-header-actions';

    // Import button
    const importButton = document.createElement('button');
    importButton.className = 'gv-folder-action-btn';
    importButton.innerHTML = `<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">upload</mat-icon>`;
    importButton.title = this.t('folder_import');
    importButton.addEventListener('click', () => this.showImportDialog());

    // Export button
    const exportButton = document.createElement('button');
    exportButton.className = 'gv-folder-action-btn';
    exportButton.innerHTML = `<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">download</mat-icon>`;
    exportButton.title = this.t('folder_export');
    exportButton.addEventListener('click', () => this.exportFolders());

    // Add folder button
    const addButton = document.createElement('button');
    addButton.className = 'gv-folder-add-btn';
    addButton.innerHTML = `<mat-icon role="img" class="mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">add</mat-icon>`;
    addButton.title = this.t('folder_create');
    addButton.addEventListener('click', () => this.createFolder());

    actionsContainer.appendChild(importButton);
    actionsContainer.appendChild(exportButton);
    actionsContainer.appendChild(addButton);

    header.appendChild(titleContainer);
    header.appendChild(actionsContainer);

    // Setup root drop zone on header
    this.setupRootDropZone(header);

    return header;
  }

  private createFoldersList(): HTMLElement {
    const list = document.createElement('div');
    list.className = 'gv-folder-list';

    // Setup root-level drop zone for dragging folders and conversations to root
    this.setupRootDropZone(list);

    // Render root-level conversations (favorites/pinned conversations)
    const rootConversations = this.data.folderContents[ROOT_CONVERSATIONS_ID] || [];
    if (rootConversations.length > 0) {
      rootConversations.forEach((conv) => {
        const convEl = this.createConversationElement(conv, ROOT_CONVERSATIONS_ID, 0);
        list.appendChild(convEl);
      });
    }

    // Render root level folders (sorted)
    const rootFolders = this.data.folders.filter((f) => f.parentId === null);
    const sortedRootFolders = this.sortFolders(rootFolders);
    sortedRootFolders.forEach((folder) => {
      const folderElement = this.createFolderElement(folder);
      list.appendChild(folderElement);
    });

    // If no folders and no root conversations, show empty state placeholder
    if (rootFolders.length === 0 && rootConversations.length === 0) {
      const emptyState = document.createElement('div');
      emptyState.className = 'gv-folder-empty';
      emptyState.textContent = this.t('folder_empty');
      list.appendChild(emptyState);
    }

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
    folderIcon.style.cursor = 'pointer';
    folderIcon.style.userSelect = 'none';

    // Apply folder color if set
    if (folder.color && folder.color !== 'default') {
      const colorValue = getFolderColor(folder.color, isDarkMode());
      folderIcon.style.color = colorValue;
    }

    folderIcon.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent bubbling issues
      this.showColorPicker(folder.id, e, true); // Allow toggle behavior
    });

    // Folder name
    const folderName = document.createElement('span');
    folderName.className = 'gv-folder-name gds-label-l';
    folderName.textContent = folder.name;
    folderName.style.cursor = 'pointer';
    folderName.addEventListener('click', () => this.toggleFolder(folder.id));
    folderName.addEventListener('dblclick', () => this.renameFolder(folder.id));

    // Add tooltip event listeners
    folderName.addEventListener('mouseenter', () => this.showTooltip(folderName, folder.name));
    folderName.addEventListener('mouseleave', () => this.hideTooltip());

    // Pin button
    const pinBtn = document.createElement('button');
    pinBtn.className = 'gv-folder-pin-btn';
    const pinIcon = document.createElement('span');
    pinIcon.className = 'google-symbols';
    pinIcon.textContent = 'push_pin';
    // Add filled style for pinned folders
    if (folder.pinned) {
      pinIcon.style.fontVariationSettings = "'FILL' 1";
    }
    pinBtn.appendChild(pinIcon);
    pinBtn.title = folder.pinned ? this.t('folder_unpin') : this.t('folder_pin');
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.togglePinFolder(folder.id);
    });

    // Actions menu
    const actionsBtn = document.createElement('button');
    actionsBtn.className = 'gv-folder-actions-btn';
    actionsBtn.innerHTML = '<span class="google-symbols">more_vert</span>';
    actionsBtn.addEventListener('click', (e) => this.showFolderMenu(e, folder.id));

    folderHeader.appendChild(expandBtn);
    folderHeader.appendChild(folderIcon);
    folderHeader.appendChild(folderName);
    folderHeader.appendChild(pinBtn);
    folderHeader.appendChild(actionsBtn);

    // Setup drop zone for conversations and folders
    this.setupDropZone(folderHeader, folder.id);

    folderEl.appendChild(folderHeader);

    // Apply draggable behavior dynamically based on current state
    // This ensures draggability is always in sync with folder structure
    this.applyFolderDraggableBehavior(folderHeader, folder);

    // Folder content (conversations and subfolders)
    if (folder.isExpanded) {
      const content = document.createElement('div');
      content.className = 'gv-folder-content';
      // Fix: Allow dropping into the content area of the folder (not just the header)
      this.setupDropZone(content, folder.id);

      // Render conversations in this folder (sorted: starred first)
      const conversations = this.data.folderContents[folder.id] || [];
      const sortedConversations = this.sortConversations(conversations);
      sortedConversations.forEach((conv) => {
        const convEl = this.createConversationElement(conv, folder.id, level + 1);
        content.appendChild(convEl);
      });

      // Render subfolders (sorted)
      const subfolders = this.data.folders.filter((f) => f.parentId === folder.id);
      const sortedSubfolders = this.sortFolders(subfolders);
      sortedSubfolders.forEach((subfolder) => {
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
    level: number,
  ): HTMLElement {
    const convEl = document.createElement('div');
    convEl.className = conv.starred
      ? 'gv-folder-conversation gv-starred'
      : 'gv-folder-conversation';
    convEl.dataset.conversationId = conv.conversationId;
    convEl.dataset.folderId = folderId;
    // Increase indentation for conversations under folders
    convEl.style.paddingLeft = `${level * 16 + 24}px`; // More indentation for tree structure

    // Try to sync title from native conversation
    // Decide what title to display, respecting manual renames and hidden native list
    let displayTitle = conv.title;
    if (!conv.customTitle && !this.hideArchivedConversations) {
      const syncedTitle = this.syncConversationTitleFromNative(conv.conversationId);
      if (syncedTitle && syncedTitle !== conv.title) {
        conv.title = syncedTitle;
        displayTitle = syncedTitle;
        // Buffer title updates during render to avoid multiple rapid saves
        this.pendingTitleUpdates.set(conv.conversationId, syncedTitle);
        this.debug('Buffered title update for:', conv.conversationId);
      }
    }

    // Make conversation draggable within folders
    convEl.draggable = true;
    convEl.addEventListener('dragstart', (e) => {
      e.stopPropagation();

      // If this conversation is not selected, select it exclusively
      if (!this.selectedConversations.has(conv.conversationId)) {
        this.clearSelection();
        this.selectConversation(conv.conversationId);
        this.updateConversationSelectionUI();
      }

      // Cancel long press if drag starts
      if (this.longPressTimeout) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }

      // Include all selected conversations in the drag data
      const selectedConvs = this.getSelectedConversationsData(folderId);
      const dragData = {
        type: 'conversation',
        conversations: selectedConvs,
        sourceFolderId: folderId, // Track where they're being dragged from
      };
      e.dataTransfer!.setData('application/json', JSON.stringify(dragData));

      // Apply opacity to all selected conversations
      this.selectedConversations.forEach((id) => {
        const el = this.containerElement?.querySelector(
          `[data-conversation-id="${id}"]`,
        ) as HTMLElement;
        if (el) el.style.opacity = '0.5';
      });
    });

    convEl.addEventListener('dragend', () => {
      // Restore opacity for all selected conversations
      this.selectedConversations.forEach((id) => {
        const el = this.containerElement?.querySelector(
          `[data-conversation-id="${id}"]`,
        ) as HTMLElement;
        if (el) el.style.opacity = '1';
      });

      // If we are not in multi-select mode, clear the temporary selection
      if (!this.isMultiSelectMode) {
        this.clearSelection();
        this.cleanupSelectionArtifacts();
      }
    });

    // Conversation icon - use Gem-specific icons
    const icon = document.createElement('mat-icon');
    icon.className =
      'mat-icon notranslate gv-conversation-icon google-symbols mat-ligature-font mat-icon-no-color';
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
    title.textContent = displayTitle;

    // Add tooltip event listeners
    title.addEventListener('mouseenter', () => this.showTooltip(title, displayTitle));
    title.addEventListener('mouseleave', () => this.hideTooltip());

    // Actions container for buttons
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'gv-conversation-actions';

    // Star button
    const starBtn = document.createElement('button');
    starBtn.className = conv.starred
      ? 'gv-conversation-star-btn starred'
      : 'gv-conversation-star-btn';
    const starIcon = conv.starred ? 'star' : 'star_outline';
    starBtn.innerHTML = `<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">${starIcon}</mat-icon>`;
    starBtn.title = conv.starred ? this.t('conversation_unstar') : this.t('conversation_star');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleConversationStar(folderId, conv.conversationId);
    });

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.className = 'gv-conversation-remove-btn';
    removeBtn.innerHTML =
      '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">close</mat-icon>';
    removeBtn.title = this.t('folder_remove_conversation');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmRemoveConversation(folderId, conv.conversationId, displayTitle, e);
    });

    actionsContainer.appendChild(starBtn);
    actionsContainer.appendChild(removeBtn);

    // Long-press detection for entering multi-select mode
    let longPressTriggered = false;

    convEl.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // Only left mouse button
      longPressTriggered = false;

      this.longPressTimeout = window.setTimeout(() => {
        longPressTriggered = true;
        this.enterMultiSelectMode(conv.conversationId, 'folder', folderId);
      }, this.longPressThreshold);
    });

    convEl.addEventListener('mouseup', () => {
      if (this.longPressTimeout) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }
    });

    convEl.addEventListener('mouseleave', () => {
      if (this.longPressTimeout) {
        clearTimeout(this.longPressTimeout);
        this.longPressTimeout = null;
      }
    });

    // Click to navigate or toggle selection based on mode
    convEl.addEventListener('click', (e) => {
      // Prevent navigation if long-press was triggered
      if (longPressTriggered) {
        longPressTriggered = false;
        return;
      }

      if (this.isMultiSelectMode) {
        // Multi-select mode: validate folder before toggling selection
        e.preventDefault();
        e.stopPropagation();

        // Prevent cross-folder selection
        if (
          this.multiSelectSource === 'folder' &&
          this.multiSelectFolderId &&
          this.multiSelectFolderId !== folderId
        ) {
          // Provide visual feedback for invalid selection attempt
          this.showInvalidSelectionFeedback(convEl);
          return;
        }

        this.toggleConversationSelection(conv.conversationId);
        this.updateConversationSelectionUI();
      } else {
        // Normal mode: navigate to conversation
        this.navigateToConversationById(folderId, conv.conversationId);
      }
    });

    // Double-click to rename
    title.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      this.renameConversation(folderId, conv.conversationId, title);
    });

    convEl.appendChild(icon);
    convEl.appendChild(title);
    convEl.appendChild(actionsContainer);

    return convEl;
  }

  private setupDropZone(element: HTMLElement, folderId: string): void {
    element.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent root drop zone from also highlighting
      element.classList.add('gv-folder-dragover');
    });

    element.addEventListener('dragleave', () => {
      element.classList.remove('gv-folder-dragover');
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // CRITICAL: Prevent event bubbling to root drop zone
      element.classList.remove('gv-folder-dragover');

      const data = e.dataTransfer?.getData('application/json');
      if (!data) return;

      try {
        const dragData: DragData = JSON.parse(data);

        // Pre-cleanup: Restore opacity immediately before processing drop
        // This prevents visual artifacts if dragend doesn't fire properly
        this.selectedConversations.forEach((id) => {
          const el = this.findConversationElement(id);
          if (el) el.style.opacity = '1';
        });

        // Handle different drag types
        if (dragData.type === 'folder') {
          // Handle folder drop
          this.debug('Dropping folder into folder:', dragData.title, '→', folderId);
          this.addFolderToFolder(folderId, dragData);
        } else {
          // Handle conversation drop - supports both single and multiple conversations
          if (dragData.conversations && dragData.conversations.length > 0) {
            // Multi-select drag
            this.debug('Dropping multiple conversations:', dragData.conversations.length);
            this.addConversationsToFolder(
              folderId,
              dragData.conversations,
              dragData.sourceFolderId,
            );
          } else {
            // Legacy single conversation drag (backward compatibility)
            this.addConversationToFolder(folderId, dragData);
          }
        }

        // Clear selection and exit multi-select mode after successful drop
        this.exitMultiSelectMode();
      } catch (error) {
        console.error('[FolderManager] Drop error:', error);
      }
    });
  }

  private setupRootDropZone(element: HTMLElement): void {
    element.addEventListener('dragover', (e) => {
      // Allow both folder and conversation drops on the root zone
      const data = e.dataTransfer?.types.includes('application/json');
      if (!data) return;

      e.preventDefault();
      e.stopPropagation(); // Prevent parent handlers from firing
      element.classList.add('gv-folder-list-dragover');
    });

    element.addEventListener('dragleave', (e) => {
      // Check if we're leaving this element (not just entering a child)
      const rect = element.getBoundingClientRect();
      const x = (e as DragEvent).clientX;
      const y = (e as DragEvent).clientY;

      if (x <= rect.left || x >= rect.right || y <= rect.top || y >= rect.bottom) {
        element.classList.remove('gv-folder-list-dragover');
      }
    });

    element.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent parent handlers from firing
      element.classList.remove('gv-folder-list-dragover');

      const data = e.dataTransfer?.getData('application/json');
      if (!data) return;

      try {
        const dragData: DragData = JSON.parse(data);

        // Pre-cleanup: Restore opacity immediately before processing drop
        // This prevents visual artifacts if dragend doesn't fire properly
        this.selectedConversations.forEach((id) => {
          const el = this.findConversationElement(id);
          if (el) el.style.opacity = '1';
        });

        // Handle different drag types at root level
        if (dragData.type === 'folder') {
          this.moveFolderToRoot(dragData);
        } else {
          // Handle conversation drop - supports both single and multiple conversations
          if (dragData.conversations && dragData.conversations.length > 0) {
            // Multi-select drag
            this.debug(
              'Adding multiple conversations to root level:',
              dragData.conversations.length,
            );
            this.addConversationsToFolder(
              ROOT_CONVERSATIONS_ID,
              dragData.conversations,
              dragData.sourceFolderId,
            );
          } else {
            // Legacy single conversation drag (backward compatibility)
            this.debug('Adding conversation to root level:', dragData.title);
            this.addConversationToFolder(ROOT_CONVERSATIONS_ID, dragData);
          }
        }

        // Clear selection and exit multi-select mode after successful drop
        this.exitMultiSelectMode();
      } catch (error) {
        console.error('[FolderManager] Root drop error:', error);
      }
    });
  }

  private makeConversationsDraggable(): void {
    if (!this.sidebarContainer) return;

    const conversations = this.sidebarContainer.querySelectorAll('[data-test-id="conversation"]');
    conversations.forEach((conv) => {
      this.makeConversationDraggable(conv as HTMLElement);

      // Apply hide archived setting
      const convId = this.extractConversationId(conv as HTMLElement);
      const isArchived = this.isConversationInFolders(convId);

      if (this.hideArchivedConversations && isArchived) {
        (conv as HTMLElement).classList.add('gv-conversation-archived');
      } else {
        (conv as HTMLElement).classList.remove('gv-conversation-archived');
      }
    });
  }

  /**
   * Strategy Pattern: Determine if a folder can be dragged
   * Single Responsibility Principle: Separate logic for draggability check
   *
   * A folder can be dragged if and only if:
   * - It has no subfolders (to prevent deep nesting complexity)
   *
   * @param folderId - The ID of the folder to check
   * @returns true if the folder can be dragged, false otherwise
   */
  private canFolderBeDragged(folderId: string): boolean {
    return !this.data.folders.some((f) => f.parentId === folderId);
  }

  /**
   * Strategy Pattern: Apply or remove draggable behavior based on folder state
   * Open/Closed Principle: Easy to extend with new draggable conditions
   *
   * This method ensures that folder draggability is always in sync with the current state.
   * It will enable dragging if conditions are met, or disable it if not.
   *
   * @param element - The folder header element
   * @param folder - The folder data object
   */
  private applyFolderDraggableBehavior(element: HTMLElement, folder: Folder): void {
    if (this.canFolderBeDragged(folder.id)) {
      this.enableFolderDragging(element, folder);
    } else {
      this.disableFolderDragging(element);
    }
  }

  /**
   * Enable dragging for a folder element
   * Encapsulates all logic needed to make a folder draggable
   *
   * Uses a data attribute to track drag listeners and prevent duplicates.
   * This ensures event listeners are only added once per element lifecycle.
   *
   * @param element - The folder header element
   * @param folder - The folder data object
   */
  private enableFolderDragging(element: HTMLElement, folder: Folder): void {
    // Mark element as draggable
    element.draggable = true;
    element.style.cursor = 'grab';

    // Check if drag listeners are already attached
    if (element.dataset.dragListenersAttached === 'true') {
      this.debug('Drag listeners already attached for folder:', folder.name);
      return;
    }

    // Create named event handler functions for proper cleanup
    const handleDragStart = (e: Event) => {
      e.stopPropagation(); // Prevent parent folder from being dragged

      const dragData: DragData = {
        type: 'folder',
        folderId: folder.id,
        title: folder.name,
      };

      (e as DragEvent).dataTransfer?.setData('application/json', JSON.stringify(dragData));
      element.style.opacity = '0.5';

      this.debug(
        'Folder drag start:',
        folder.name,
        'canBeDragged:',
        this.canFolderBeDragged(folder.id),
      );
    };

    const handleDragEnd = () => {
      element.style.opacity = '1';
    };

    // Store references for potential cleanup
    (element as any)._dragStartHandler = handleDragStart;
    (element as any)._dragEndHandler = handleDragEnd;

    // Add drag event listeners
    element.addEventListener('dragstart', handleDragStart);
    element.addEventListener('dragend', handleDragEnd);

    // Mark that listeners are attached
    element.dataset.dragListenersAttached = 'true';
  }

  /**
   * Disable dragging for a folder element
   * Ensures folder cannot be dragged when it has subfolders
   *
   * Properly removes event listeners to prevent memory leaks.
   *
   * @param element - The folder header element
   */
  private disableFolderDragging(element: HTMLElement): void {
    element.draggable = false;
    element.style.cursor = '';

    // Remove drag event listeners if they exist
    if (element.dataset.dragListenersAttached === 'true') {
      const dragStartHandler = (element as any)._dragStartHandler;
      const dragEndHandler = (element as any)._dragEndHandler;

      if (dragStartHandler) {
        element.removeEventListener('dragstart', dragStartHandler);
        delete (element as any)._dragStartHandler;
      }

      if (dragEndHandler) {
        element.removeEventListener('dragend', dragEndHandler);
        delete (element as any)._dragEndHandler;
      }

      delete element.dataset.dragListenersAttached;
    }
  }

  private makeConversationDraggable(element: HTMLElement): void {
    element.draggable = true;
    element.style.cursor = 'grab';

    // Long-press detection for entering multi-select mode
    let longPressTriggered = false;
    let longPressTimeoutId: number | null = null;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return; // Only left mouse button
      longPressTriggered = false;

      const conversationId = this.extractConversationId(element);

      longPressTimeoutId = window.setTimeout(() => {
        longPressTriggered = true;
        this.enterMultiSelectMode(conversationId, 'native');
        // Add visual feedback to this element
        element.classList.add('gv-conversation-selected');
      }, this.longPressThreshold);
    };

    const handleMouseUp = () => {
      if (longPressTimeoutId) {
        clearTimeout(longPressTimeoutId);
        longPressTimeoutId = null;
      }
    };

    const handleMouseLeave = () => {
      if (longPressTimeoutId) {
        clearTimeout(longPressTimeoutId);
        longPressTimeoutId = null;
      }
    };

    // Add event listeners
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mouseup', handleMouseUp);
    element.addEventListener('mouseleave', handleMouseLeave);

    // Click handler for multi-select mode
    const originalClickHandler = element.onclick;
    element.addEventListener(
      'click',
      (e) => {
        // Prevent navigation if long-press was triggered
        if (longPressTriggered) {
          e.preventDefault();
          e.stopPropagation();
          longPressTriggered = false;
          return;
        }

        if (this.isMultiSelectMode) {
          // Multi-select mode: toggle selection
          e.preventDefault();
          e.stopPropagation();
          const conversationId = this.extractConversationId(element);
          this.toggleConversationSelection(conversationId);

          // Update visual state
          if (this.selectedConversations.has(conversationId)) {
            element.classList.add('gv-conversation-selected');
          } else {
            element.classList.remove('gv-conversation-selected');
          }

          this.updateConversationSelectionUI();
          return;
        }
      },
      true,
    ); // Use capture phase to intercept before navigation

    element.addEventListener('dragstart', (e) => {
      const title = element.querySelector('.conversation-title')?.textContent?.trim() || 'Untitled';
      const conversationId = this.extractConversationId(element);

      // Extract URL and conversation metadata together
      const conversationData = this.extractConversationData(element);

      // If this conversation is not selected, select it exclusively
      if (!this.selectedConversations.has(conversationId)) {
        this.clearSelection();
        this.selectConversation(conversationId);
        element.classList.add('gv-conversation-selected');
        this.updateConversationSelectionUI();
      }

      // Cancel long press if drag starts
      if (longPressTimeoutId) {
        clearTimeout(longPressTimeoutId);
        longPressTimeoutId = null;
      }

      // Check if we have multiple selections
      if (this.selectedConversations.size > 1) {
        // Multi-select drag - collect all selected conversations
        const selectedConvs: ConversationReference[] = [];

        this.selectedConversations.forEach((id) => {
          const convEl = this.findConversationElement(id);
          if (convEl) {
            const convTitle =
              convEl.querySelector('.conversation-title')?.textContent?.trim() || 'Untitled';
            const convData = this.extractConversationData(convEl);

            selectedConvs.push({
              conversationId: id,
              title: convTitle,
              url: convData.url,
              addedAt: Date.now(),
              isGem: convData.isGem,
              gemId: convData.gemId,
            });
          }
        });

        const dragData: DragData = {
          type: 'conversation',
          title: `${selectedConvs.length} conversations`,
          conversations: selectedConvs,
        };

        e.dataTransfer?.setData('application/json', JSON.stringify(dragData));

        // Apply opacity to all selected conversations
        this.selectedConversations.forEach((id) => {
          const el = this.findConversationElement(id);
          if (el) el.style.opacity = '0.5';
        });
      } else {
        // Single conversation drag (legacy behavior)
        this.debug('Drag start:', {
          title,
          isGem: conversationData.isGem,
          gemId: conversationData.gemId,
          url: conversationData.url,
        });

        const dragData: DragData = {
          type: 'conversation',
          conversationId,
          title,
          url: conversationData.url,
          isGem: conversationData.isGem,
          gemId: conversationData.gemId,
        };

        e.dataTransfer?.setData('application/json', JSON.stringify(dragData));
        element.style.opacity = '0.5';
      }
    });

    element.addEventListener('dragend', () => {
      // Restore opacity for all selected conversations
      if (this.selectedConversations.size > 1) {
        this.selectedConversations.forEach((id) => {
          const el = this.findConversationElement(id);
          if (el) el.style.opacity = '1';
        });
      } else {
        element.style.opacity = '1';
      }

      // If we are not in multi-select mode, clear the temporary selection
      if (!this.isMultiSelectMode) {
        this.clearSelection();
        this.cleanupSelectionArtifacts();
      }
    });
  }

  // Helper method to find conversation element by ID
  private findConversationElement(conversationId: string): HTMLElement | null {
    // Check in folder conversations
    const folderConv = this.containerElement?.querySelector(
      `[data-conversation-id="${conversationId}"]`,
    ) as HTMLElement;
    if (folderConv) return folderConv;

    // Check in native conversations (Recent section)
    const nativeConvs = this.sidebarContainer?.querySelectorAll('[data-test-id="conversation"]');
    if (nativeConvs) {
      for (const conv of Array.from(nativeConvs)) {
        const id = this.extractConversationId(conv as HTMLElement);
        if (id === conversationId) {
          return conv as HTMLElement;
        }
      }
    }

    return null;
  }

  private extractConversationId(element: HTMLElement): string {
    // Strategy 1: Extract from jslog attribute
    // This is the preferred method as it follows the internal ID format
    const jslog = element.getAttribute('jslog');
    if (jslog) {
      // Match conversation ID - it appears in quotes like ["c_3456c77162722c1a",...]
      const match = jslog.match(/[",\[]c_([a-f0-9]+)[",\]]/);
      if (match) {
        const conversationId = `c_${match[1]}`;
        this.debug('Extracted conversation ID:', conversationId, 'from jslog:', jslog);
        return conversationId;
      }
      // Fallback: match without surrounding characters
      const simpleMatch = jslog.match(/c_[a-f0-9]+/);
      if (simpleMatch) {
        this.debug('Extracted conversation ID (simple):', simpleMatch[0]);
        return simpleMatch[0];
      }
    }

    // Strategy 2: Extract from href (fallback when jslog is missing/broken)
    // This ensures we can still identify conversations even if Gemini UI changes traits
    const link = element.querySelector(
      'a[href*="/app/"], a[href*="/gem/"]',
    ) as HTMLAnchorElement | null;
    if (link) {
      const href = link.href;
      // Try /app/<hexId>
      let match = href.match(/\/app\/([^\/?#]+)/);
      if (match && match[1]) {
        // Enforce c_ prefix to match jslog format standard
        return `c_${match[1]}`;
      }
      // Try /gem/<gemId>/<hexId>
      match = href.match(/\/gem\/[^/]+\/([^\/?#]+)/);
      if (match && match[1]) {
        return `c_${match[1]}`;
      }
    }

    // Fallback: generate unique ID from element attributes
    // Use multiple attributes to ensure uniqueness
    const title = element.querySelector('.conversation-title')?.textContent?.trim() || '';
    const index = Array.from(element.parentElement?.children || []).indexOf(element);

    // Generate unique ID combining title, index, random, and timestamp
    const uniqueString = `${title}_${index}_${Math.random()}_${Date.now()}`;
    const fallbackId = `conv_${this.hashString(uniqueString)}`;
    this.debugWarn('Could not extract ID from jslog or href, using fallback:', fallbackId);
    return fallbackId;
  }

  private extractConversationData(element: HTMLElement): {
    url: string;
    isGem: boolean;
    gemId?: string;
  } {
    // Try to extract from jslog first
    const jslog = element.getAttribute('jslog');
    let hexId: string | null = null;

    if (jslog) {
      const match = jslog.match(/[",\[]c_([a-f0-9]+)[",\]]/);
      if (match) {
        hexId = match[1];
        this.debug('Extracted hex ID from jslog:', hexId);
      }
    }

    // Try to extract from href if jslog failed
    if (!hexId) {
      const link = element.querySelector(
        'a[href*="/app/"], a[href*="/gem/"]',
      ) as HTMLAnchorElement | null;
      if (link) {
        const href = link.href;
        // Try /app/<hexId>
        let match = href.match(/\/app\/([^\/?#]+)/);
        if (match && match[1]) {
          hexId = match[1];
        } else {
          // Try /gem/<gemId>/<hexId>
          match = href.match(/\/gem\/[^/]+\/([^\/?#]+)/);
          if (match && match[1]) {
            hexId = match[1];
          }
        }
      }
    }

    if (!hexId) {
      return { url: window.location.href, isGem: false };
    }

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
    return { url, isGem: false, gemId: undefined };
  }

  /**
   * Extract conversation ID from a DOM element
   * Used for handling removed/added conversations in MutationObserver
   *
   * @param element - The conversation element to extract ID from
   * @returns The conversation ID (hex only, without 'c_' prefix) or undefined if not found
   *
   * @remarks
   * This method attempts two extraction strategies:
   * 1. From jslog attribute (e.g., jslog="c_abc123def456")
   * 2. From href in anchor tags (e.g., /app/abc123def456 or /gem/xxx/abc123def456)
   */
  private extractConversationIdFromElement(element: Element): string | undefined {
    // Strategy 1: Extract from jslog attribute
    const jslog = element.getAttribute('jslog');
    if (jslog) {
      const match = jslog.match(/c_([a-f0-9]{8,})/i);
      if (match && match[1]) {
        return match[1];
      }
    }

    // Strategy 2: Extract from href
    const link = element.querySelector(
      'a[href*="/app/"], a[href*="/gem/"]',
    ) as HTMLAnchorElement | null;
    if (link) {
      const href = link.href;
      const appMatch = href.match(/\/app\/([^\/?#]+)/);
      const gemMatch = href.match(/\/gem\/[^/]+\/([^\/?#]+)/);
      return appMatch?.[1] || gemMatch?.[1];
    }

    return undefined;
  }

  private setupMutationObserver(): void {
    if (!this.sidebarContainer) return;

    // Disconnect existing observer to prevent duplicates
    if (this.conversationObserver) {
      this.conversationObserver.disconnect();
      this.conversationObserver = null;
    }

    this.conversationObserver = new MutationObserver((mutations) => {
      // 1. Handle added conversations (always safe)
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Check if the node itself is a conversation
            if (node.matches('[data-test-id="conversation"]')) {
              this.makeConversationDraggable(node);
              this.applyHideArchivedToConversation(node);
              // Cancel pending removal for this conversation (it's back!)
              this.cancelPendingRemovalForElement(node);
            }
            // Also check for conversations within the node
            const conversations = node.querySelectorAll('[data-test-id="conversation"]');
            conversations.forEach((conv) => {
              const convElement = conv as HTMLElement;
              this.makeConversationDraggable(convElement);
              // Apply hide archived setting to newly added conversations
              this.applyHideArchivedToConversation(convElement);
              // Cancel pending removal for this conversation (it's back!)
              this.cancelPendingRemovalForElement(convElement);
            });
          }
        });
      });

      // 2. Handle removed conversations with safeguards
      // CRITICAL FIX: Prevent data loss when network disconnects or UI refreshes

      // Check 1: If offline, assume removals are due to network error
      if (!navigator.onLine) {
        this.debug('Network offline, ignoring conversation removals to prevent data loss');
        return;
      }

      // Check 2: Calculate total conversations being removed in this batch
      let totalRemovedCount = 0;
      const nodesWithRemovals: HTMLElement[] = [];

      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            const isConv = node.matches('[data-test-id="conversation"]');
            // Check if it contains conversations (e.g. a container was removed)
            const containedConvsCount = node.querySelectorAll(
              '[data-test-id="conversation"]',
            ).length;

            if (isConv) {
              totalRemovedCount++;
              nodesWithRemovals.push(node);
            } else if (containedConvsCount > 0) {
              totalRemovedCount += containedConvsCount;
              nodesWithRemovals.push(node);
            }
          }
        });
      });

      // If no conversations were removed, we're done
      if (totalRemovedCount === 0) return;

      // Check 3: If multiple conversations are removed at once, it's likely a UI refresh/clear
      // Users typically delete conversations one by one.
      // EXCEPTION: If we are in multi-select mode, the user might be performing a bulk delete.
      if (totalRemovedCount > 1 && !this.isMultiSelectMode) {
        this.debugWarn(
          `Ignored bulk removal of ${totalRemovedCount} conversations - likely UI refresh`,
        );
        return;
      }

      // NEW: Instead of immediately removing, schedule a delayed check
      // This prevents false positives when Gemini temporarily removes/re-adds DOM elements during UI updates
      nodesWithRemovals.forEach((node) => {
        const conversations = node.matches('[data-test-id="conversation"]')
          ? [node]
          : Array.from(node.querySelectorAll('[data-test-id="conversation"]'));

        conversations.forEach((conv) => {
          // Extract conversation ID from the removed element
          const conversationId = this.extractConversationIdFromElement(conv);

          if (conversationId) {
            this.debug('Detected potential conversation removal:', conversationId);
            // Schedule delayed removal check
            this.scheduleConversationRemovalCheck(conversationId);
          }
        });
      });
    });

    this.conversationObserver.observe(this.sidebarContainer, {
      childList: true,
      subtree: true,
    });
  }

  /**
   * Setup observer to monitor sidebar open/close state
   * Hides folder container when sidebar is collapsed for better UX
   */
  private setupSideNavObserver(): void {
    const appRoot = document.querySelector('#app-root');
    if (!appRoot) {
      this.debugWarn('Could not find #app-root element for sidebar monitoring');
      return;
    }

    this.sideNavObserver = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          this.updateVisibilityBasedOnSideNav();
        }
      });
    });

    this.sideNavObserver.observe(appRoot, {
      attributes: true,
      attributeFilter: ['class'],
    });

    this.debug('Side nav observer setup complete');
  }

  /**
   * Check if sidebar is open and update folder container visibility
   * Sidebar is considered open when #app-root has 'side-nav-open' class
   */
  private updateVisibilityBasedOnSideNav(): void {
    const appRoot = document.querySelector('#app-root');
    if (!appRoot) return;

    const isSideNavOpen = appRoot.classList.contains('side-nav-open');

    // Check if containerElement exists AND is still in the DOM
    // During screen resize (e.g., split-screen to fullscreen), Gemini may re-render the sidebar DOM,
    // causing containerElement to become detached from the DOM tree
    if (!this.containerElement || !document.body.contains(this.containerElement)) {
      if (isSideNavOpen) {
        this.debug('Container element not in DOM, reinitializing folder UI');
        // Reinitialize the entire folder UI asynchronously
        // This ensures sidebarContainer and recentSection are also re-found
        this.reinitializeFolderUI();
      }
      return;
    }

    // Also check if sidebarContainer is still valid
    if (!this.sidebarContainer || !document.body.contains(this.sidebarContainer)) {
      if (isSideNavOpen) {
        this.debug('Sidebar container not in DOM, reinitializing folder UI');
        this.reinitializeFolderUI();
      }
      return;
    }

    if (isSideNavOpen) {
      this.containerElement.style.display = '';
      this.debug('Sidebar open - showing folder container');
    } else {
      this.containerElement.style.display = 'none';
      this.debug('Sidebar closed - hiding folder container');
    }
  }

  /**
   * Reinitialize folder UI when DOM elements become detached
   * This can happen during window resize or split-screen operations
   */
  private reinitializeFolderUI(): void {
    if (this.reinitializePromise) {
      this.debug('Reinitialization already in progress, skipping duplicate request');
      return;
    }

    this.reinitializePromise = (async () => {
      this.debug('Reinitializing folder UI...');

      // Execute general cleanup tasks first (including event listeners)
      this.cleanupTasks.forEach((task) => task());
      this.cleanupTasks = [];

      // Clean up observers/listeners tied to stale DOM nodes
      if (this.sideNavObserver) {
        this.sideNavObserver.disconnect();
        this.sideNavObserver = null;
      }

      if (this.conversationObserver) {
        this.conversationObserver.disconnect();
        this.conversationObserver = null;
      }

      if (this.nativeMenuObserver) {
        this.nativeMenuObserver.disconnect();
        this.nativeMenuObserver = null;
      }

      if (this.routeChangeCleanup) {
        try {
          this.routeChangeCleanup();
        } catch (error) {
          this.debugWarn('Route change cleanup during reinit failed:', error);
        }
        this.routeChangeCleanup = null;
      }

      if (this.sidebarClickListener && this.sidebarContainer) {
        try {
          this.sidebarContainer.removeEventListener('click', this.sidebarClickListener, true);
        } catch (error) {
          this.debugWarn('Sidebar click listener cleanup failed:', error);
        }
        this.sidebarClickListener = null;
      }

      if (this.containerElement?.isConnected) {
        try {
          this.containerElement.remove();
        } catch (error) {
          this.debugWarn('Failed to remove existing folder container during reinit:', error);
        }
      }

      // Clear existing references so initialization starts from a clean slate
      this.containerElement = null;
      this.sidebarContainer = null;
      this.recentSection = null;

      await this.initializeFolderUI();
    })()
      .catch((error) => {
        this.debugWarn('Failed to reinitialize folder UI:', error);
      })
      .finally(() => {
        this.reinitializePromise = null;
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
    saveBtn.innerHTML =
      '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">check</mat-icon>';
    saveBtn.title = this.t('pm_save');

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-folder-inline-btn gv-folder-inline-cancel';
    cancelBtn.innerHTML =
      '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">close</mat-icon>';
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
    saveBtn.innerHTML =
      '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">check</mat-icon>';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-folder-inline-btn gv-folder-inline-cancel';
    cancelBtn.innerHTML =
      '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">close</mat-icon>';

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
    // Create inline confirmation using safe DOM API
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'gv-folder-confirm-dialog';

    // Create message element safely
    const message = document.createElement('div');
    message.className = 'gv-folder-confirm-message';
    message.textContent = this.t('folder_delete_confirm'); // Safe: uses textContent

    // Create actions container
    const actions = document.createElement('div');
    actions.className = 'gv-folder-confirm-actions';

    // Create buttons safely
    const yesBtn = document.createElement('button');
    yesBtn.className = 'gv-folder-confirm-btn gv-folder-confirm-yes';
    yesBtn.textContent = this.t('pm_delete'); // Safe: uses textContent

    const noBtn = document.createElement('button');
    noBtn.className = 'gv-folder-confirm-btn gv-folder-confirm-no';
    noBtn.textContent = this.t('pm_cancel'); // Safe: uses textContent

    // Assemble the dialog
    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    confirmDialog.appendChild(message);
    confirmDialog.appendChild(actions);

    // Position near the folder
    const folderEl = this.containerElement?.querySelector(`[data-folder-id="${folderId}"]`);
    if (folderEl) {
      const rect = folderEl.getBoundingClientRect();
      confirmDialog.style.position = 'fixed';
      confirmDialog.style.top = `${rect.bottom + 4}px`;
      confirmDialog.style.left = `${rect.left}px`;
    }

    document.body.appendChild(confirmDialog);

    // Cleanup function
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

  private togglePinFolder(folderId: string): void {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    folder.pinned = !folder.pinned;
    folder.updatedAt = Date.now();
    this.saveData();
    this.refresh();
  }

  /**
   * Sort folders with pinned folders first, then by name using localized collation
   */
  private sortFolders(folders: Folder[]): Folder[] {
    return [...folders].sort((a, b) => {
      // Pinned folders always come first
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;

      // Within the same pinned state, sort by name using localized comparison
      return a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    });
  }

  private sortConversations(conversations: ConversationReference[]): ConversationReference[] {
    return [...conversations].sort((a, b) => {
      // Starred conversations always come first
      if (a.starred && !b.starred) return -1;
      if (!a.starred && b.starred) return 1;

      // Within the same starred state, sort by addedAt (newest first)
      return b.addedAt - a.addedAt;
    });
  }

  private addConversationToFolder(
    folderId: string,
    dragData: DragData & { sourceFolderId?: string },
  ): void {
    this.debug('Adding conversation to folder:', {
      folderId,
      dragData,
    });

    if (!this.data.folderContents[folderId]) {
      this.data.folderContents[folderId] = [];
    }

    // Check if conversation is already in this folder
    const exists = this.data.folderContents[folderId].some(
      (c) => c.conversationId === dragData.conversationId,
    );

    if (exists) {
      this.debug('Conversation already in folder:', dragData.conversationId);
      this.debug('Existing conversations:', this.data.folderContents[folderId]);
      return;
    }

    const conv: ConversationReference = {
      conversationId: dragData.conversationId!,
      title: dragData.title,
      url: dragData.url!,
      addedAt: Date.now(),
      isGem: dragData.isGem,
      gemId: dragData.gemId,
    };

    this.data.folderContents[folderId].push(conv);
    this.debug('Conversation added. Total in folder:', this.data.folderContents[folderId].length);

    // If this was dragged from another folder, remove it from the source
    if (dragData.sourceFolderId && dragData.sourceFolderId !== folderId) {
      this.debug('Moving from folder:', dragData.sourceFolderId);
      this.removeConversationFromFolder(dragData.sourceFolderId, dragData.conversationId!);
      // Note: removeConversationFromFolder calls saveData() and refresh(), so we don't need to call them again
      return;
    }

    // Save immediately before refresh to persist data
    this.saveData();
    this.refresh();
  }

  // Batch add conversations to folder (for multi-select support)
  private addConversationsToFolder(
    folderId: string,
    conversations: ConversationReference[],
    sourceFolderId?: string,
  ): void {
    this.debug('Adding multiple conversations to folder:', {
      folderId,
      count: conversations.length,
      sourceFolderId,
    });

    if (!this.data.folderContents[folderId]) {
      this.data.folderContents[folderId] = [];
    }

    let addedCount = 0;
    const conversationsToRemove: string[] = [];

    conversations.forEach((conv) => {
      // Check if conversation is already in this folder
      const exists = this.data.folderContents[folderId].some(
        (c) => c.conversationId === conv.conversationId,
      );

      if (!exists) {
        // Create a copy with updated timestamp
        const newConv: ConversationReference = {
          ...conv,
          addedAt: Date.now(),
        };

        this.data.folderContents[folderId].push(newConv);
        addedCount++;

        // Track conversations to remove from source folder
        if (sourceFolderId && sourceFolderId !== folderId) {
          conversationsToRemove.push(conv.conversationId);
        }
      }
    });

    this.debug(
      `Added ${addedCount} conversations. Total in folder:`,
      this.data.folderContents[folderId].length,
    );

    // Remove from source folder if moving
    if (sourceFolderId && sourceFolderId !== folderId && conversationsToRemove.length > 0) {
      this.debug('Removing conversations from source folder:', sourceFolderId);
      conversationsToRemove.forEach((convId) => {
        this.data.folderContents[sourceFolderId] = this.data.folderContents[sourceFolderId].filter(
          (c) => c.conversationId !== convId,
        );
      });
    }

    // Save immediately before refresh to persist data
    this.saveData();
    this.refresh();
  }

  private addFolderToFolder(targetFolderId: string, dragData: DragData): void {
    const draggedFolderId = dragData.folderId;
    if (!draggedFolderId) return;

    this.debug('Moving folder to folder:', {
      draggedFolderId,
      targetFolderId,
    });

    // Prevent dropping a folder onto itself
    if (draggedFolderId === targetFolderId) {
      this.debug('Cannot drop folder onto itself');
      return;
    }

    // Prevent dropping a folder onto its descendant (would create a cycle)
    if (this.isFolderDescendant(targetFolderId, draggedFolderId)) {
      this.debug('Cannot drop folder onto its descendant');
      return;
    }

    // Find the dragged folder
    const draggedFolder = this.data.folders.find((f) => f.id === draggedFolderId);
    if (!draggedFolder) return;

    // Update the parent
    draggedFolder.parentId = targetFolderId;
    draggedFolder.updatedAt = Date.now();

    this.saveData();
    this.refresh();
  }

  private moveFolderToRoot(dragData: DragData): void {
    const draggedFolderId = dragData.folderId;
    if (!draggedFolderId) return;

    this.debug('Moving folder to root level:', draggedFolderId);

    // Find the dragged folder
    const draggedFolder = this.data.folders.find((f) => f.id === draggedFolderId);
    if (!draggedFolder) return;

    // If already at root level, no need to do anything
    if (draggedFolder.parentId === null) {
      this.debug('Folder is already at root level');
      return;
    }

    // Update the parent to null (root level)
    draggedFolder.parentId = null;
    draggedFolder.updatedAt = Date.now();

    this.saveData();
    this.refresh();
  }

  private isFolderDescendant(folderId: string, potentialAncestorId: string): boolean {
    // Check if potentialAncestorId is an ancestor of folderId
    let currentId: string | null = folderId;
    while (currentId) {
      if (currentId === potentialAncestorId) {
        return true;
      }
      const folder = this.data.folders.find((f) => f.id === currentId);
      currentId = folder?.parentId || null;
    }
    return false;
  }

  private toggleConversationStar(folderId: string, conversationId: string): void {
    const conversations = this.data.folderContents[folderId];
    if (!conversations) return;

    const conv = conversations.find((c) => c.conversationId === conversationId);
    if (!conv) return;

    // Toggle starred state
    conv.starred = !conv.starred;

    // Save data
    this.saveData();

    // Refresh the folder UI to update the star icon and re-sort
    this.refresh();

    this.debug('Toggled star for conversation:', conversationId, 'starred:', conv.starred);
  }

  private confirmRemoveConversation(
    folderId: string,
    conversationId: string,
    title: string,
    event: MouseEvent,
  ): void {
    // Create inline confirmation dialog using safe DOM API
    const confirmDialog = document.createElement('div');
    confirmDialog.className = 'gv-folder-confirm-dialog';

    // Create message element safely with user-provided title
    const message = document.createElement('div');
    message.className = 'gv-folder-confirm-message';
    // Safe: textContent prevents XSS even with user-controlled title
    message.textContent = this.t('folder_remove_conversation_confirm').replace('{title}', title);

    // Create actions container
    const actions = document.createElement('div');
    actions.className = 'gv-folder-confirm-actions';

    // Create buttons safely
    const yesBtn = document.createElement('button');
    yesBtn.className = 'gv-folder-confirm-btn gv-folder-confirm-yes';
    yesBtn.textContent = this.t('pm_delete'); // Safe: uses textContent

    const noBtn = document.createElement('button');
    noBtn.className = 'gv-folder-confirm-btn gv-folder-confirm-no';
    noBtn.textContent = this.t('pm_cancel'); // Safe: uses textContent

    // Assemble the dialog
    actions.appendChild(yesBtn);
    actions.appendChild(noBtn);
    confirmDialog.appendChild(message);
    confirmDialog.appendChild(actions);

    // Position near the clicked element
    const rect = (event.target as HTMLElement).getBoundingClientRect();
    confirmDialog.style.position = 'fixed';
    confirmDialog.style.top = `${rect.bottom + 4}px`;
    confirmDialog.style.left = `${Math.min(rect.left, window.innerWidth - 280)}px`;

    document.body.appendChild(confirmDialog);

    // Cleanup function
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
      (c) => c.conversationId !== conversationId,
    );

    this.saveData();
    this.refresh();
  }

  private batchDeleteConversations(): void {
    if (!this.multiSelectFolderId || this.selectedConversations.size === 0) return;

    const count = this.selectedConversations.size;
    const confirmed = confirm(
      `Delete ${count} selected conversation${count > 1 ? 's' : ''} from this folder?`,
    );

    if (!confirmed) return;

    // Remove all selected conversations from the folder
    const folderId = this.multiSelectFolderId;
    if (!this.data.folderContents[folderId]) return;

    this.data.folderContents[folderId] = this.data.folderContents[folderId].filter(
      (c) => !this.selectedConversations.has(c.conversationId),
    );

    this.saveData();

    // Exit multi-select mode and refresh
    this.exitMultiSelectMode();
    this.refresh();

    this.debug(`Batch deleted ${count} conversations from folder ${folderId}`);
  }

  /**
   * Batch delete native Gemini conversations by simulating user clicks
   * This triggers the actual deletion on Gemini's servers
   */
  private async batchDeleteNativeConversations(): Promise<void> {
    if (this.batchDeleteInProgress) {
      this.debug('Batch delete already in progress');
      return;
    }

    const count = this.selectedConversations.size;
    if (count === 0) return;

    // Show confirmation dialog
    const confirmMessage = this.t('batch_delete_confirm').replace('{count}', String(count));
    const confirmed = confirm(confirmMessage);
    if (!confirmed) return;

    this.batchDeleteInProgress = true;
    const conversationIds = Array.from(this.selectedConversations);
    let successCount = 0;
    let failedCount = 0;

    try {
      // Show progress indicator
      this.showBatchDeleteProgress(0, count);

      for (let i = 0; i < conversationIds.length; i++) {
        const conversationId = conversationIds[i];
        this.debug(`Deleting conversation ${i + 1}/${count}: ${conversationId}`);

        // Update progress
        this.updateBatchDeleteProgress(i + 1, count);

        try {
          const success = await this.triggerNativeDeleteForConversation(conversationId);
          if (success) {
            successCount++;
          } else {
            failedCount++;
            this.debugWarn(`Failed to delete conversation: ${conversationId}`);
          }
        } catch (error) {
          failedCount++;
          console.error(`[FolderManager] Error deleting conversation ${conversationId}:`, error);
        }

        // Add delay between deletions to avoid rate limiting
        if (i < conversationIds.length - 1) {
          await this.delay(this.BATCH_DELETE_CONFIG.DELAY_BETWEEN_DELETIONS);
        }
      }

      // Hide progress indicator
      this.hideBatchDeleteProgress();

      // Show result summary
      if (failedCount === 0) {
        const successMessage = this.t('batch_delete_success').replace(
          '{count}',
          String(successCount),
        );
        this.showNotification(successMessage, 'success');
      } else {
        const partialMessage = this.t('batch_delete_partial')
          .replace('{success}', String(successCount))
          .replace('{failed}', String(failedCount));
        this.showNotification(partialMessage, 'info');
      }

      // Exit multi-select mode
      this.exitMultiSelectMode();

      // Refresh page after deletion
      if (successCount > 0) {
        this.debug('Refreshing page after batch delete');
        setTimeout(() => {
          window.location.reload();
        }, this.BATCH_DELETE_CONFIG.PAGE_REFRESH_DELAY);
      }
    } finally {
      this.batchDeleteInProgress = false;
    }
  }

  /**
   * Trigger native delete for a single conversation by simulating UI interactions
   */
  private async triggerNativeDeleteForConversation(conversationId: string): Promise<boolean> {
    try {
      // Step 1: Find the conversation element in the sidebar
      const conversationEl = this.findNativeConversationElement(conversationId);
      if (!conversationEl) {
        this.debugWarn(`Could not find conversation element for: ${conversationId}`);
        return false;
      }

      // Step 2: Find and click the more options button
      const moreButton = await this.findAndClickMoreButton(conversationEl);
      if (!moreButton) {
        this.debugWarn(`Could not find more button for: ${conversationId}`);
        return false;
      }

      // Wait for menu to appear
      await this.delay(this.BATCH_DELETE_CONFIG.MENU_APPEAR_DELAY);

      // Step 3: Find and click the delete button in the menu
      const deleteSuccess = await this.waitForDeleteButtonAndClick();
      if (!deleteSuccess) {
        this.debugWarn(`Could not click delete button for: ${conversationId}`);
        // Try to close the menu by clicking the backdrop
        this.clickBackdropToCloseMenu();
        return false;
      }

      // Wait for confirmation dialog (if any)
      await this.delay(this.BATCH_DELETE_CONFIG.DIALOG_APPEAR_DELAY);

      // Step 4: Confirm deletion if confirmation dialog appears
      await this.confirmDeleteIfNeeded();

      // Wait for deletion to complete
      await this.delay(this.BATCH_DELETE_CONFIG.DELETION_COMPLETE_DELAY);

      return true;
    } catch (error) {
      console.error(`[FolderManager] Error in triggerNativeDeleteForConversation:`, error);
      return false;
    }
  }

  /**
   * Find native conversation element by conversation ID
   */
  private findNativeConversationElement(conversationId: string): HTMLElement | null {
    // Try multiple strategies to find the conversation
    const allConversations = this.sidebarContainer?.querySelectorAll(
      '[data-test-id="conversation"]',
    );
    if (!allConversations) return null;

    for (const conv of allConversations) {
      const id = this.extractConversationId(conv as HTMLElement);
      if (id === conversationId) {
        return conv as HTMLElement;
      }
    }

    return null;
  }

  /**
   * Find and click the more options button for a conversation
   */
  private async findAndClickMoreButton(conversationEl: HTMLElement): Promise<HTMLElement | null> {
    // The more button might be in the actions container which is a sibling
    let moreButton: HTMLElement | null = null;

    // Strategy 1: Look for actions container as a sibling
    const parent = conversationEl.parentElement;
    if (parent) {
      const actionsContainer = parent.querySelector('.conversation-actions-container');
      if (actionsContainer) {
        moreButton = actionsContainer.querySelector(
          '[data-test-id="actions-menu-button"]',
        ) as HTMLElement;
      }
    }

    // Strategy 2: Look within the conversation element
    if (!moreButton) {
      moreButton = conversationEl.querySelector(
        '[data-test-id="actions-menu-button"]',
      ) as HTMLElement;
    }

    // Strategy 3: Look for any visible button with the actions-menu-button test id near this element
    if (!moreButton) {
      // Find the closest list item that contains both the conversation and actions
      const listItem = conversationEl.closest('li');
      if (listItem) {
        moreButton = listItem.querySelector('[data-test-id="actions-menu-button"]') as HTMLElement;
      }
    }

    if (moreButton) {
      moreButton.click();
      this.debug('Clicked more button');
      return moreButton;
    }

    return null;
  }

  /**
   * Wait for delete button to appear in the menu and click it
   * Uses multiple strategies to find the delete button for resilience to UI changes
   */
  private async waitForDeleteButtonAndClick(): Promise<boolean> {
    const maxWaitTime = this.BATCH_DELETE_CONFIG.MAX_BUTTON_WAIT_TIME;
    const checkInterval = this.BATCH_DELETE_CONFIG.BUTTON_CHECK_INTERVAL;
    let elapsed = 0;

    const keywords = this.getDeleteKeywords();

    while (elapsed < maxWaitTime) {
      // Strategy 1: Look for delete button by data-test-id (primary method)
      const deleteByTestId = document.querySelector(
        '[data-test-id="delete-button"]',
      ) as HTMLElement;
      if (deleteByTestId && this.isVisibleElement(deleteByTestId)) {
        deleteByTestId.click();
        this.debug('Clicked delete button (by test-id)');
        return true;
      }

      // Strategy 2: Look for menu items containing delete text (supports translations)
      const menuItems = document.querySelectorAll(
        '.cdk-overlay-container button, ' +
          '.cdk-overlay-container [role="menuitem"], ' +
          '.mat-mdc-menu-content button, ' +
          '.mat-menu-content button',
      );

      for (const item of menuItems) {
        if (!this.isVisibleElement(item as HTMLElement)) continue;

        const text = item.textContent?.toLowerCase().trim() || '';
        // Match keywords from i18n
        if (
          text &&
          keywords.some(
            (keyword: string) => text === keyword || (text.includes(keyword) && text.length < 20),
          )
        ) {
          (item as HTMLElement).click();
          this.debug('Clicked delete button (by text):', text);
          return true;
        }
      }

      // Strategy 3: Look for button with delete icon (mat-icon containing 'delete')
      const deleteIcons = document.querySelectorAll(
        '.cdk-overlay-container mat-icon, .cdk-overlay-container .material-icons',
      );

      for (const icon of deleteIcons) {
        const iconText = icon.textContent?.toLowerCase().trim() || '';
        if (
          iconText === 'delete' ||
          iconText === 'delete_forever' ||
          iconText === 'delete_outline'
        ) {
          // Find the parent button and click it
          const parentButton = icon.closest('button, [role="menuitem"]') as HTMLElement;
          if (parentButton && this.isVisibleElement(parentButton)) {
            parentButton.click();
            this.debug('Clicked delete button (by icon)');
            return true;
          }
        }
      }

      await this.delay(checkInterval);
      elapsed += checkInterval;
    }

    return false;
  }

  /**
   * Check for and confirm the delete confirmation dialog if it appears
   */
  private async confirmDeleteIfNeeded(): Promise<void> {
    // Look for confirmation dialog buttons
    // Gemini typically uses a dialog with confirm/cancel buttons
    const maxWaitTime = this.BATCH_DELETE_CONFIG.MAX_BUTTON_WAIT_TIME;
    const checkInterval = this.BATCH_DELETE_CONFIG.BUTTON_CHECK_INTERVAL;
    let elapsed = 0;

    const keywords = this.getDeleteKeywords();

    while (elapsed < maxWaitTime) {
      // Strategy 1: Look for button with data-test-id containing "confirm" or "delete"
      const confirmByTestId = document.querySelector(
        '[data-test-id*="confirm"], [data-test-id*="delete"]:not([data-test-id="delete-button"])',
      ) as HTMLElement;
      if (confirmByTestId && this.isVisibleElement(confirmByTestId)) {
        confirmByTestId.click();
        this.debug('Clicked confirmation button (by test-id)');
        return;
      }

      // Strategy 2: Look for primary/action buttons in dialogs
      const primaryButtons = document.querySelectorAll(`
        .mat-mdc-dialog-container button.mat-primary,
        .mat-mdc-dialog-container button.mat-accent,
        .mat-mdc-dialog-container .mat-mdc-dialog-actions button:last-child,
        .cdk-overlay-container .mat-mdc-dialog-actions button:last-child,
        .cdk-overlay-container button[color="primary"],
        .cdk-overlay-container button[color="warn"]
      `);

      for (const btn of primaryButtons) {
        if (this.isVisibleElement(btn as HTMLElement)) {
          const text = btn.textContent?.toLowerCase().trim() || '';
          // Match keywords from i18n
          if (
            text &&
            keywords.some((keyword: string) => text.includes(keyword) || text === keyword)
          ) {
            (btn as HTMLElement).click();
            this.debug('Clicked confirmation button (primary button):', text);
            return;
          }
        }
      }

      // Strategy 3: Look for any button in overlay with delete/confirm text
      const allOverlayButtons = document.querySelectorAll(
        '.cdk-overlay-container button, .mat-mdc-dialog-container button',
      );

      for (const btn of allOverlayButtons) {
        if (!this.isVisibleElement(btn as HTMLElement)) continue;

        const text = btn.textContent?.toLowerCase().trim() || '';
        // Be more specific - look for exact match or simple inclusion for keywords
        if (text && keywords.some((keyword: string) => text === keyword)) {
          (btn as HTMLElement).click();
          this.debug('Clicked confirmation button (overlay button):', text);
          return;
        }
      }

      // Strategy 4: Look for the second/right button in a two-button dialog (usually the confirm button)
      const dialogActions = document.querySelector(
        '.mat-mdc-dialog-actions, .cdk-overlay-container .mat-dialog-actions',
      );
      if (dialogActions) {
        const buttons = dialogActions.querySelectorAll('button');
        if (buttons.length >= 2) {
          // The last button is typically the confirm/destructive action
          const confirmBtn = buttons[buttons.length - 1] as HTMLElement;
          if (this.isVisibleElement(confirmBtn)) {
            confirmBtn.click();
            this.debug('Clicked last button in dialog actions');
            return;
          }
        }
      }

      await this.delay(checkInterval);
      elapsed += checkInterval;
    }

    // No confirmation dialog found, which is fine
    this.debug('No confirmation dialog detected after', maxWaitTime, 'ms');
  }

  /**
   * Get delete/confirm keywords from i18n settings to avoid hardcoding
   */
  private getDeleteKeywords(): string[] {
    const rawPatterns = this.t('batch_delete_match_patterns') || '';
    return rawPatterns
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter((s: string) => s.length > 0);
  }

  /**
   * Check if an element is visible
   */
  private isVisibleElement(el: HTMLElement): boolean {
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      el.offsetParent !== null
    );
  }

  /**
   * Click backdrop to close any open menu
   */
  private clickBackdropToCloseMenu(): void {
    const backdrop = document.querySelector('.cdk-overlay-backdrop') as HTMLElement;
    if (backdrop) {
      backdrop.click();
      this.debug('Clicked backdrop to close menu');
    }
  }

  /**
   * Show batch delete progress indicator
   */
  private showBatchDeleteProgress(current: number, total: number): void {
    // Remove existing progress element if any
    this.hideBatchDeleteProgress();

    const progress = document.createElement('div');
    progress.className = 'gv-batch-delete-progress';
    progress.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(32, 33, 36, 0.95);
      color: #e8eaed;
      padding: 16px 24px;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
      font-size: 14px;
    `;

    const spinner = document.createElement('div');
    spinner.style.cssText = `
      width: 20px;
      height: 20px;
      border: 2px solid #8ab4f8;
      border-top-color: transparent;
      border-radius: 50%;
      animation: gv-spin 1s linear infinite;
    `;

    // Add spinner animation if not already present
    if (!document.querySelector('#gv-batch-delete-styles')) {
      const style = document.createElement('style');
      style.id = 'gv-batch-delete-styles';
      style.textContent = `
        @keyframes gv-spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }

    const text = document.createElement('span');
    text.className = 'gv-batch-delete-progress-text';
    text.textContent = this.t('batch_delete_in_progress')
      .replace('{current}', String(current))
      .replace('{total}', String(total));

    progress.appendChild(spinner);
    progress.appendChild(text);
    document.body.appendChild(progress);

    this.batchDeleteProgressElement = progress;
  }

  /**
   * Update batch delete progress indicator
   */
  private updateBatchDeleteProgress(current: number, total: number): void {
    if (this.batchDeleteProgressElement) {
      const textEl = this.batchDeleteProgressElement.querySelector(
        '.gv-batch-delete-progress-text',
      );
      if (textEl) {
        textEl.textContent = this.t('batch_delete_in_progress')
          .replace('{current}', String(current))
          .replace('{total}', String(total));
      }
    }
  }

  /**
   * Hide batch delete progress indicator
   */
  private hideBatchDeleteProgress(): void {
    if (this.batchDeleteProgressElement) {
      this.batchDeleteProgressElement.remove();
      this.batchDeleteProgressElement = null;
    }
  }

  /**
   * Helper function to create a delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Multi-select helper methods
  private clearSelection(): void {
    this.selectedConversations.clear();
  }

  private selectConversation(conversationId: string): void {
    this.selectedConversations.add(conversationId);
  }

  private toggleConversationSelection(conversationId: string): void {
    if (this.selectedConversations.has(conversationId)) {
      this.selectedConversations.delete(conversationId);

      // Auto-exit multi-select mode when all selections are cleared
      if (this.selectedConversations.size === 0 && this.isMultiSelectMode) {
        this.exitMultiSelectMode();
        return;
      }
    } else {
      // Check if we've reached the maximum selection limit
      if (this.selectedConversations.size >= this.MAX_BATCH_DELETE_COUNT) {
        const message = this.t('batch_delete_limit_reached').replace(
          '{max}',
          String(this.MAX_BATCH_DELETE_COUNT),
        );
        this.showNotification(message, 'info');
        return;
      }
      this.selectedConversations.add(conversationId);
    }
  }

  private updateConversationSelectionUI(): void {
    // Only update UI for the source where multi-select was initiated
    if (this.multiSelectSource === 'folder') {
      // Only update folder conversation elements
      const allConvEls = this.containerElement?.querySelectorAll('.gv-folder-conversation');
      allConvEls?.forEach((el) => {
        const convId = (el as HTMLElement).dataset.conversationId;
        const elFolderId = (el as HTMLElement).dataset.folderId;

        // Only update conversations in the same folder where multi-select started
        if (convId && (!this.multiSelectFolderId || elFolderId === this.multiSelectFolderId)) {
          if (this.selectedConversations.has(convId)) {
            el.classList.add('gv-folder-conversation-selected');
          } else {
            el.classList.remove('gv-folder-conversation-selected');
          }
        }
      });
    } else if (this.multiSelectSource === 'native') {
      // Only update native conversation elements (Recent section)
      const nativeConvs = this.sidebarContainer?.querySelectorAll('[data-test-id="conversation"]');
      nativeConvs?.forEach((el) => {
        const convId = this.extractConversationId(el as HTMLElement);
        if (convId) {
          if (this.selectedConversations.has(convId)) {
            el.classList.add('gv-conversation-selected');
          } else {
            el.classList.remove('gv-conversation-selected');
          }
        }
      });
    }

    // Update the selection count
    this.updateMultiSelectModeUI();
  }

  private enterMultiSelectMode(
    initialConversationId?: string,
    source: 'folder' | 'native' = 'native',
    folderId?: string,
  ): void {
    this.debug('Entering multi-select mode', { source, folderId });
    this.isMultiSelectMode = true;
    this.multiSelectSource = source;
    this.multiSelectFolderId = folderId || null;

    // Select the conversation that triggered the long-press
    if (initialConversationId) {
      this.selectConversation(initialConversationId);
    }

    this.updateMultiSelectModeUI();
    this.updateConversationSelectionUI();

    // Add visual feedback (vibration on mobile)
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    // Add click-outside listener to exit multi-select mode
    this.setupOutsideClickHandler();
  }

  private exitMultiSelectMode(): void {
    this.debug('Exiting multi-select mode');
    this.isMultiSelectMode = false;
    this.multiSelectSource = null;
    this.multiSelectFolderId = null;

    // Remove click-outside listener
    this.removeOutsideClickHandler();

    // First update UI to remove selection styles
    this.updateConversationSelectionUI();

    // Then clear the selection set
    this.clearSelection();

    // Update mode UI
    this.updateMultiSelectModeUI();

    // Force cleanup of any remaining visual artifacts
    this.cleanupSelectionArtifacts();
  }

  /**
   * Setup a document-level click handler to exit multi-select mode when clicking outside the sidebar
   */
  private setupOutsideClickHandler(): void {
    // Remove any existing handler first
    this.removeOutsideClickHandler();

    this.outsideClickHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Check if click is inside the sidebar or folder container
      const isInsideSidebar = this.sidebarContainer?.contains(target);
      const isInsideFolderContainer = this.containerElement?.contains(target);

      // Check if click is on an overlay (menus, dialogs, etc.)
      const isOnOverlay = target.closest('.cdk-overlay-container, .mat-mdc-dialog-container');

      // If click is outside all relevant areas, exit multi-select mode
      if (!isInsideSidebar && !isInsideFolderContainer && !isOnOverlay) {
        this.debug('Click outside sidebar detected, exiting multi-select mode');
        this.exitMultiSelectMode();
      }
    };

    // Use setTimeout to avoid the current click event from triggering the handler
    setTimeout(() => {
      document.addEventListener('click', this.outsideClickHandler!, true);
    }, 0);
  }

  /**
   * Remove the outside click handler
   */
  private removeOutsideClickHandler(): void {
    if (this.outsideClickHandler) {
      document.removeEventListener('click', this.outsideClickHandler, true);
      this.outsideClickHandler = null;
    }
  }

  private cleanupSelectionArtifacts(): void {
    // Remove selection classes from all native conversations
    const nativeConvs = this.sidebarContainer?.querySelectorAll('[data-test-id="conversation"]');
    nativeConvs?.forEach((el) => {
      (el as HTMLElement).classList.remove('gv-conversation-selected');
      (el as HTMLElement).style.opacity = '1';
    });
    // Remove selection classes from all folder conversations
    const folderConvs = this.containerElement?.querySelectorAll('.gv-folder-conversation');
    folderConvs?.forEach((el) => {
      (el as HTMLElement).classList.remove('gv-folder-conversation-selected');
      (el as HTMLElement).style.opacity = '1';
    });

    // Restore active conversation highlight in folders
    // This ensures that the currently active conversation remains highlighted
    // after drag-and-drop or multi-select operations
    this.highlightActiveConversationInFolders();
  }

  /**
   * Provides visual feedback when user attempts to select conversations from different folders.
   * Uses a subtle shake animation to indicate invalid selection.
   *
   * @param element - The conversation element to apply feedback to
   *
   * Note: Uses animationend event instead of setTimeout to ensure cleanup happens
   * exactly when the CSS animation finishes, making it resilient to animation timing changes.
   */
  private showInvalidSelectionFeedback(element: HTMLElement): void {
    // Remove existing class (if any) to allow animation restart on rapid clicks
    element.classList.remove('gv-invalid-selection');

    // Force reflow to ensure animation restarts (see: CSS Triggers)
    void element.offsetWidth;

    // Add invalid selection class to trigger animation
    element.classList.add('gv-invalid-selection');

    // Listen for animation end to clean up the class automatically
    // Using { once: true } ensures the listener is removed after first invocation
    element.addEventListener(
      'animationend',
      () => {
        element.classList.remove('gv-invalid-selection');
      },
      { once: true },
    );

    // Optional: Haptic feedback on mobile devices
    if ('vibrate' in navigator) {
      navigator.vibrate([30, 20, 30]); // Two short vibrations
    }
  }

  private updateMultiSelectModeUI(): void {
    // Add or remove multi-select mode class from container
    if (this.isMultiSelectMode) {
      this.containerElement?.classList.add('gv-multi-select-mode');
    } else {
      this.containerElement?.classList.remove('gv-multi-select-mode');
    }

    // Update selection count in indicator
    const countElement = this.containerElement?.querySelector('[data-selection-count="true"]');
    if (countElement) {
      const count = this.selectedConversations.size;
      countElement.textContent = `${count} selected`;
    }

    // Update action buttons based on source
    const actionsContainer = this.containerElement?.querySelector(
      '[data-multi-select-actions="true"]',
    );
    if (actionsContainer && this.isMultiSelectMode) {
      actionsContainer.innerHTML = ''; // Clear existing buttons

      if (this.multiSelectSource === 'folder') {
        // Delete button for folder multi-select (removes from folder only)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'gv-multi-select-action-btn gv-multi-select-delete-btn';
        deleteBtn.innerHTML =
          '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">delete</mat-icon>';
        deleteBtn.title = this.t('batch_delete_button');
        deleteBtn.addEventListener('click', () => this.batchDeleteConversations());
        actionsContainer.appendChild(deleteBtn);
      } else if (this.multiSelectSource === 'native') {
        // Delete button for native multi-select (deletes from Gemini)
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'gv-multi-select-action-btn gv-multi-select-delete-btn';
        deleteBtn.innerHTML =
          '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">delete</mat-icon>';
        deleteBtn.title = this.t('batch_delete_button');
        deleteBtn.addEventListener('click', () => this.batchDeleteNativeConversations());
        actionsContainer.appendChild(deleteBtn);
      }

      // Exit button (always present)
      const exitBtn = document.createElement('button');
      exitBtn.className = 'gv-multi-select-action-btn gv-multi-select-exit-btn';
      exitBtn.innerHTML =
        '<mat-icon role="img" class="mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color" aria-hidden="true">close</mat-icon>';
      exitBtn.title = 'Exit multi-select mode';
      exitBtn.addEventListener('click', () => this.exitMultiSelectMode());
      actionsContainer.appendChild(exitBtn);
    } else if (actionsContainer) {
      actionsContainer.innerHTML = ''; // Clear buttons when exiting
    }
  }

  private getSelectedConversationsData(folderId: string): ConversationReference[] {
    const result: ConversationReference[] = [];

    // Collect from all folders since selection can span folders
    for (const fId in this.data.folderContents) {
      const conversations = this.data.folderContents[fId];
      conversations.forEach((conv) => {
        if (this.selectedConversations.has(conv.conversationId)) {
          result.push(conv);
        }
      });
    }

    return result;
  }

  private renameConversation(
    folderId: string,
    conversationId: string,
    titleElement: HTMLElement,
  ): void {
    // Get current title
    const conv = this.data.folderContents[folderId]?.find(
      (c) => c.conversationId === conversationId,
    );
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

    let finished = false;
    const cleanup = () => {
      try {
        input.removeEventListener('blur', onBlur);
      } catch (e) {
        this.debug('Failed to remove blur listener:', e);
      }
      try {
        input.removeEventListener('keydown', onKeyDown);
      } catch (e) {
        this.debug('Failed to remove keydown listener:', e);
      }
    };
    const finalize = (commit: boolean) => {
      if (finished) return;
      finished = true;
      cleanup();
      try {
        if (commit) {
          const newTitle = input.value.trim();
          if (newTitle && newTitle !== currentTitle) {
            conv.title = newTitle;
            conv.customTitle = true; // mark as manually renamed, don't auto-sync from native
            this.saveData();
          }
        }
      } catch (e) {
        this.debug('Failed to save renamed conversation:', e);
      }
      // Restore title element gracefully even if DOM re-rendered
      try {
        if (input.isConnected) input.remove();
      } catch (e) {
        this.debug('Failed to remove input:', e);
      }
      try {
        titleElement.style.display = '';
      } catch (e) {
        this.debug('Failed to restore title display:', e);
      }
      try {
        titleElement.textContent = conv.title;
      } catch (e) {
        this.debug('Failed to restore title text:', e);
      }
    };
    const onBlur = () => {
      // Defer finalize to let Angular/SPA navigation settle
      requestAnimationFrame(() => finalize(true));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        finalize(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        finalize(false);
      }
    };

    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeyDown);
  }

  private showFolderMenu(event: MouseEvent, folderId: string): void {
    event.stopPropagation();

    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    // Create context menu
    const menu = document.createElement('div');
    menu.className = 'gv-folder-menu';
    menu.style.position = 'fixed';
    menu.style.left = `${event.clientX}px`;
    menu.style.top = `${event.clientY}px`;

    const menuItems = [
      {
        label: folder.pinned ? this.t('folder_unpin') : this.t('folder_pin'),
        action: () => this.togglePinFolder(folderId),
      },
      { label: this.t('folder_create_subfolder'), action: () => this.createFolder(folderId) },
      { label: this.t('folder_rename'), action: () => this.renameFolder(folderId) },
      { label: this.t('folder_change_color'), action: () => this.showColorPicker(folderId, event) },
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

  /**
   * Show color picker dialog for a folder
   * @param folderId The folder ID to change color
   * @param sourceEvent The source mouse event (for positioning)
   */
  private showColorPicker(
    folderId: string,
    sourceEvent: MouseEvent,
    allowToggle: boolean = true,
  ): void {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    // If a color picker is already open, close it first
    if (this.activeColorPicker) {
      const wasSameFolder = this.activeColorPickerFolderId === folderId;
      this.activeColorPicker.remove();
      // Clean up the old event listener to prevent memory leak
      if (this.activeColorPickerCloseHandler) {
        document.removeEventListener('click', this.activeColorPickerCloseHandler);
        this.activeColorPickerCloseHandler = null;
      }
      this.activeColorPicker = null;
      this.activeColorPickerFolderId = null;
      // If clicking the same folder icon again and toggle is allowed, just close the picker
      if (allowToggle && wasSameFolder) {
        return;
      }
    }

    // Create color picker dialog
    const dialog = document.createElement('div');
    dialog.className = 'gv-color-picker-dialog';

    // Position near the menu click (slightly offset to avoid overlap)
    dialog.style.position = 'fixed';
    dialog.style.left = `${sourceEvent.clientX + 10}px`;
    dialog.style.top = `${sourceEvent.clientY}px`;
    dialog.style.zIndex = '10001';

    // Create color options
    FOLDER_COLORS.forEach((colorConfig) => {
      const colorBtn = document.createElement('button');
      colorBtn.className = 'gv-color-picker-item';
      colorBtn.title = this.t(colorConfig.nameKey);

      // Apply color based on current theme
      const colorValue = getFolderColor(colorConfig.id, isDarkMode());
      colorBtn.style.backgroundColor = colorValue;

      // Mark current color as selected
      if (folder.color === colorConfig.id || (!folder.color && colorConfig.id === 'default')) {
        colorBtn.classList.add('selected');
      }

      colorBtn.addEventListener('click', () => {
        this.changeFolderColor(folderId, colorConfig.id);
        dialog.remove();
        if (this.activeColorPickerCloseHandler) {
          document.removeEventListener('click', this.activeColorPickerCloseHandler);
          this.activeColorPickerCloseHandler = null;
        }
        this.activeColorPicker = null;
        this.activeColorPickerFolderId = null;
      });

      dialog.appendChild(colorBtn);
    });

    document.body.appendChild(dialog);
    this.activeColorPicker = dialog;
    this.activeColorPickerFolderId = folderId;

    // Close dialog on click outside
    const closeDialog = (e: MouseEvent) => {
      if (!dialog.contains(e.target as Node)) {
        dialog.remove();
        this.activeColorPicker = null;
        this.activeColorPickerFolderId = null;
        if (this.activeColorPickerCloseHandler) {
          document.removeEventListener('click', this.activeColorPickerCloseHandler);
          this.activeColorPickerCloseHandler = null;
        }
      }
    };
    this.activeColorPickerCloseHandler = closeDialog;
    setTimeout(() => document.addEventListener('click', closeDialog), 0);
  }

  /**
   * Change folder color
   * @param folderId The folder ID to change
   * @param colorId The new color ID
   */
  private changeFolderColor(folderId: string, colorId: string): void {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    folder.color = colorId;
    folder.updatedAt = Date.now();

    this.saveData();
    this.refresh();
  }

  private showMoveToFolderDialog(
    conversationId: string,
    conversationTitle: string,
    url: string,
    isGem?: boolean,
    gemId?: string,
  ): void {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'gv-folder-dialog-overlay';

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'gv-folder-dialog';

    // Dialog title
    const dialogTitle = document.createElement('div');
    dialogTitle.className = 'gv-folder-dialog-title';
    dialogTitle.textContent = this.t('conversation_move_to_folder_title');

    // Folder list
    const folderList = document.createElement('div');
    folderList.className = 'gv-folder-dialog-list';

    // Helper function to add folder options recursively
    const addFolderOptions = (parentId: string | null, level: number = 0) => {
      const folders = this.data.folders.filter((f) => f.parentId === parentId);
      const sortedFolders = this.sortFolders(folders); // Apply same sorting as sidebar
      sortedFolders.forEach((folder) => {
        const folderItem = document.createElement('button');
        folderItem.className = 'gv-folder-dialog-item';
        folderItem.style.paddingLeft = `${level * 16 + 12}px`;

        // Folder icon
        const icon = document.createElement('mat-icon');
        icon.className = 'mat-icon notranslate google-symbols mat-ligature-font mat-icon-no-color';
        icon.setAttribute('role', 'img');
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'folder';

        // Folder name
        const name = document.createElement('span');
        name.textContent = folder.name;

        folderItem.appendChild(icon);
        folderItem.appendChild(name);

        folderItem.addEventListener('click', () => {
          this.addConversationToFolderFromNative(
            folder.id,
            conversationId,
            conversationTitle,
            url,
            isGem,
            gemId,
          );
          overlay.remove();
        });

        folderList.appendChild(folderItem);

        // Add subfolders recursively
        addFolderOptions(folder.id, level + 1);
      });
    };

    // Add root folders and their children
    addFolderOptions(null);

    // Cancel button
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-folder-dialog-cancel';
    cancelBtn.textContent = this.t('pm_cancel');
    cancelBtn.addEventListener('click', () => overlay.remove());

    // Assemble dialog
    dialog.appendChild(dialogTitle);
    dialog.appendChild(folderList);
    dialog.appendChild(cancelBtn);
    overlay.appendChild(dialog);

    // Add to body
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  private moveConversationToFolder(
    sourceFolderId: string,
    targetFolderId: string,
    conv: ConversationReference,
  ): void {
    // Remove from source folder
    if (this.data.folderContents[sourceFolderId]) {
      this.data.folderContents[sourceFolderId] = this.data.folderContents[sourceFolderId].filter(
        (c) => c.conversationId !== conv.conversationId,
      );
    }

    // Add to target folder
    if (!this.data.folderContents[targetFolderId]) {
      this.data.folderContents[targetFolderId] = [];
    }

    // Check if conversation already exists in target folder
    const existingIndex = this.data.folderContents[targetFolderId].findIndex(
      (c) => c.conversationId === conv.conversationId,
    );

    if (existingIndex === -1) {
      // Add with updated timestamp
      this.data.folderContents[targetFolderId].push({
        ...conv,
        addedAt: Date.now(),
      });
    }

    this.saveData();
    this.refresh();
  }

  private addConversationToFolderFromNative(
    folderId: string,
    conversationId: string,
    title: string,
    url: string,
    isGem?: boolean,
    gemId?: string,
  ): void {
    // Add to folder
    if (!this.data.folderContents[folderId]) {
      this.data.folderContents[folderId] = [];
    }

    // Check if conversation already exists in folder
    const existingIndex = this.data.folderContents[folderId].findIndex(
      (c) => c.conversationId === conversationId,
    );

    if (existingIndex === -1) {
      // Add new conversation
      this.data.folderContents[folderId].push({
        conversationId,
        title,
        url,
        addedAt: Date.now(),
        isGem,
        gemId,
      });
    }

    this.saveData();
    this.refresh();
  }

  private setupNativeConversationMenuObserver(): void {
    // Disconnect existing observer if any
    if (this.nativeMenuObserver) {
      this.nativeMenuObserver.disconnect();
    }

    // Observe the document for menu appearance and disappearance
    this.nativeMenuObserver = new MutationObserver((mutations) => {
      if (this.isDestroyed) return;
      mutations.forEach((mutation) => {
        // Handle added nodes (menu opening)
        mutation.addedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Check if this is the native conversation menu
            const menuContent = node.querySelector('.mat-mdc-menu-content');
            if (menuContent && !menuContent.querySelector('.gv-move-to-folder-btn')) {
              // Check if this is a conversation menu (not model selection menu or other menus)
              if (this.isConversationMenu(node)) {
                this.debug('Observer: conversation menu detected, preparing to inject');
                this.injectMoveToFolderButton(menuContent as HTMLElement);
              } else {
                this.debug('Observer: non-conversation menu detected, skipping injection');
              }
            } else if (menuContent) {
              this.debug('Observer: menu content detected but button already present');
            }
          }
        });

        // Handle removed nodes (menu closing)
        mutation.removedNodes.forEach((node) => {
          if (node instanceof HTMLElement) {
            // Check if a menu panel was removed
            const isMenuPanel =
              node.classList?.contains('mat-mdc-menu-panel') ||
              node.querySelector('.mat-mdc-menu-panel');
            if (isMenuPanel) {
              this.debug('Observer: menu closed, clearing conversation state');
              this.lastClickedConversation = null;
              this.lastClickedConversationInfo = null;
            }
          }
        });
      });
    });

    this.nativeMenuObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  private isConversationMenu(menuElement: HTMLElement): boolean {
    // Check if this is NOT a model selection menu or other non-conversation menus
    const menuPanel = menuElement.querySelector('.mat-mdc-menu-panel');

    // Exclude model selection menu (has gds-mode-switch-menu class)
    if (menuPanel?.classList.contains('gds-mode-switch-menu')) {
      this.debug('isConversationMenu: detected model selection menu');
      return false;
    }

    // Exclude menus with bard-mode-list-button (model selection)
    if (menuElement.querySelector('.bard-mode-list-button')) {
      this.debug('isConversationMenu: detected bard mode list menu');
      return false;
    }

    // Check for conversation-specific elements
    const menuContent = menuElement.querySelector('.mat-mdc-menu-content');
    if (!menuContent) return false;

    // Look for conversation menu indicators:
    // 1. Pin button (common in conversation menus)
    // 2. Rename/delete conversation buttons
    // 3. Share conversation button
    const hasPinButton = menuContent.querySelector('[data-test-id="pin-button"]');
    const hasRenameButton = menuContent.querySelector('[data-test-id="rename-button"]');
    const hasShareButton = menuContent.querySelector('[data-test-id="share-button"]');
    const hasDeleteButton = menuContent.querySelector('[data-test-id="delete-button"]');

    // If any conversation-specific button exists, it's a conversation menu
    if (hasPinButton || hasRenameButton || hasShareButton || hasDeleteButton) {
      this.debug('isConversationMenu: found conversation-specific buttons');
      return true;
    }

    // If we have a lastClickedConversation, we can assume it's a conversation menu
    if (this.lastClickedConversation) {
      this.debug('isConversationMenu: lastClickedConversation exists');
      return true;
    }

    // Default to false if we can't determine
    this.debug('isConversationMenu: could not determine menu type, defaulting to false');
    return false;
  }

  private injectMoveToFolderButton(menuContent: HTMLElement): void {
    this.debug('injectMoveToFolderButton: begin');

    // First, try to use pre-extracted conversation info (most reliable)
    let conversationId: string | null = null;
    let title: string | null = null;
    let url: string | null = null;

    if (this.lastClickedConversationInfo) {
      this.debug('Using pre-extracted conversation info');
      conversationId = this.lastClickedConversationInfo.id;
      title = this.lastClickedConversationInfo.title;
      url = this.lastClickedConversationInfo.url;
    } else {
      // Fallback: try to extract from conversation element
      this.debug('No pre-extracted info, falling back to extraction from element');
      const conversationEl = this.findConversationElementFromMenu();
      if (!conversationEl) {
        this.debug('No conversation element found from menu');
        return;
      }

      conversationId = this.extractNativeConversationId(conversationEl);
      title = this.extractNativeConversationTitle(conversationEl);
      url = this.extractNativeConversationUrl(conversationEl);
    }

    // Additional fallbacks when info is still missing
    if (!conversationId) {
      // Try to parse hex id from the overlay menu itself
      const hexFromMenu = this.extractHexIdFromMenu(menuContent);
      if (hexFromMenu) {
        conversationId = hexFromMenu;
        this.debug('injectMoveToFolderButton: using id from menu jslog', conversationId);
      } else if (this.lastClickedConversation) {
        // Try from jslog on the conversation element tree
        const hexFromJslog = this.extractHexIdFromJslog(this.lastClickedConversation);
        if (hexFromJslog) {
          conversationId = hexFromJslog;
          this.debug('injectMoveToFolderButton: using id from conversation jslog', conversationId);
        }
      }
    }

    // If URL is missing but we have an id, synthesize a best-effort URL
    if (!url && conversationId) {
      url = this.buildConversationUrlFromId(conversationId);
      this.debug('injectMoveToFolderButton: built fallback URL from id', url);
    }

    // Title fallback
    if ((!title || title.trim() === '') && this.lastClickedConversation) {
      title = this.extractFallbackTitle(this.lastClickedConversation) || 'Untitled';
      this.debug('injectMoveToFolderButton: using fallback title', title);
    }

    this.debug('Extracted conversation info:', { conversationId, title, url });

    if (!conversationId || !title || !url) {
      this.debugWarn('Missing conversation info:', { conversationId, title, url });
      return;
    }

    // Create the menu item
    const menuItem = document.createElement('button');
    menuItem.className = 'mat-mdc-menu-item mat-focus-indicator gv-move-to-folder-btn';
    menuItem.setAttribute('role', 'menuitem');
    menuItem.setAttribute('tabindex', '0');
    menuItem.setAttribute('aria-disabled', 'false');

    // Icon
    const icon = document.createElement('mat-icon');
    icon.className =
      'mat-icon notranslate gds-icon-l google-symbols mat-ligature-font mat-icon-no-color';
    icon.setAttribute('role', 'img');
    icon.setAttribute('fonticon', 'folder_open');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'folder_open';

    // Text
    const textSpan = document.createElement('span');
    textSpan.className = 'mat-mdc-menu-item-text';
    const innerSpan = document.createElement('span');
    innerSpan.className = 'gds-body-m';
    innerSpan.textContent = this.t('conversation_move_to_folder');
    textSpan.appendChild(innerSpan);

    // Ripple effect
    const ripple = document.createElement('div');
    ripple.className = 'mat-ripple mat-mdc-menu-ripple';
    ripple.setAttribute('matripple', '');

    menuItem.appendChild(icon);
    menuItem.appendChild(textSpan);
    menuItem.appendChild(ripple);

    // Add click handler
    menuItem.addEventListener('click', (e) => {
      e.stopPropagation();
      this.showMoveToFolderDialog(conversationId, title, url);

      // Close the native menu properly
      // Strategy 1: Simulate click on backdrop to trigger Angular's native cleanup
      // We look for the last backdrop as it's likely the one covering the screen for the current menu
      const backdrops = document.querySelectorAll('.cdk-overlay-backdrop');
      const backdrop = backdrops.length > 0 ? backdrops[backdrops.length - 1] : null;

      if (backdrop instanceof HTMLElement) {
        this.debug('Closing menu by clicking backdrop');
        backdrop.click();
      } else {
        // Strategy 2: Fallback manual cleanup if backdrop logic fails
        this.debug('Backdrop not found, performing manual cleanup');
        const menu = menuContent.closest('.mat-mdc-menu-panel');
        if (menu) {
          menu.remove();
        }

        // Also try to remove any orphaned backdrop that might be blocking the screen
        const orphanedBackdrop = document.querySelector('.cdk-overlay-backdrop');
        if (orphanedBackdrop) {
          orphanedBackdrop.remove();
        }
      }
    });

    // Insert after the pin button if it exists, otherwise insert at the beginning
    const pinButton = menuContent.querySelector('[data-test-id="pin-button"]');
    if (pinButton && pinButton.nextSibling) {
      this.debug('injectMoveToFolderButton: inserting after pin-button');
      menuContent.insertBefore(menuItem, pinButton.nextSibling);
    } else {
      this.debug('injectMoveToFolderButton: inserting at beginning of menu');
      menuContent.insertBefore(menuItem, menuContent.firstChild);
    }
  }

  private findConversationElementFromMenu(): HTMLElement | null {
    // Use the element captured on click
    if (this.lastClickedConversation) {
      this.debug('findConversationElementFromMenu: using lastClickedConversation');
      return this.lastClickedConversation;
    }

    // No fallback - if we don't have the clicked conversation element, we should not guess
    // The previous fallback logic using '.conversation-actions-container.selected' was incorrect
    // as it would select the currently focused conversation instead of the one user clicked
    this.debugWarn(
      'findConversationElementFromMenu: no conversation element found (lastClickedConversation is null)',
    );
    return null;
  }

  private lastClickedConversation: HTMLElement | null = null;
  private lastClickedConversationInfo: { id: string; title: string; url: string } | null = null;

  private setupConversationClickTracking(): void {
    // Track clicks on conversation more buttons
    document.addEventListener(
      'click',
      (e) => {
        const target = e.target as HTMLElement;
        const moreButton = target.closest('[data-test-id="actions-menu-button"]');
        if (moreButton) {
          this.debug('More button clicked:', moreButton);

          let conversationEl: HTMLElement | null = null;

          // Strategy 1: In Gemini's new UI, the conversation div and actions-menu-button are siblings!
          // Find the actions container first, then look for sibling conversation div
          const actionsContainer = moreButton.closest('.conversation-actions-container');
          if (actionsContainer) {
            this.debug('Found actions container, looking for sibling conversation...');
            // Look for previous sibling with data-test-id="conversation"
            let sibling = actionsContainer.previousElementSibling;
            while (sibling) {
              if (sibling.getAttribute('data-test-id') === 'conversation') {
                conversationEl = sibling as HTMLElement;
                this.debug('Found conversation as sibling:', conversationEl);
                break;
              }
              sibling = sibling.previousElementSibling;
            }
          }

          // Strategy 2: Try traditional closest approach (for older UI patterns)
          if (!conversationEl) {
            this.debug('Trying closest with conversation selector...');
            conversationEl = moreButton.closest(
              '[data-test-id="conversation"]',
            ) as HTMLElement | null;
          }

          if (!conversationEl) {
            this.debug('Trying history-item selector...');
            conversationEl = moreButton.closest(
              '[data-test-id^="history-item"]',
            ) as HTMLElement | null;
          }

          if (!conversationEl) {
            this.debug('Trying conversation-card selector...');
            conversationEl = moreButton.closest('.conversation-card') as HTMLElement | null;
          }

          // Strategy 3: Check parent container for conversation children
          if (!conversationEl && actionsContainer && actionsContainer.parentElement) {
            this.debug('Trying to find conversation in parent container...');
            const parentContainer = actionsContainer.parentElement;
            const conversationInParent = parentContainer.querySelector(
              '[data-test-id="conversation"]',
            ) as HTMLElement | null;
            if (conversationInParent) {
              // Verify this is the right conversation by checking it's close to the actions container
              const actionsIndex = Array.from(parentContainer.children).indexOf(actionsContainer);
              const convIndex = Array.from(parentContainer.children).indexOf(conversationInParent);
              if (Math.abs(actionsIndex - convIndex) <= 1) {
                conversationEl = conversationInParent;
                this.debug('Found conversation in parent container');
              }
            }
          }

          // Last resort fallback
          if (!conversationEl) {
            this.debugWarn('Could not find precise conversation element, using broader fallback');
            conversationEl = moreButton.closest('[jslog]') as HTMLElement | null;
          }

          if (conversationEl) {
            this.lastClickedConversation = conversationEl as HTMLElement;

            // Debug: verify this element and show its attributes
            const linkCount = conversationEl.querySelectorAll(
              'a[href*="/app/"], a[href*="/gem/"]',
            ).length;
            const jslogAttr = conversationEl.getAttribute('jslog');
            const dataTestId = conversationEl.getAttribute('data-test-id');
            this.debug('Tracked conversation element:', {
              element: conversationEl,
              linkCount,
              jslog: jslogAttr,
              dataTestId,
            });

            // Extract conversation info immediately to avoid issues with multiple links later
            const conversationId = this.extractNativeConversationId(conversationEl);
            const title = this.extractNativeConversationTitle(conversationEl);
            const url = this.extractNativeConversationUrl(conversationEl);

            if (conversationId && title && url) {
              this.lastClickedConversationInfo = { id: conversationId, title, url };
              this.debug(
                '✅ Extracted conversation info on click:',
                this.lastClickedConversationInfo,
              );
            } else {
              this.debugWarn('⚠️ Failed to extract complete conversation info on click', {
                conversationId,
                title,
                url,
              });
              this.lastClickedConversationInfo = null;
            }

            // Fallback: after the click, the Angular Material menu is rendered
            // into a global overlay container. Poll briefly to inject our item
            // even if the mutation observer misses the insertion.
            let attempts = 0;
            const maxAttempts = 20; // ~1s at 50ms intervals
            const timer = window.setInterval(() => {
              attempts++;
              const menuContent = document.querySelector(
                '.mat-mdc-menu-panel .mat-mdc-menu-content',
              ) as HTMLElement | null;
              if (menuContent) {
                this.debug('Overlay poll: menu content found on attempt', attempts);
                if (!menuContent.querySelector('.gv-move-to-folder-btn')) {
                  this.debug('Overlay poll: injecting Move to Folder');
                  this.injectMoveToFolderButton(menuContent);
                }
                window.clearInterval(timer);
              } else if (attempts >= maxAttempts) {
                this.debugWarn('Overlay poll: menu not found within attempts', maxAttempts);
                window.clearInterval(timer);
              }
            }, 50);
          }
        }
      },
      true,
    );
  }

  private extractNativeConversationId(conversationEl: HTMLElement): string | null {
    // Support both /app/<hexId> and /gem/<gemId>/<hexId>
    const scope =
      (conversationEl.closest('[data-test-id="conversation"]') as HTMLElement) || conversationEl;

    // Get all conversation links
    const links = scope.querySelectorAll('a[href*="/app/"], a[href*="/gem/"]');

    if (links.length === 0) {
      this.debugWarn('extractId: no conversation link found under scope');
      // Fallback to jslog parsing on the conversation element tree
      const hex = this.extractHexIdFromJslog(scope);
      if (hex) return hex;
      return null;
    }

    // If there are multiple links, try to find the most specific one
    let link: Element;
    if (links.length > 1) {
      this.debugWarn(
        `extractId: found ${links.length} links, attempting to select the most appropriate one`,
      );

      // Strategy 1: Find the link with the smallest bounding box (most likely the actual conversation item)
      let minArea = Infinity;
      let bestLink = links[0];

      for (const l of Array.from(links)) {
        const rect = l.getBoundingClientRect();
        const area = rect.width * rect.height;
        if (area > 0 && area < minArea) {
          minArea = area;
          bestLink = l;
        }
      }

      // If all links have the same size, fall back to the first one
      link = minArea < Infinity ? bestLink : links[0];
      this.debug('extractId: selected link with area', minArea);
    } else {
      link = links[0];
    }

    const href = link.getAttribute('href') || '';
    this.debug('extractId: found link href', href);

    // Try /app/<hexId>
    let match = href.match(/\/app\/([^\/?#]+)/);
    if (match && match[1]) {
      this.debug('extractId: extracted from /app/', match[1]);
      return match[1];
    }
    // Try /gem/<gemId>/<hexId>
    match = href.match(/\/gem\/[^/]+\/([^\/?#]+)/);
    if (match && match[1]) {
      this.debug('extractId: extracted from /gem/', match[1]);
      return match[1];
    }
    this.debugWarn('extractId: failed to extract id from href');
    return null;
  }

  private extractNativeConversationTitle(conversationEl: HTMLElement): string | null {
    const scope =
      (conversationEl.closest('[data-test-id="conversation"]') as HTMLElement) || conversationEl;
    // 1) Known title selectors
    const titleEl = scope.querySelector(
      '.gds-label-l, .conversation-title-text, [data-test-id="conversation-title"], h3',
    );
    let title = titleEl?.textContent?.trim() || null;
    if (title && !this.isGemLabel(title)) {
      this.debug('extractTitle(selectors):', title);
      return title;
    }

    // 2) Link attributes
    const link = scope.querySelector(
      'a[href*="/app/"], a[href*="/gem/"]',
    ) as HTMLAnchorElement | null;
    const aria = link?.getAttribute('aria-label')?.trim();
    if (aria && !this.isGemLabel(aria)) {
      this.debug('extractTitle(link aria-label):', aria);
      return aria;
    }
    const linkTitle = link?.getAttribute('title')?.trim();
    if (linkTitle && !this.isGemLabel(linkTitle)) {
      this.debug('extractTitle(link title attr):', linkTitle);
      return linkTitle;
    }

    // 3) Parse visible text from link (ignore icons and gem labels)
    const fromLinkText = this.extractTitleFromLinkText(link || undefined);
    if (fromLinkText) {
      this.debug('extractTitle(link text):', fromLinkText);
      return fromLinkText;
    }

    // 4) Fallbacks on common labels
    title = this.extractFallbackTitle(scope);
    if (title && !this.isGemLabel(title)) {
      this.debug('extractTitle(fallback):', title);
      return title;
    }

    this.debug('extractTitle: null');
    return null;
  }

  private syncConversationTitleFromNative(conversationId: string): string | null {
    try {
      // Try to find the conversation in the native sidebar by its ID
      const conversations = document.querySelectorAll('[data-test-id="conversation"]');
      for (const convEl of Array.from(conversations)) {
        // Check if this conversation matches the ID
        const jslog = convEl.getAttribute('jslog');
        if (jslog && jslog.includes(conversationId)) {
          // Found the matching conversation, extract its current title
          const currentTitle = this.extractNativeConversationTitle(convEl as HTMLElement);
          if (currentTitle) {
            this.debug('Synced title from native:', currentTitle);
            return currentTitle;
          }
        }

        // Also check by href
        const link = convEl.querySelector(
          'a[href*="/app/"], a[href*="/gem/"]',
        ) as HTMLAnchorElement | null;
        if (link && link.href.includes(conversationId)) {
          const currentTitle = this.extractNativeConversationTitle(convEl as HTMLElement);
          if (currentTitle) {
            this.debug('Synced title from native (by href):', currentTitle);
            return currentTitle;
          }
        }
      }
    } catch (e) {
      this.debug('Error syncing title from native:', e);
    }
    return null;
  }

  private updateConversationTitle(conversationId: string, newTitle: string): void {
    // Update the title for all instances of this conversation across all folders
    let updated = false;

    for (const folderId in this.data.folderContents) {
      const conversations = this.data.folderContents[folderId];
      for (const conv of conversations) {
        // Match by conversation ID (check both direct match and URL match)
        if (
          (conv.conversationId === conversationId || conv.url.includes(conversationId)) &&
          !conv.customTitle
        ) {
          conv.title = newTitle;
          updated = true;
          this.debug(`Updated title for conversation ${conversationId} in folder ${folderId}`);
        }
      }
    }

    if (updated) {
      this.saveData();
      // Re-render folders to show updated title
      this.renderAllFolders();
    }
  }

  /**
   * Schedule a delayed check to confirm conversation deletion
   * This prevents false positives when Gemini UI temporarily removes/re-adds elements
   */
  private scheduleConversationRemovalCheck(conversationId: string): void {
    // Cancel any existing timer for this conversation
    const existingTimer = this.pendingRemovals.get(conversationId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.debug(`Cancelled previous removal timer for ${conversationId}`);
    }

    // Schedule a new check after delay
    const timerId = window.setTimeout(() => {
      this.confirmConversationRemoval(conversationId);
    }, this.removalCheckDelay);

    this.pendingRemovals.set(conversationId, timerId);
    this.debug(
      `Scheduled removal check for ${conversationId} (delay: ${this.removalCheckDelay}ms)`,
    );
  }

  /**
   * Cancel pending removal for a conversation element that was re-added
   */
  private cancelPendingRemovalForElement(element: HTMLElement): void {
    // Extract conversation ID from the element
    const conversationId = this.extractConversationIdFromElement(element);

    if (conversationId) {
      const timerId = this.pendingRemovals.get(conversationId);
      if (timerId) {
        clearTimeout(timerId);
        this.pendingRemovals.delete(conversationId);
        this.debug(`Cancelled removal for ${conversationId} (conversation re-added to DOM)`);
      }
    }
  }

  /**
   * Check if conversation still exists in DOM
   * Returns true if conversation found, false if definitely deleted
   * In case of errors, conservatively returns true to avoid false deletions
   */
  private isConversationInDOM(conversationId: string): boolean {
    if (!this.sidebarContainer) {
      this.debugWarn('Sidebar container not available for DOM check');
      return true; // Conservative: assume conversation exists if we can't check
    }

    try {
      // Check by jslog attribute
      const byJslog = this.sidebarContainer.querySelector(
        `[data-test-id="conversation"][jslog*="c_${conversationId}"]`,
      );
      if (byJslog) {
        this.debug(`Found conversation ${conversationId} in DOM by jslog`);
        return true;
      }

      // Check by href
      const byHref = this.sidebarContainer.querySelector(
        `[data-test-id="conversation"] a[href*="${conversationId}"]`,
      );
      if (byHref) {
        this.debug(`Found conversation ${conversationId} in DOM by href`);
        return true;
      }

      // Not found in DOM
      this.debug(`Conversation ${conversationId} not found in DOM`);
      return false;
    } catch (error) {
      this.debugWarn(`DOM check failed for ${conversationId}:`, error);
      // Conservative approach: if we can't check, assume it still exists
      // This prevents accidental deletion during DOM reconstruction
      return true;
    }
  }

  /**
   * Get the conversation ID from current URL
   */
  private getCurrentConversationId(): string | null {
    const url = window.location.href;
    const appMatch = url.match(/\/app\/([^\/?#]+)/);
    const gemMatch = url.match(/\/gem\/[^/]+\/([^\/?#]+)/);
    return appMatch?.[1] || gemMatch?.[1] || null;
  }

  /**
   * Confirm conversation removal after delay
   * Only removes if conversation is truly deleted (not in DOM and not current conversation)
   */
  private confirmConversationRemoval(conversationId: string): void {
    // Remove from pending list
    this.pendingRemovals.delete(conversationId);

    this.debug(`\n═══ Confirming removal for conversation ${conversationId} ═══`);
    this.debug(`  Delay elapsed: ${this.removalCheckDelay}ms`);

    // Check 1: Is this the currently active conversation?
    const currentConvId = this.getCurrentConversationId();
    const currentUrl = window.location.href;

    if (currentConvId === conversationId) {
      this.debug(`  ✓ SKIPPED: Currently active conversation`);
      this.debug(`    Current URL: ${currentUrl}`);
      this.debug(`    Matched ID: ${currentConvId}`);
      this.debug(`════════════════════════════════════════════════\n`);
      return;
    }

    // Check 2: Is conversation still in DOM?
    if (this.isConversationInDOM(conversationId)) {
      this.debug(`  ✓ SKIPPED: Conversation still exists in DOM`);
      this.debug(`    Likely a UI refresh, not a deletion`);
      this.debug(`════════════════════════════════════════════════\n`);
      return;
    }

    // Conversation is truly deleted - remove from folders
    this.debug(`  ✗ CONFIRMED DELETION: Removing from all folders`);
    this.debug(`    Reason: Not in current URL and not found in DOM`);
    this.debug(`    Current URL: ${currentUrl}`);
    this.debug(`════════════════════════════════════════════════\n`);

    this.removeConversationFromAllFolders(conversationId);
  }

  private removeConversationFromAllFolders(conversationId: string): void {
    // Remove this conversation from all folders when the original conversation is deleted
    let removed = false;

    for (const folderId in this.data.folderContents) {
      const conversations = this.data.folderContents[folderId];
      const initialLength = conversations.length;

      // Filter out the deleted conversation
      this.data.folderContents[folderId] = conversations.filter(
        (conv) => conv.conversationId !== conversationId && !conv.url.includes(conversationId),
      );

      if (this.data.folderContents[folderId].length < initialLength) {
        removed = true;
        this.debug(`Removed deleted conversation ${conversationId} from folder ${folderId}`);
      }
    }

    if (removed) {
      this.saveData();
      // Re-render folders to reflect the removal
      this.renderAllFolders();
    }
  }

  private extractHexIdFromJslog(scope: HTMLElement): string | null {
    try {
      const tryParse = (val: string | null | undefined): string | null => {
        if (!val) return null;
        // Typical pattern inside jslog: c_<hex>
        const m = val.match(/c_([a-f0-9]{8,})/i);
        return m?.[1] || null;
      };

      // Check on scope itself
      const fromSelf = tryParse(scope.getAttribute('jslog'));
      if (fromSelf) {
        this.debug('extractId(jslog self):', fromSelf);
        return fromSelf;
      }

      // Search descendants with jslog
      const nodes = scope.querySelectorAll('[jslog]');
      for (const n of Array.from(nodes)) {
        const found = tryParse(n.getAttribute('jslog'));
        if (found) {
          this.debug('extractId(jslog descendant):', found);
          return found;
        }
      }
    } catch (e) {
      this.debugWarn('extractHexIdFromJslog error:', e);
    }
    this.debugWarn('extractId(jslog): not found');
    return null;
  }

  private extractHexIdFromMenu(menuContent: HTMLElement): string | null {
    try {
      const nodes = menuContent.querySelectorAll('[jslog]');
      for (const n of Array.from(nodes)) {
        const val = n.getAttribute('jslog');
        if (!val) continue;
        const m = val.match(/c_([a-f0-9]{8,})/i);
        if (m && m[1]) {
          this.debug('extractId(menu jslog):', m[1]);
          return m[1];
        }
      }
    } catch (e) {
      this.debugWarn('extractHexIdFromMenu error:', e);
    }
    this.debugWarn('extractId(menu): not found');
    return null;
  }

  private buildConversationUrlFromId(hexId: string): string {
    try {
      const path = window.location.pathname;
      const gemMatch = path.match(/\/gem\/([^\/]+)/);
      if (gemMatch && gemMatch[1]) {
        const gemId = gemMatch[1];
        return `https://gemini.google.com/gem/${gemId}/${hexId}`;
      }
    } catch (e) {
      this.debug('Failed to extract gem URL:', e);
    }
    return `https://gemini.google.com/app/${hexId}`;
  }

  private extractFallbackTitle(conversationEl: HTMLElement): string | null {
    try {
      const scope =
        (conversationEl.closest('[data-test-id="conversation"]') as HTMLElement) || conversationEl;
      // Prefer explicit attributes if present
      const aria = scope.getAttribute('aria-label');
      if (aria && aria.trim()) {
        this.debug('fallbackTitle(aria-label):', aria.trim());
        return aria.trim();
      }
      const titleAttr = scope.getAttribute('title');
      if (titleAttr && titleAttr.trim()) {
        this.debug('fallbackTitle(title attr):', titleAttr.trim());
        return titleAttr.trim();
      }
      // Try a common inner label
      const label = scope.querySelector('.gds-body-m, .gds-label-m, .subtitle');
      const labelText = label?.textContent?.trim();
      if (labelText && !this.isGemLabel(labelText)) {
        this.debug('fallbackTitle(label-ish):', labelText);
        return labelText;
      }
      // Fall back to trimmed text content (first line, clipped)
      const raw = scope.textContent?.trim() || '';
      if (raw) {
        const firstLine =
          raw
            .split('\n')
            .map((s) => s.trim())
            .filter(Boolean)[0] || raw;
        const clipped = firstLine.slice(0, 80);
        this.debug('fallbackTitle(textContent):', clipped);
        return clipped;
      }
    } catch (e) {
      this.debugWarn('extractFallbackTitle error:', e);
    }
    return null;
  }

  private isGemLabel(text: string): boolean {
    const t = (text || '').trim();
    if (!t) return false;
    const simple = t.toLowerCase();
    // Generic labels we want to ignore
    if (simple === 'gem' || simple === 'gems') return true;
    // Known Gem names (English)
    for (const g of GEM_CONFIG) {
      if (simple === g.name.toLowerCase()) return true;
    }
    return false;
  }

  private extractTitleFromLinkText(link?: HTMLAnchorElement | null): string | null {
    if (!link) return null;
    // Get visible textual lines from the link
    const text = (link.innerText || '').trim();
    if (!text) return null;
    const parts = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean)
      .filter((s) => !this.isGemLabel(s))
      .filter((s) => s.length >= 2);
    this.debug('extractTitleFromLinkText parts:', parts);
    if (parts.length === 0) return null;
    // Heuristic: pick the longest part
    const best = parts.reduce((a, b) => (b.length > a.length ? b : a), parts[0]);
    return best || null;
  }

  private extractNativeConversationUrl(conversationEl: HTMLElement): string | null {
    const scope =
      (conversationEl.closest('[data-test-id="conversation"]') as HTMLElement) || conversationEl;
    const link = scope.querySelector('a[href*="/app/"], a[href*="/gem/"]');
    if (!link) {
      this.debugWarn('extractUrl: no conversation link found under scope');
      // Fallback: construct from extracted id (via jslog) if possible
      const hex = this.extractHexIdFromJslog(scope);
      if (hex) {
        const fullFromJslog = this.buildConversationUrlFromId(hex);
        this.debug('extractUrl(jslog fallback):', fullFromJslog);
        return fullFromJslog;
      }
      return null;
    }
    const href = link.getAttribute('href');
    if (!href) {
      this.debugWarn('extractUrl: link has no href');
      return null;
    }
    const full = href.startsWith('http') ? href : `https://gemini.google.com${href}`;
    this.debug('extractUrl:', full);
    return full;
  }

  private refresh(): void {
    if (!this.containerElement) return;

    // Find and update the folders list
    const oldList = this.containerElement.querySelector('.gv-folder-list');
    if (oldList) {
      const newList = this.createFoldersList();
      oldList.replaceWith(newList);
    }

    // Re-apply hide archived setting after refresh
    this.applyHideArchivedSetting();

    // Update active highlight after re-render
    this.highlightActiveConversationInFolders();

    // Flush any pending title updates collected during rendering
    if (this.pendingTitleUpdates.size > 0) {
      this.debug(`Flushing ${this.pendingTitleUpdates.size} pending title updates`);
      // Save once after all title updates are applied (async, fire-and-forget)
      this.saveData()
        .then((saved) => {
          // Only clear after confirmed successful save to avoid losing updates
          if (saved) {
            this.pendingTitleUpdates.clear();
          } else {
            this.debugWarn('Save failed, retaining pending title updates for next attempt');
          }
        })
        .catch((error) => {
          console.error('[FolderManager] Failed to save pending title updates:', error);
        });
    }
  }

  private getCurrentHexIdFromLocation(): string | null {
    try {
      const path = window.location.pathname || '';
      // Match /app/<hex> or /gem/<gemId>/<hex>
      const m = path.match(/\/(?:app|gem\/[^/]+)\/([a-f0-9]+)/i);
      return m ? m[1] : null;
    } catch (e) {
      this.debug('Failed to get current hex ID from location:', e);
      return null;
    }
  }

  private highlightActiveConversationInFolders(): void {
    if (!this.containerElement) return;
    const hex = this.getCurrentHexIdFromLocation();
    const currentId = hex ? `c_${hex}` : null;
    const rows = this.containerElement.querySelectorAll('.gv-folder-conversation');
    rows.forEach((el) => {
      const row = el as HTMLElement;
      const isActive = currentId && row.dataset.conversationId === currentId;
      row.classList.toggle('gv-folder-conversation-selected', !!isActive);
    });
  }

  /**
   * Ensures data integrity by validating and repairing the folder data structure.
   * This method is called by both loadData() and saveData() to maintain consistency.
   */
  private ensureDataIntegrity(): void {
    // Ensure folderContents object exists
    if (!this.data.folderContents) {
      this.data.folderContents = {};
      this.debugWarn('folderContents was missing, initialized');
    }

    // Ensure folders array exists
    if (!this.data.folders) {
      this.data.folders = [];
      this.debugWarn('folders was missing, initialized');
    }

    // Ensure all folders have a folderContents entry (even if empty)
    // This is critical for empty folders to persist correctly
    this.data.folders.forEach((folder) => {
      if (!this.data.folderContents[folder.id]) {
        this.data.folderContents[folder.id] = [];
        this.debugWarn(`Initialized missing folderContents for folder: ${folder.name}`);
      }
    });
  }

  /**
   * Load folder data from storage (async, browser-agnostic)
   * Uses storage adapter for automatic Safari/non-Safari handling
   */
  private async loadData(): Promise<void> {
    try {
      const loadedData = await this.storage.loadData(STORAGE_KEY);

      if (loadedData && validateFolderData(loadedData)) {
        this.data = loadedData;

        // Validate and repair data integrity
        this.ensureDataIntegrity();

        // Clean up orphaned folderContents (folders that no longer exist)
        const validFolderIds = new Set(this.data.folders.map((f) => f.id));
        validFolderIds.add(ROOT_CONVERSATIONS_ID); // Keep root conversations
        Object.keys(this.data.folderContents).forEach((folderId) => {
          if (!validFolderIds.has(folderId)) {
            this.debugWarn(`Removing orphaned folderContents for: ${folderId}`);
            delete this.data.folderContents[folderId];
          }
        });

        // Create primary backup on successful load
        this.backupService.createPrimaryBackup(this.data);

        this.debug('Data loaded and validated successfully');
      } else if (loadedData) {
        // Data exists but validation failed - this is a real corruption case
        console.warn(
          '[FolderManager] Storage returned invalid data structure, attempting recovery from backup',
        );
        this.attemptDataRecovery({ reason: 'corrupted', originalData: loadedData });
      } else {
        // No data found - likely a first-time user
        console.log(
          '[FolderManager] No folder data found, initializing empty state (likely first-time user)',
        );
        this.data = { folders: [], folderContents: {} };
        // No notification needed - this is expected for new users
      }
    } catch (error) {
      console.error('[FolderManager] Load data error:', error);

      // CRITICAL: Do NOT clear data on error - this causes data loss!
      // Instead, try to recover from backup or keep existing data
      this.attemptDataRecovery(error);
    }
  }

  /**
   * Attempt to recover data when loadData() encounters corrupted data or errors.
   * This method is only called when there's an actual problem (not for first-time users).
   * Priority: localStorage backup (primary/emergency/beforeUnload) > keep existing data > initialize empty
   */
  private attemptDataRecovery(error: unknown): void {
    console.warn('[FolderManager] Attempting data recovery after load failure');

    // Step 1: Try to restore from localStorage backups (primary, emergency, beforeUnload)
    const recovered = this.backupService.recoverFromBackup();
    if (recovered && validateFolderData(recovered)) {
      this.data = recovered;
      this.ensureDataIntegrity();
      console.warn('[FolderManager] Data recovered from localStorage backup');
      this.showNotificationByLevel('Folder data has been recovered from a backup.', 'warning');
      // Save recovered data to persistent storage
      this.saveData();
      return; // Successfully recovered, no need to continue
    }

    // Step 2: If current this.data already has valid structure, keep it
    if (validateFolderData(this.data) && this.data.folders.length > 0) {
      console.warn('[FolderManager] Keeping existing in-memory data after load error');
      this.ensureDataIntegrity();
      return;
    }

    // Step 3: Last resort - initialize empty data and log critical error
    console.error('[FolderManager] CRITICAL: Unable to recover data, initializing empty state');
    console.error('[FolderManager] Original error:', error);
    this.data = { folders: [], folderContents: {} };

    // Show user notification about data loss
    this.showDataLossNotification();
  }

  /**
   * Show notification to user about potential data loss
   */
  private showDataLossNotification(): void {
    this.showNotificationByLevel(
      getTranslationSync('folderManager_dataLossWarning') ||
        'Warning: Failed to load folder data. Please check your browser console for details.',
      'error',
    );
  }

  /**
   * Show a notification to the user with customizable level
   */
  private showNotificationByLevel(
    message: string,
    level: 'info' | 'warning' | 'error' = 'error',
  ): void {
    try {
      // Color based on level
      const colors = {
        info: '#2196F3',
        warning: '#FF9800',
        error: '#f44336',
      };

      // Create a visible notification
      const notification = document.createElement('div');
      notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[level]};
        color: white;
        padding: 16px 24px;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        z-index: 10000;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        max-width: 400px;
        line-height: 1.4;
      `;
      notification.textContent = message;
      document.body.appendChild(notification);

      // Auto-remove after timeout (longer for errors/warnings)
      const timeout =
        level === 'info' ? 3000 : level === 'warning' ? 7000 : NOTIFICATION_TIMEOUT_MS;
      setTimeout(() => {
        try {
          document.body.removeChild(notification);
        } catch {
          // Ignore - notification may have already been removed
        }
      }, timeout);
    } catch (notificationError) {
      console.error('[FolderManager] Failed to show notification:', notificationError);
    }
  }

  /**
   * Save folder data to storage (async, browser-agnostic)
   * Uses storage adapter for automatic Safari/non-Safari handling
   */
  private async saveData(): Promise<boolean> {
    // Prevent concurrent saves to avoid race conditions
    if (this.saveInProgress) {
      this.debug('Save already in progress, skipping duplicate call');
      return false;
    }

    this.saveInProgress = true;
    let success = false;

    try {
      // Validate data integrity before saving
      this.ensureDataIntegrity();

      // CRITICAL: Create emergency backup BEFORE saving (snapshot of previous state)
      this.backupService.createEmergencyBackup(this.data);

      // Additional safety check: warn if saving empty data
      if (this.data.folders.length === 0 && Object.keys(this.data.folderContents).length === 0) {
        // Check if we're about to overwrite non-empty data
        const existingData = await this.storage.loadData(STORAGE_KEY);
        if (
          existingData &&
          (existingData.folders.length > 0 || Object.keys(existingData.folderContents).length > 0)
        ) {
          console.warn(
            '[FolderManager] WARNING: Attempting to save empty data over existing non-empty data',
          );
          console.warn('[FolderManager] This may indicate a bug.');
          // Still proceed, but log it prominently
        }
      }

      // Save via storage adapter (handles both Safari and non-Safari)
      success = await this.storage.saveData(STORAGE_KEY, this.data);

      // Retry once if the first attempt fails (for transient errors)
      if (!success) {
        console.warn('[FolderManager] Save failed, retrying once...');
        success = await this.storage.saveData(STORAGE_KEY, this.data);
      }

      if (success) {
        // Create primary backup AFTER successful save
        this.backupService.createPrimaryBackup(this.data);
        this.debug('Data saved successfully');
      } else {
        console.error('[FolderManager] Save failed after retry');
      }
    } catch (error) {
      console.error('[FolderManager] Save data error:', error);
      success = false;
    } finally {
      this.saveInProgress = false;
    }

    return success;
  }

  private async loadFolderEnabledSetting(): Promise<void> {
    try {
      const result = await browser.storage.sync.get({ geminiFolderEnabled: true });
      this.folderEnabled = result.geminiFolderEnabled !== false;
      this.debug('Loaded folder enabled setting:', this.folderEnabled);
    } catch (error) {
      console.error('[FolderManager] Failed to load folder enabled setting:', error);
      this.folderEnabled = true;
    }
  }

  private async loadHideArchivedSetting(): Promise<void> {
    try {
      const result = await browser.storage.sync.get({
        geminiFolderHideArchivedConversations: false,
      });
      this.hideArchivedConversations = !!result.geminiFolderHideArchivedConversations;
      this.debug('Loaded hide archived setting:', this.hideArchivedConversations);
    } catch (error) {
      console.error('[FolderManager] Failed to load hide archived setting:', error);
      this.hideArchivedConversations = false;
    }
  }

  private setupStorageListener(): void {
    // Listen for sync settings changes
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.geminiFolderEnabled) {
          this.folderEnabled = changes.geminiFolderEnabled.newValue !== false;
          this.debug('Folder enabled setting changed:', this.folderEnabled);
          // Apply the change to folder visibility
          this.applyFolderEnabledSetting();
        }
        if (changes.geminiFolderHideArchivedConversations) {
          this.hideArchivedConversations = !!changes.geminiFolderHideArchivedConversations.newValue;
          this.debug('Hide archived setting changed:', this.hideArchivedConversations);
          // Apply the change to all conversations
          this.applyHideArchivedSetting();
        }
      }
      // Listen for folder data changes from cloud sync
      if (areaName === 'local' && changes.gvFolderData) {
        this.debug('Folder data changed in chrome.storage.local, reloading...');
        this.reloadFoldersFromStorage();
      }
    });

    // Listen for reload message from popup after sync
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type === 'gv.folders.reload') {
        this.debug('Received folder reload message');
        this.reloadFoldersFromStorage();
        sendResponse({ ok: true });
      }
      return true;
    });

    // Perform migration from legacy settings
    this.performMigration();
  }

  /**
   * Reload folder data from chrome.storage.local and refresh UI
   */
  private async reloadFoldersFromStorage(): Promise<void> {
    try {
      await this.loadData();
      this.renderAllFolders();
      this.debug('Folders reloaded from storage');
    } catch (error) {
      console.error('[FolderManager] Failed to reload folders:', error);
    }
  }

  /**
   * Migrate legacy settings
   */
  private async performMigration(): Promise<void> {
    try {
      const result = await chrome.storage.local.get('gvSyncMode');
      // Migration: Auto sync is deprecated, switch to manual
      if (result.gvSyncMode === 'auto') {
        console.log('[FolderManager] Migrating legacy "auto" sync mode to "manual"');
        await chrome.storage.local.set({ gvSyncMode: 'manual' });
      }
    } catch (error) {
      console.error('[FolderManager] Migration failed:', error);
    }
  }

  /**
   * Merge folder data for auto-sync (same logic as popup's mergeFolderData)
   */
  private mergeFolderDataForAutoSync(local: FolderData, cloud: FolderData): FolderData {
    // Merge folders list
    const folderMap = new Map<string, Folder>();

    // Add all local folders first
    local.folders.forEach((folder) => {
      folderMap.set(folder.id, folder);
    });

    // Merge cloud folders
    cloud.folders.forEach((cloudFolder) => {
      const localFolder = folderMap.get(cloudFolder.id);
      if (!localFolder) {
        // New folder from cloud
        folderMap.set(cloudFolder.id, cloudFolder);
      } else {
        // Conflict: compare timestamps
        const cloudTime = cloudFolder.updatedAt || cloudFolder.createdAt || 0;
        const localTime = localFolder.updatedAt || localFolder.createdAt || 0;
        if (cloudTime > localTime) {
          folderMap.set(cloudFolder.id, cloudFolder);
        }
        // If local is newer or equal, keep local
      }
    });

    // Merge folder contents
    const mergedContents: Record<string, ConversationReference[]> = { ...local.folderContents };

    const allFolderIds = new Set([
      ...Object.keys(local.folderContents),
      ...Object.keys(cloud.folderContents),
    ]);

    allFolderIds.forEach((folderId) => {
      const localConvos = local.folderContents[folderId] || [];
      const cloudConvos = cloud.folderContents[folderId] || [];

      const convoMap = new Map<string, ConversationReference>();
      // Add cloud first, then local overwrites (local preferred)
      cloudConvos.forEach((c) => convoMap.set(c.conversationId, c));
      localConvos.forEach((c) => convoMap.set(c.conversationId, c));

      mergedContents[folderId] = Array.from(convoMap.values());
    });

    return {
      folders: Array.from(folderMap.values()),
      folderContents: mergedContents,
    };
  }

  private applyFolderEnabledSetting(): void {
    if (this.folderEnabled) {
      // If folder UI doesn't exist yet, initialize it
      if (!this.containerElement) {
        this.debug('Folder feature enabled, initializing UI');
        this.initializeFolderUI().catch((error) => {
          console.error('[FolderManager] Failed to initialize folder UI:', error);
        });
      } else {
        // UI already exists, just show it
        this.containerElement.style.display = '';
        this.debug('Folder feature enabled');
      }
    } else {
      // Hide the folder UI if it exists
      if (this.containerElement) {
        this.containerElement.style.display = 'none';
        this.debug('Folder feature disabled');
      }
    }
  }

  private applyHideArchivedSetting(): void {
    if (!this.sidebarContainer) return;

    const conversations = this.sidebarContainer.querySelectorAll('[data-test-id="conversation"]');
    conversations.forEach((conv) => {
      this.applyHideArchivedToConversation(conv as HTMLElement);
    });
  }

  /**
   * Apply hide archived setting to a single conversation element
   */
  private applyHideArchivedToConversation(conv: HTMLElement): void {
    const convId = this.extractConversationId(conv);
    const isArchived = this.isConversationInFolders(convId);

    if (this.hideArchivedConversations && isArchived) {
      conv.classList.add('gv-conversation-archived');
    } else {
      conv.classList.remove('gv-conversation-archived');
    }
  }

  private isConversationInFolders(conversationId: string): boolean {
    // Check if conversation exists in any folder
    for (const folderId in this.data.folderContents) {
      const conversations = this.data.folderContents[folderId];
      if (
        conversations.some((c) => {
          // Direct ID match
          if (c.conversationId === conversationId) return true;

          // Robustness fallback: check if one ID contains the other (e.g. c_ prefix mismatch)
          // or if URL contains the ID (common if one is hex and other is full ID)
          const cleanId = conversationId.replace(/^c_/, '');
          const cleanStoredId = c.conversationId.replace(/^c_/, '');

          if (cleanId && cleanId === cleanStoredId) return true;

          // Check if URL contains the hex ID
          if (cleanId && cleanId.length > 8 && c.url.includes(cleanId)) return true;

          return false;
        })
      ) {
        return true;
      }
    }
    return false;
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
    const conv = this.data.folderContents[folderId]?.find(
      (c) => c.conversationId === conversationId,
    );
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
          setTimeout(() => this.highlightActiveConversationInFolders(), 0);

          // After navigation, sync title and check for gem updates
          setTimeout(() => {
            // Sync title from native conversation
            if (conversation) {
              const syncedTitle = this.syncConversationTitleFromNative(hexId);
              if (syncedTitle && syncedTitle !== conversation.title) {
                this.updateConversationTitle(hexId, syncedTitle);
                this.debug('Updated conversation title after navigation:', syncedTitle);
              }
            }

            // Check if URL changed (Gemini auto-redirected to /gem/)
            if (conversation && !conversation.gemId) {
              this.checkAndUpdateGemId(hexId);
            } else if (conversation?.gemId) {
              this.debug('Known gem conversation:', conversation.gemId);
            }
          }, 300);

          return;
        }
      }

      // If we can't find the sidebar element, try pushState + popstate
      this.debug('Sidebar element not found, trying pushState');
      window.history.pushState({}, '', url);
      const popStateEvent = new PopStateEvent('popstate', { state: {} });
      window.dispatchEvent(popStateEvent);
      setTimeout(() => this.highlightActiveConversationInFolders(), 0);

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

    // Ensure active conversation remains highlighted after full re-render
    this.highlightActiveConversationInFolders();
  }

  private installRouteChangeListener(): void {
    const update = () => {
      if (this.isDestroyed) return;
      setTimeout(() => this.highlightActiveConversationInFolders(), 0);
    };

    const cleanupFns: (() => void)[] = [];

    try {
      window.addEventListener('popstate', update);
      cleanupFns.push(() => window.removeEventListener('popstate', update));
    } catch (e) {
      this.debug('Failed to add popstate listener:', e);
    }

    try {
      const hist = history as any;
      const originalPushState = hist.pushState;
      const originalReplaceState = hist.replaceState;

      const wrap = (method: 'pushState' | 'replaceState', original: any) => {
        hist[method] = function (...args: any[]) {
          const ret = original.apply(this, args);
          try {
            update();
          } catch {
            /* Ignore - update is non-critical */
          }
          return ret;
        };
      };
      wrap('pushState', originalPushState);
      wrap('replaceState', originalReplaceState);

      cleanupFns.push(() => {
        hist.pushState = originalPushState;
        hist.replaceState = originalReplaceState;
      });
    } catch (e) {
      this.debug('Failed to wrap history methods:', e);
    }

    // Fallback poller for routers/flows that don't emit events
    try {
      this.lastPathname = window.location.pathname;
      this.navPoller = window.setInterval(() => {
        if (this.isDestroyed) {
          if (this.navPoller) clearInterval(this.navPoller);
          return;
        }
        const now = window.location.pathname;
        if (now !== this.lastPathname) {
          this.lastPathname = now;
          update();
        }
      }, 400);
    } catch (e) {
      this.debug('Failed to setup navigation poller:', e);
    }

    this.routeChangeCleanup = () => {
      cleanupFns.forEach((fn) => fn());
      if (this.navPoller) {
        clearInterval(this.navPoller);
        this.navPoller = null;
      }
    };
  }

  private installSidebarClickListener(): void {
    // Capture clicks in Gemini's native sidebar and update highlight after navigation happens
    const root = this.sidebarContainer;
    if (!root) return;

    this.sidebarClickListener = (e: Event) => {
      if (this.isDestroyed) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const a = target.closest('a[href*="/app/"], a[href*="/gem/"]') as HTMLAnchorElement | null;
      if (a) {
        setTimeout(() => this.highlightActiveConversationInFolders(), 0);
      }
    };

    try {
      root.addEventListener('click', this.sidebarClickListener, true);
    } catch (e) {
      this.debug('Failed to add sidebar click listener:', e);
    }
  }

  private t(key: string): string {
    // Use the centralized i18n system that respects user's language preference
    return getTranslationSyncUnsafe(key);
  }

  private setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message: any, sender: any, sendResponse: any) => {
      // Handle request for current folder data
      if (message.type === 'gv.sync.requestData') {
        this.debug('Received request for folder data from popup');
        sendResponse({
          ok: true,
          data: this.data,
        });
        // Return true to indicate we might respond asynchronously (though we responded synchronously above)
        // This is good practice in some browser implementations or if we change logic later
        return true;
      }

      // Handle reload request (existing functionality might be handled elsewhere, but safe to add log)
      if (message.type === 'gv.folders.reload') {
        this.debug('Received reload request');
        this.loadData().then(() => {
          this.refresh();
          // We can't easily respond to reload since it's fire-and-forget in some contexts,
          // but if sendResponse is provided we can use it
          try {
            sendResponse({ ok: true });
          } catch (e) {
            /* ignore */
          }
        });
        return true;
      }

      // Return true for all messages to keep the channel open
      return true;
    });
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

  // Export/Import methods
  private exportFolders(): void {
    // Prevent concurrent exports
    if (this.exportInProgress) {
      this.showNotification(
        this.t('folder_export_in_progress') || 'Export already in progress',
        'info',
      );
      return;
    }

    this.exportInProgress = true;

    try {
      // Type assertion to match the service's expected type
      const payload = FolderImportExportService.exportToPayload(this.data as any);
      FolderImportExportService.downloadJSON(payload);
      this.showNotification(this.t('folder_export_success'), 'success');
      this.debug('Folders exported successfully');
    } catch (error) {
      console.error('[FolderManager] Export error:', error);
      this.showNotification(
        this.t('folder_import_error').replace('{error}', String(error)),
        'error',
      );
    } finally {
      // Always release the lock
      this.exportInProgress = false;
    }
  }

  private showImportDialog(): void {
    // Create dialog overlay
    const overlay = document.createElement('div');
    overlay.className = 'gv-folder-dialog-overlay';

    // Create dialog
    const dialog = document.createElement('div');
    dialog.className = 'gv-folder-import-dialog';

    // Dialog title
    const dialogTitle = document.createElement('div');
    dialogTitle.className = 'gv-folder-dialog-title';
    dialogTitle.textContent = this.t('folder_import_title');

    // Strategy selection
    const strategyContainer = document.createElement('div');
    strategyContainer.className = 'gv-folder-import-strategy';

    const strategyLabel = document.createElement('div');
    strategyLabel.className = 'gv-folder-import-strategy-label';
    strategyLabel.textContent = this.t('folder_import_strategy');

    const strategyOptions = document.createElement('div');
    strategyOptions.className = 'gv-folder-import-strategy-options';

    const mergeOption = this.createRadioOption('merge', this.t('folder_import_merge'), true);
    const overwriteOption = this.createRadioOption(
      'overwrite',
      this.t('folder_import_overwrite'),
      false,
    );

    strategyOptions.appendChild(mergeOption);
    strategyOptions.appendChild(overwriteOption);

    strategyContainer.appendChild(strategyLabel);
    strategyContainer.appendChild(strategyOptions);

    // File input
    const fileInputContainer = document.createElement('div');
    fileInputContainer.className = 'gv-folder-import-file-input';

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.json,application/json';
    fileInput.style.display = 'none';

    const fileButton = document.createElement('button');
    fileButton.className = 'gv-folder-import-file-button';
    fileButton.textContent = this.t('folder_import_select_file');
    fileButton.addEventListener('click', () => fileInput.click());

    const fileName = document.createElement('div');
    fileName.className = 'gv-folder-import-file-name';
    fileName.textContent = '';

    fileInput.addEventListener('change', () => {
      if (fileInput.files && fileInput.files[0]) {
        fileName.textContent = fileInput.files[0].name;
      }
    });

    fileInputContainer.appendChild(fileInput);
    fileInputContainer.appendChild(fileButton);
    fileInputContainer.appendChild(fileName);

    // Buttons
    const buttonsContainer = document.createElement('div');
    buttonsContainer.className = 'gv-folder-dialog-buttons';

    const importBtn = document.createElement('button');
    importBtn.className = 'gv-folder-dialog-btn gv-folder-dialog-btn-primary';
    importBtn.textContent = this.t('pm_import');
    importBtn.addEventListener('click', async () => {
      const strategy = (mergeOption.querySelector('input') as HTMLInputElement).checked
        ? 'merge'
        : 'overwrite';
      await this.handleImport(fileInput, strategy);
      overlay.remove();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-folder-dialog-btn gv-folder-dialog-btn-secondary';
    cancelBtn.textContent = this.t('pm_cancel');
    cancelBtn.addEventListener('click', () => overlay.remove());

    buttonsContainer.appendChild(cancelBtn);
    buttonsContainer.appendChild(importBtn);

    // Assemble dialog
    dialog.appendChild(dialogTitle);
    dialog.appendChild(strategyContainer);
    dialog.appendChild(fileInputContainer);
    dialog.appendChild(buttonsContainer);
    overlay.appendChild(dialog);

    // Add to body
    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });
  }

  private createRadioOption(value: string, label: string, checked: boolean): HTMLElement {
    const container = document.createElement('label');
    container.className = 'gv-folder-import-radio-option';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'import-strategy';
    radio.value = value;
    radio.checked = checked;

    const labelText = document.createElement('span');
    labelText.textContent = label;

    container.appendChild(radio);
    container.appendChild(labelText);

    return container;
  }

  private async handleImport(fileInput: HTMLInputElement, strategy: ImportStrategy): Promise<void> {
    // Prevent concurrent imports to avoid data corruption
    if (this.importInProgress) {
      this.showNotification(
        this.t('folder_import_in_progress') || 'Import already in progress',
        'info',
      );
      return;
    }

    this.importInProgress = true;

    try {
      if (!fileInput.files || fileInput.files.length === 0) {
        this.showNotification(this.t('folder_import_select_file'), 'error');
        return;
      }

      const file = fileInput.files[0];

      // Confirm overwrite if strategy is overwrite
      if (strategy === 'overwrite') {
        const confirmed = confirm(this.t('folder_import_confirm_overwrite'));
        if (!confirmed) {
          return;
        }
      }

      // Read and parse file
      const readResult = await FolderImportExportService.readJSONFile(file);
      if (!readResult.success) {
        this.showNotification(this.t('folder_import_invalid_format'), 'error');
        return;
      }

      // Validate payload
      const validationResult = FolderImportExportService.validatePayload(readResult.data);
      if (!validationResult.success) {
        this.showNotification(
          this.t('folder_import_invalid_format') + ': ' + validationResult.error.message,
          'error',
        );
        return;
      }

      // Import data (now async with concurrency protection)
      const importResult = await FolderImportExportService.importFromPayload(
        validationResult.data,
        this.data as any,
        { strategy, createBackup: true },
      );

      if (!importResult.success) {
        this.showNotification(
          this.t('folder_import_error').replace('{error}', String(importResult.error)),
          'error',
        );
        return;
      }

      // Update data and save
      this.data = importResult.data.data as any;
      this.saveData();
      this.refresh();

      // Show success message
      const stats = importResult.data.stats;
      let message = this.t('folder_import_success')
        .replace('{folders}', String(stats.foldersImported))
        .replace('{conversations}', String(stats.conversationsImported));

      if (
        strategy === 'merge' &&
        (stats.duplicatesFoldersSkipped || stats.duplicatesConversationsSkipped)
      ) {
        const totalSkipped =
          (stats.duplicatesFoldersSkipped || 0) + (stats.duplicatesConversationsSkipped || 0);
        message = this.t('folder_import_success_skipped')
          .replace('{folders}', String(stats.foldersImported))
          .replace('{conversations}', String(stats.conversationsImported))
          .replace('{skipped}', String(totalSkipped));
      }

      this.showNotification(message, 'success');
      this.debug('Import successful:', stats);
    } catch (error) {
      console.error('[FolderManager] Import error:', error);
      this.showNotification(
        this.t('folder_import_error').replace('{error}', String(error)),
        'error',
      );
    } finally {
      // Always release the lock, even if an error occurred
      this.importInProgress = false;
    }
  }

  private showNotification(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `gv-notification gv-notification-${type}`;
    notification.textContent = message;

    // Add to body
    document.body.appendChild(notification);

    // Trigger animation
    setTimeout(() => notification.classList.add('show'), 10);

    // Remove after 3 seconds
    setTimeout(() => {
      notification.classList.remove('show');
      setTimeout(() => notification.remove(), 300);
    }, 3000);
  }
}
