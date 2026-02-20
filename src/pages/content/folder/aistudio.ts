import browser from 'webextension-polyfill';

import { DataBackupService } from '@/core/services/DataBackupService';
import { getStorageMonitor } from '@/core/services/StorageMonitor';
import { StorageKeys } from '@/core/types/common';
import type { PromptItem } from '@/core/types/sync';
import { isSafari } from '@/core/utils/browser';
import { createTranslator, initI18n } from '@/utils/i18n';

import type { ConversationReference, DragData, Folder, FolderData } from './types';

function waitForElement<T extends Element = Element>(
  selector: string,
  timeoutMs = 10000,
): Promise<T | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector) as T | null;
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector) as T | null;
      if (el) {
        try {
          obs.disconnect();
        } catch {}
        resolve(el);
      }
    });
    try {
      obs.observe(document.body, { childList: true, subtree: true });
    } catch {}
    if (timeoutMs > 0) {
      setTimeout(() => {
        try {
          obs.disconnect();
        } catch {}
        resolve(null);
      }, timeoutMs);
    }
  });
}

function normalizeText(text: string | null | undefined): string {
  try {
    return String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

function downloadJSON(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try {
      document.body.removeChild(a);
    } catch {}
    URL.revokeObjectURL(url);
  }, 0);
}

function now(): number {
  return Date.now();
}

function uid(): string {
  return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

const NOTIFICATION_TIMEOUT_MS = 5000;
const PROMPT_LINK_SELECTOR = 'a.prompt-link[href^="/prompts/"]';
const UNBOUND_PROMPT_LINK_SELECTOR = `${PROMPT_LINK_SELECTOR}:not([data-gv-drag-bound])`;
const PROMPT_LIST_BIND_DEBOUNCE_MS = 120;
const PROMPT_TITLE_SYNC_DEBOUNCE_MS = 280;
const PROMPT_DRAG_HOST_SELECTORS = [
  '[data-test-id^="history-item"]',
  '[role="listitem"]',
  '.mat-mdc-list-item',
  'li',
];

function nodeContainsPromptLink(node: Node): boolean {
  if (!(node instanceof Element)) return false;
  if (node.matches(PROMPT_LINK_SELECTOR)) return true;
  return !!node.querySelector(PROMPT_LINK_SELECTOR);
}

export function mutationAddsPromptLinks(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    for (const node of Array.from(mutation.addedNodes)) {
      if (nodeContainsPromptLink(node)) return true;
    }
  }
  return false;
}

function mutationMayAffectPromptTitles(mutations: MutationRecord[]): boolean {
  for (const mutation of mutations) {
    if (mutation.type === 'characterData') {
      if (mutation.target.parentElement?.closest(PROMPT_LINK_SELECTOR)) return true;
      continue;
    }

    if (mutation.type === 'attributes') {
      if (mutation.target instanceof Element && mutation.target.closest(PROMPT_LINK_SELECTOR))
        return true;
      continue;
    }

    if (mutation.type === 'childList') {
      if (mutation.target instanceof Element && mutation.target.closest(PROMPT_LINK_SELECTOR)) {
        return true;
      }

      for (const node of Array.from(mutation.addedNodes)) {
        if (nodeContainsPromptLink(node)) return true;
      }
      for (const node of Array.from(mutation.removedNodes)) {
        if (nodeContainsPromptLink(node)) return true;
      }
    }
  }
  return false;
}

function extractPromptIdFromHref(rawHref: string): string | null {
  const href = String(rawHref || '').trim();
  if (!href) return null;
  const match = href.match(/\/prompts\/([^/?#]+)/);
  if (match && match[1]) return match[1];
  try {
    const url = new URL(href, location.origin);
    const pathMatch = url.pathname.match(/\/prompts\/([^/?#]+)/);
    return pathMatch?.[1] || null;
  } catch {
    return null;
  }
}

function normalizeDroppedUrl(raw: string): string | null {
  const firstLine = String(raw || '')
    .split(/\r?\n/, 1)[0]
    ?.trim();
  if (!firstLine) return null;
  if (/^https?:\/\//i.test(firstLine)) return firstLine;
  if (firstLine.startsWith('/')) return `${location.origin}${firstLine}`;
  return null;
}

export function parseDragDataPayload(raw: string): DragData | null {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      (parsed as { type?: unknown }).type === 'conversation' &&
      typeof (parsed as { conversationId?: unknown }).conversationId === 'string'
    ) {
      const data = parsed as DragData;
      return {
        type: 'conversation',
        conversationId: data.conversationId,
        title: typeof data.title === 'string' ? data.title : '',
        url: typeof data.url === 'string' ? data.url : '',
      };
    }
  } catch {}

  const normalizedUrl = normalizeDroppedUrl(trimmed);
  if (!normalizedUrl) return null;
  const conversationId = extractPromptIdFromHref(normalizedUrl);
  if (!conversationId) return null;

  return {
    type: 'conversation',
    conversationId,
    title: '',
    url: normalizedUrl,
  };
}

/**
 * Validate folder data structure
 */
function validateFolderData(data: unknown): boolean {
  if (typeof data !== 'object' || data === null) return false;
  const d = data as Record<string, unknown>;
  return Array.isArray(d.folders) && typeof d.folderContents === 'object';
}

export class AIStudioFolderManager {
  private t: (key: string) => string = (k) => k;
  private data: FolderData = { folders: [], folderContents: {} };
  private container: HTMLElement | null = null;
  private historyRoot: HTMLElement | null = null;
  private cleanupFns: Array<() => void> = [];
  private promptListBindTimer: number | null = null;
  private promptTitleSyncTimer: number | null = null;
  private promptTitleSyncInProgress: boolean = false;
  private readonly STORAGE_KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
  private folderEnabled: boolean = true; // Whether folder feature is enabled
  private backupService!: DataBackupService<FolderData>; // Initialized in init()
  private sidebarWidth: number = 360; // Default sidebar width (increased to reduce text truncation)
  private readonly SIDEBAR_WIDTH_KEY = 'gvAIStudioSidebarWidth';
  private readonly MIN_SIDEBAR_WIDTH = 240;
  private readonly MAX_SIDEBAR_WIDTH = 600;
  private readonly UNCATEGORIZED_KEY = '__uncategorized__'; // Special key for root-level conversations

  // Helper to create a ligature icon span with a data-icon attribute
  private createIcon(name: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'google-symbols';
    try {
      span.dataset.icon = name;
    } catch {}
    span.textContent = name;
    return span;
  }

  async init(): Promise<void> {
    await initI18n();
    this.t = createTranslator();

    // Initialize backup service
    this.backupService = new DataBackupService<FolderData>('aistudio-folders', validateFolderData);

    // Setup automatic backup before page unload
    this.backupService.setupBeforeUnloadBackup(() => this.data);

    // Initialize storage quota monitor
    const storageMonitor = getStorageMonitor({
      checkIntervalMs: 120000, // Check every 2 minutes (less frequent for AI Studio)
    });

    // Use custom notification callback to match our style
    storageMonitor.setNotificationCallback((message, level) => {
      this.showNotification(message, level);
    });

    // Start monitoring
    storageMonitor.startMonitoring();

    // Migrate data from chrome.storage.sync to chrome.storage.local (one-time)
    await this.migrateFromSyncToLocal();

    // Only enable on prompts, library, or root pages
    // Root path (/) is where the main playground is, prompts are saved chats, library is history
    const isValidPath =
      /^\/(prompts|library)(\/|$)/.test(location.pathname) || location.pathname === '/';
    if (!isValidPath) return;

    // Load folder enabled setting
    await this.loadFolderEnabledSetting();

    // Load sidebar width setting
    await this.loadSidebarWidth();

    // Set up storage change listener (always needed to respond to setting changes)
    this.setupStorageListener();

    // Setup message listener for sync operations (always needed)
    this.setupMessageListener();

    // If folder feature is disabled, skip initialization
    if (!this.folderEnabled) {
      return;
    }

    // Initialize folder UI
    await this.initializeFolderUI();
  }

  /**
   * Migrate folder data from chrome.storage.sync to chrome.storage.local
   * This is a one-time migration for users upgrading from older versions
   * Benefits: No 100KB quota limit, consistent with Gemini storage
   */
  private async migrateFromSyncToLocal(): Promise<void> {
    try {
      // Check if there's data in chrome.storage.sync
      const syncResult = await chrome.storage.sync.get(this.STORAGE_KEY);
      const syncData = syncResult[this.STORAGE_KEY];

      if (syncData && validateFolderData(syncData)) {
        // Check if chrome.storage.local already has data
        const localResult = await chrome.storage.local.get(this.STORAGE_KEY);
        const localData = localResult[this.STORAGE_KEY];

        if (!localData || !validateFolderData(localData)) {
          // Migrate sync data to local storage
          await chrome.storage.local.set({ [this.STORAGE_KEY]: syncData });
          console.log('[AIStudioFolderManager] Migrated folder data from sync to local storage');

          // Optionally clear sync storage after successful migration
          // await chrome.storage.sync.remove(this.STORAGE_KEY);
        } else {
          // Both have data - merge them (local takes priority for conflicts)
          const mergedFolders = this.mergeFolderData(localData, syncData);
          await chrome.storage.local.set({ [this.STORAGE_KEY]: mergedFolders });
          console.log('[AIStudioFolderManager] Merged sync and local folder data');
        }
      }
    } catch (error) {
      console.warn('[AIStudioFolderManager] Migration from sync to local failed:', error);
      // Don't throw - migration failure should not block normal operation
    }
  }

  /**
   * Simple merge of folder data (used during migration)
   * Local data takes priority for conflicts
   */
  private mergeFolderData(local: FolderData, sync: FolderData): FolderData {
    const mergedFolders = [...local.folders];
    const localFolderIds = new Set(local.folders.map((f) => f.id));

    // Add folders from sync that don't exist in local
    for (const folder of sync.folders) {
      if (!localFolderIds.has(folder.id)) {
        mergedFolders.push(folder);
      }
    }

    // Merge folder contents
    const mergedContents = { ...local.folderContents };
    for (const [folderId, conversations] of Object.entries(sync.folderContents)) {
      if (!mergedContents[folderId]) {
        mergedContents[folderId] = conversations;
      } else {
        // Merge conversations, avoiding duplicates
        const existingIds = new Set(mergedContents[folderId].map((c) => c.conversationId));
        for (const conv of conversations) {
          if (!existingIds.has(conv.conversationId)) {
            mergedContents[folderId].push(conv);
          }
        }
      }
    }

    return { folders: mergedFolders, folderContents: mergedContents };
  }

  /**
   * Setup message listener for sync operations
   * Handles gv.sync.requestData and gv.folders.reload messages from popup
   */
  private setupMessageListener(): void {
    browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      const msg = message as Record<string, unknown>;
      // Handle request for folder data (for cloud sync upload)
      if (msg?.type === 'gv.sync.requestData') {
        console.log('[AIStudioFolderManager] Received request for folder data from popup');
        sendResponse({
          ok: true,
          data: this.data,
        });
        return true;
      }

      // Handle reload request (after cloud sync download)
      if (msg?.type === 'gv.folders.reload') {
        console.log('[AIStudioFolderManager] Received reload request from sync');
        this.load().then(() => {
          this.render();
          console.log('[AIStudioFolderManager] Folder data reloaded from sync');
        });
        sendResponse({ ok: true });
        return true;
      }

      // Return true for all messages to keep the channel open
      return true;
    });
  }

  private async initializeFolderUI(): Promise<void> {
    // Find the prompt history component and sidebar region
    this.historyRoot = (await waitForElement<HTMLElement>('ms-prompt-history-v3')) || null;

    // On /library page, historyRoot may not exist, but we still need to load data
    // and observe the library table for draggable elements
    const isLibraryPage = /\/library(\/|$)/.test(location.pathname);

    if (!this.historyRoot && !isLibraryPage) return;

    try {
      document.documentElement.classList.add('gv-aistudio-root');
    } catch {}

    await this.load();

    // Only inject folder UI on prompts pages where historyRoot exists
    if (this.historyRoot) {
      this.injectUI();
      this.observePromptList();
      this.bindDraggablesInPromptList();
      await this.syncConversationTitlesFromPromptList();

      // Highlight current conversation initially and on navigation
      this.highlightActiveConversation();
      this.installRouteChangeListener();

      // Apply initial sidebar width (force on first load)
      this.applySidebarWidth(true);

      // Add resize handle for sidebar width adjustment
      this.addResizeHandle();
    }

    // On library page, observe and bind draggables to table rows
    if (isLibraryPage) {
      this.observeLibraryTable();
      this.bindDraggablesInLibraryTable();
      this.injectLibraryDropZone();
    }
  }

  private async load(): Promise<void> {
    try {
      // Use chrome.storage.local (migrated from sync)
      const result = await chrome.storage.local.get(this.STORAGE_KEY);
      const data = result[this.STORAGE_KEY];

      if (data && validateFolderData(data)) {
        this.data = data;
        // Create primary backup on successful load
        this.backupService.createPrimaryBackup(this.data);
      } else {
        // Don't immediately clear data - try to recover from backup
        console.warn(
          '[AIStudioFolderManager] Storage returned no data, attempting recovery from backup',
        );
        this.attemptDataRecovery(null);
      }
    } catch (error) {
      console.error('[AIStudioFolderManager] Load error:', error);
      // CRITICAL: Don't clear data on error - attempt recovery from backup
      this.attemptDataRecovery(error);
    }
  }

  private async save(): Promise<void> {
    try {
      // Create emergency backup BEFORE saving (snapshot of previous state)
      this.backupService.createEmergencyBackup(this.data);

      // Save to chrome.storage.local (migrated from sync)
      await chrome.storage.local.set({ [this.STORAGE_KEY]: this.data });

      // Create primary backup AFTER successful save
      this.backupService.createPrimaryBackup(this.data);
    } catch (error) {
      console.error('[AIStudioFolderManager] Save error:', error);
      // Show error notification to user
      this.showErrorNotification('Failed to save folder data. Changes may not be persisted.');
    }
  }

  private injectUI(): void {
    if (this.container && document.body.contains(this.container)) return;

    const container = document.createElement('div');
    // Scope aistudio-specific styles under .gv-aistudio to avoid impacting Gemini
    container.className = 'gv-folder-container gv-aistudio';

    const header = document.createElement('div');
    header.className = 'gv-folder-header';

    const title = document.createElement('div');
    title.className = 'gv-folder-title gds-label-l';
    title.textContent = this.t('folder_title');
    header.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'gv-folder-header-actions';
    header.appendChild(actions);

    // For AI Studio, hide import/export for now to simplify UI

    // Cloud buttons (Skip on Safari as it doesn't support cloud sync yet)
    if (!isSafari()) {
      // Cloud upload button
      const cloudUploadButton = document.createElement('button');
      cloudUploadButton.className = 'gv-folder-action-btn';
      cloudUploadButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q25-92 100-149t170-57q117 0 198.5 81.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H520q-33 0-56.5-23.5T440-240v-206l-64 62-56-56 160-160 160 160-56 56-64-62v206h220q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-83-58.5-141.5T480-720q-83 0-141.5 58.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h100v80H260Zm220-280Z"/></svg>`;
      cloudUploadButton.title = this.t('folder_cloud_upload');
      cloudUploadButton.addEventListener('click', () => this.handleCloudUpload());
      // Add dynamic tooltip on mouseenter
      cloudUploadButton.addEventListener('mouseenter', async () => {
        const tooltip = await this.getCloudUploadTooltip();
        cloudUploadButton.title = tooltip;
      });
      actions.appendChild(cloudUploadButton);

      // Cloud sync button
      const cloudSyncButton = document.createElement('button');
      cloudSyncButton.className = 'gv-folder-action-btn';
      cloudSyncButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" height="20px" viewBox="0 -960 960 960" width="20px" fill="currentColor"><path d="M260-160q-91 0-155.5-63T40-377q0-78 47-139t123-78q17-72 85-137t145-65q33 0 56.5 23.5T520-716v242l64-62 56 56-160 160-160-160 56-56 64 62v-242q-76 14-118 73.5T280-520h-20q-58 0-99 41t-41 99q0 58 41 99t99 41h480q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-80q0-48-22-89.5T600-680v-93q74 35 117 103.5T760-520q69 8 114.5 59.5T920-340q0 75-52.5 127.5T740-160H260Zm220-358Z"/></svg>`;
      cloudSyncButton.title = this.t('folder_cloud_sync');
      cloudSyncButton.addEventListener('click', () => this.handleCloudSync());
      // Add dynamic tooltip on mouseenter
      cloudSyncButton.addEventListener('mouseenter', async () => {
        const tooltip = await this.getCloudSyncTooltip();
        cloudSyncButton.title = tooltip;
      });
      actions.appendChild(cloudSyncButton);
    }

    // Add folder
    const addBtn = document.createElement('button');
    addBtn.className = 'gv-folder-add-btn';
    addBtn.title = this.t('folder_create');
    addBtn.appendChild(this.createIcon('add'));
    addBtn.addEventListener('click', () => this.createFolder());
    actions.appendChild(addBtn);

    const list = document.createElement('div');
    list.className = 'gv-folder-list';
    container.appendChild(header);
    container.appendChild(list);

    // Insert before prompt history
    const root = this.historyRoot;
    if (!root) return;
    const host: Element = root.parentElement ?? root;
    host.insertAdjacentElement('beforebegin', container);

    this.container = container;
    this.injectStyles();
    this.render();

    // Apply initial folder enabled setting
    this.applyFolderEnabledSetting();
  }

  private injectStyles(): void {
    const styleId = 'gv-aistudio-folder-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .gv-folder-confirm-dialog.gv-aistudio-confirm {
        background: var(--gem-sys-color-surface, #fff);
        border: 1px solid var(--gem-sys-color-outline-variant, #e5e7eb);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
        padding: 16px;
        min-width: 280px;
        font-family: 'Google Sans', 'Segoe UI', sans-serif;
        animation: gv-fade-in 0.2s ease-out;
      }
      
      .gv-confirm-message {
        margin-bottom: 16px;
        color: var(--gem-sys-color-on-surface, #1f2937);
        font-size: 14px;
        line-height: 1.5;
        font-weight: 500;
      }

      .gv-confirm-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end; /* Default right align, but we override order */
      }

      .gv-confirm-btn {
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s;
        border: none;
        outline: none;
      }

      .gv-confirm-delete {
        background-color: #ef4444; /* Red color */
        color: white;
        box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
      }
      
      .gv-confirm-delete:hover {
        background-color: #dc2626;
        box-shadow: 0 4px 6px rgba(239, 68, 68, 0.3);
      }

      .gv-confirm-cancel {
        background-color: transparent;
        color: var(--gem-sys-color-on-surface-variant, #4b5563);
        border: 1px solid var(--gem-sys-color-outline, #d1d5db);
      }

      .gv-confirm-cancel:hover {
        background-color: var(--gem-sys-color-surface-container-high, #f3f4f6);
        color: var(--gem-sys-color-on-surface, #111827);
      }

      /* Hover effect for remove button in list */
      .gv-conversation-remove-btn:hover {
        background-color: rgba(239, 68, 68, 0.1) !important;
        color: #ef4444 !important;
      }

      .gv-conversation-remove-btn:hover span {
        font-variation-settings: 'FILL' 1, 'wght' 600 !important;
      }

      @keyframes gv-fade-in {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  private render(): void {
    if (!this.container) return;
    const list = this.container.querySelector('.gv-folder-list') as HTMLElement | null;
    if (!list) return;
    list.innerHTML = '';

    // Render only root-level folders here; children are rendered recursively
    const folders = this.data.folders.filter((f) => !f.parentId);
    folders.sort((a, b) => {
      const ap = a.pinned ? 1 : 0;
      const bp = b.pinned ? 1 : 0;
      if (ap !== bp) return bp - ap;
      return a.createdAt - b.createdAt;
    });

    for (const f of folders) {
      list.appendChild(this.renderFolder(f));
    }

    // Root drop zone
    const rootDrop = document.createElement('div');
    rootDrop.className = 'gv-folder-root-drop';
    rootDrop.textContent = '';
    this.bindDropZone(rootDrop, null);
    list.appendChild(rootDrop);

    // Render uncategorized conversations (dropped to root)
    const uncategorized = this.data.folderContents[this.UNCATEGORIZED_KEY] || [];
    if (uncategorized.length > 0) {
      const uncatSection = document.createElement('div');
      uncatSection.className = 'gv-folder-uncategorized';

      const uncatHeader = document.createElement('div');
      uncatHeader.className = 'gv-folder-uncategorized-header';
      uncatHeader.innerHTML = `<span class="google-symbols" data-icon="inbox" style="margin-right: 6px;">inbox</span>${this.t('folder_uncategorized') || 'Uncategorized'}`;
      uncatSection.appendChild(uncatHeader);

      const uncatContent = document.createElement('div');
      uncatContent.className = 'gv-folder-uncategorized-content';
      for (const conv of uncategorized) {
        uncatContent.appendChild(this.renderConversation(this.UNCATEGORIZED_KEY, conv));
      }
      uncatSection.appendChild(uncatContent);
      list.appendChild(uncatSection);
    }

    // After rendering, update active highlight
    this.highlightActiveConversation();
  }

  private getCurrentPromptIdFromLocation(): string | null {
    try {
      const m = (location.pathname || '').match(/\/prompts\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch {
      return null;
    }
  }

  private highlightActiveConversation(): void {
    if (!this.container) return;
    const currentId = this.getCurrentPromptIdFromLocation();
    const rows = this.container.querySelectorAll(
      '.gv-folder-conversation',
    ) as NodeListOf<HTMLElement>;
    rows.forEach((row) => {
      const isActive = currentId && row.dataset.conversationId === currentId;
      row.classList.toggle('gv-folder-conversation-selected', !!isActive);
    });
  }

  private installRouteChangeListener(): void {
    const update = () => setTimeout(() => this.highlightActiveConversation(), 0);
    try {
      window.addEventListener('popstate', update);
    } catch {}
    try {
      const hist = history as History & Record<string, unknown>;
      const wrap = (method: 'pushState' | 'replaceState') => {
        const orig = hist[method] as (...args: unknown[]) => unknown;
        hist[method] = function (...args: unknown[]) {
          const ret = orig.apply(this, args);
          try {
            update();
          } catch {}
          return ret;
        };
      };
      wrap('pushState');
      wrap('replaceState');
    } catch {}
    // Fallback poller for routers that bypass events
    try {
      let last = location.pathname;
      const id = window.setInterval(() => {
        const now = location.pathname;
        if (now !== last) {
          last = now;
          update();
        }
      }, 400);
      this.cleanupFns.push(() => {
        try {
          clearInterval(id);
        } catch {}
      });
    } catch {}
  }

  private renderFolder(folder: Folder, level: number = 0): HTMLElement {
    const item = document.createElement('div');
    item.className = 'gv-folder-item';
    item.dataset.folderId = folder.id;
    item.dataset.pinned = folder.pinned ? 'true' : 'false';
    item.dataset.level = String(level);

    const header = document.createElement('div');
    header.className = 'gv-folder-item-header';
    // Add left padding for nested folders
    header.style.paddingLeft = `${level * 16 + 8}px`;
    item.appendChild(header);
    // Allow dropping directly on folder header
    this.bindDropZone(header, folder.id);

    const expandBtn = document.createElement('button');
    expandBtn.className = 'gv-folder-expand-btn';
    expandBtn.appendChild(this.createIcon(folder.isExpanded ? 'expand_more' : 'chevron_right'));
    expandBtn.addEventListener('click', () => {
      folder.isExpanded = !folder.isExpanded;
      this.save().then(() => this.render());
    });
    header.appendChild(expandBtn);

    const icon = document.createElement('span');
    icon.className = 'gv-folder-icon google-symbols';
    icon.dataset.icon = 'folder';
    icon.textContent = 'folder';
    header.appendChild(icon);

    const name = document.createElement('span');
    name.className = 'gv-folder-name gds-label-l';
    name.textContent = folder.name;
    name.addEventListener('dblclick', () => this.renameFolder(folder.id));
    header.appendChild(name);

    const pinBtn = document.createElement('button');
    pinBtn.className = 'gv-folder-pin-btn';
    pinBtn.title = folder.pinned ? this.t('folder_unpin') : this.t('folder_pin');
    try {
      pinBtn.dataset.state = folder.pinned ? 'pinned' : 'unpinned';
    } catch {}
    pinBtn.appendChild(this.createIcon('push_pin'));
    pinBtn.addEventListener('click', () => {
      folder.pinned = !folder.pinned;
      this.save().then(() => this.render());
    });
    header.appendChild(pinBtn);

    const moreBtn = document.createElement('button');
    moreBtn.className = 'gv-folder-actions-btn';
    moreBtn.appendChild(this.createIcon('more_vert'));
    moreBtn.addEventListener('click', (e) => this.openFolderMenu(e, folder.id));
    header.appendChild(moreBtn);

    // Content (conversations and subfolders)
    if (folder.isExpanded) {
      const content = document.createElement('div');
      content.className = 'gv-folder-content';
      this.bindDropZone(content, folder.id);

      // Render conversations in this folder
      const convs = this.data.folderContents[folder.id] || [];
      for (const conv of convs) {
        const convEl = this.renderConversation(folder.id, conv);
        // Add indentation for nested conversations
        convEl.style.paddingLeft = `${(level + 1) * 16 + 8}px`;
        content.appendChild(convEl);
      }

      // Render subfolders (only for root-level folders, creating 2-level hierarchy)
      if (level === 0) {
        const subfolders = this.data.folders.filter((f) => f.parentId === folder.id);
        // Sort subfolders: pinned first, then by creation time
        subfolders.sort((a, b) => {
          const ap = a.pinned ? 1 : 0;
          const bp = b.pinned ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return a.createdAt - b.createdAt;
        });
        for (const subfolder of subfolders) {
          content.appendChild(this.renderFolder(subfolder, level + 1));
        }
      }

      item.appendChild(content);
    }

    return item;
  }

  private renderConversation(folderId: string, conv: ConversationReference): HTMLElement {
    const row = document.createElement('div');
    row.className = conv.starred ? 'gv-folder-conversation gv-starred' : 'gv-folder-conversation';
    row.dataset.folderId = folderId;
    row.dataset.conversationId = conv.conversationId;

    const icon = document.createElement('span');
    icon.className = 'gv-conversation-icon google-symbols';
    icon.dataset.icon = 'chat';
    icon.textContent = 'chat';
    row.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'gv-conversation-title gds-label-l';
    title.textContent = conv.title || this.t('conversation_untitled');
    row.appendChild(title);

    const starBtn = document.createElement('button');
    starBtn.className = conv.starred
      ? 'gv-conversation-star-btn starred'
      : 'gv-conversation-star-btn';
    starBtn.appendChild(this.createIcon(conv.starred ? 'star' : 'star_outline'));
    starBtn.title = conv.starred ? this.t('conversation_unstar') : this.t('conversation_star');
    starBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      conv.starred = !conv.starred;
      this.save().then(() => this.render());
    });
    row.appendChild(starBtn);

    const removeBtn = document.createElement('button');
    removeBtn.className = 'gv-conversation-remove-btn';
    removeBtn.appendChild(this.createIcon('close'));
    removeBtn.title = this.t('folder_remove_conversation');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmRemoveConversation(folderId, conv.conversationId, conv.title || '', e);
    });
    row.appendChild(removeBtn);

    row.addEventListener('click', () => this.navigateToPrompt(conv.conversationId, conv.url));

    row.draggable = true;
    row.addEventListener('dragstart', (e) => {
      const data: DragData = {
        type: 'conversation',
        conversationId: conv.conversationId,
        title: conv.title,
        url: conv.url,
        sourceFolderId: folderId,
      };
      try {
        e.dataTransfer?.setData('application/json', JSON.stringify(data));
      } catch {}
      try {
        e.dataTransfer?.setDragImage(row, 10, 10);
      } catch {}
    });

    return row;
  }

  private openFolderMenu(ev: MouseEvent, folderId: string): void {
    ev.stopPropagation();
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;

    const menu = document.createElement('div');
    menu.className = 'gv-context-menu';

    // Only show "Create subfolder" for root-level folders (to maintain 2-level hierarchy)
    if (!folder.parentId) {
      const createSub = document.createElement('button');
      createSub.textContent = this.t('folder_create_subfolder') || 'Create Subfolder';
      createSub.addEventListener('click', () => {
        this.createFolder(folderId);
        try {
          document.body.removeChild(menu);
        } catch {}
      });
      menu.appendChild(createSub);
    }

    const rename = document.createElement('button');
    rename.textContent = this.t('folder_rename');
    rename.addEventListener('click', () => {
      this.renameFolder(folderId);
      try {
        document.body.removeChild(menu);
      } catch {}
    });
    menu.appendChild(rename);

    const del = document.createElement('button');
    del.textContent = this.t('folder_delete');
    del.addEventListener('click', () => {
      this.deleteFolder(folderId);
      try {
        document.body.removeChild(menu);
      } catch {}
    });
    menu.appendChild(del);

    // Apply styles with proper typing
    const st = menu.style;
    st.position = 'fixed';
    st.top = `${ev.clientY}px`;
    st.left = `${ev.clientX}px`;
    st.zIndex = String(2147483647);
    st.display = 'flex';
    st.flexDirection = 'column';
    document.body.appendChild(menu);
    const onClickAway = (e: MouseEvent) => {
      if (e.target instanceof Node && !menu.contains(e.target)) {
        try {
          document.body.removeChild(menu);
        } catch {}
        window.removeEventListener('click', onClickAway, true);
      }
    };
    window.addEventListener('click', onClickAway, true);
  }

  private async createFolder(parentId: string | null = null): Promise<void> {
    const name = prompt(this.t('folder_name_prompt'));
    if (!name) return;
    const f: Folder = {
      id: uid(),
      name: name.trim(),
      parentId: parentId || null,
      isExpanded: true,
      createdAt: now(),
      updatedAt: now(),
    };
    this.data.folders.push(f);
    this.data.folderContents[f.id] = [];
    await this.save();
    this.render();
  }

  private async renameFolder(folderId: string): Promise<void> {
    const folder = this.data.folders.find((f) => f.id === folderId);
    if (!folder) return;
    const name = prompt(this.t('folder_rename_prompt'), folder.name);
    if (!name) return;
    folder.name = name.trim();
    folder.updatedAt = now();
    await this.save();
    this.render();
  }

  private async deleteFolder(folderId: string): Promise<void> {
    if (!confirm(this.t('folder_delete_confirm'))) return;

    // Collect all folder IDs to delete (including subfolders)
    const folderIdsToDelete: string[] = [folderId];
    const subfolders = this.data.folders.filter((f) => f.parentId === folderId);
    for (const subfolder of subfolders) {
      folderIdsToDelete.push(subfolder.id);
    }

    // Delete all collected folders and their contents
    this.data.folders = this.data.folders.filter((f) => !folderIdsToDelete.includes(f.id));
    for (const id of folderIdsToDelete) {
      delete this.data.folderContents[id];
    }

    await this.save();
    this.render();
  }

  private removeConversationFromFolder(folderId: string, conversationId: string): void {
    const arr = this.data.folderContents[folderId] || [];
    this.data.folderContents[folderId] = arr.filter((c) => c.conversationId !== conversationId);
    this.save().then(() => this.render());
  }

  private confirmRemoveConversation(
    folderId: string,
    conversationId: string,
    title: string,
    event: MouseEvent,
  ): void {
    const dialog = document.createElement('div');
    dialog.className = 'gv-folder-confirm-dialog gv-aistudio-confirm';

    // Position near the button
    const target = event.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();

    dialog.style.position = 'fixed';
    dialog.style.zIndex = '2147483647';
    // Position logic: prefer left side if space available
    // AI Studio sidebar is on the left, so we might want to pop out to the right or below
    // But usually context menus appear near the cursor.
    // Let's position it below the button, aligned right
    dialog.style.top = `${rect.bottom + 4}px`;
    dialog.style.left = `${rect.right - 200}px`; // Align right edge roughly

    // Ensure it's on screen
    if (parseInt(dialog.style.left) < 10) dialog.style.left = '10px';

    const msg = document.createElement('div');
    msg.className = 'gv-confirm-message';
    msg.textContent = this.t('folder_remove_conversation_confirm').replace(
      '{title}',
      title || this.t('conversation_untitled'),
    );
    dialog.appendChild(msg);

    const actions = document.createElement('div');
    actions.className = 'gv-confirm-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'gv-confirm-btn gv-confirm-delete';
    confirmBtn.textContent = this.t('pm_delete') || 'Delete';
    confirmBtn.addEventListener('click', () => {
      this.removeConversationFromFolder(folderId, conversationId);
      dialog.remove();
      document.removeEventListener('click', closeOnOutside);
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'gv-confirm-btn gv-confirm-cancel';
    cancelBtn.textContent = this.t('pm_cancel') || 'Cancel';
    cancelBtn.addEventListener('click', () => {
      dialog.remove();
      document.removeEventListener('click', closeOnOutside);
    });

    // Delete on left, Cancel on right
    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    dialog.appendChild(actions);

    document.body.appendChild(dialog);

    // Close when clicking outside
    const closeOnOutside = (e: MouseEvent) => {
      if (
        !dialog.contains(e.target as Node) &&
        e.target !== target &&
        !target.contains(e.target as Node)
      ) {
        dialog.remove();
        document.removeEventListener('click', closeOnOutside);
      }
    };

    // Delay adding the listener to avoid immediate closing
    setTimeout(() => {
      document.addEventListener('click', closeOnOutside);
    }, 10);
  }

  private bindDropZone(el: HTMLElement, targetFolderId: string | null): void {
    // Use a counter to properly track nested dragenter/dragleave events
    // This fixes the issue where child elements trigger spurious leave events
    let dragEnterCounter = 0;

    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      dragEnterCounter++;
      // Only add class on first enter
      if (dragEnterCounter === 1) {
        el.classList.add('gv-folder-dragover');
      }
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      try {
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
      } catch {}
    });
    el.addEventListener('dragleave', (e) => {
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      dragEnterCounter--;
      // Only remove class when truly leaving the container (counter reaches 0)
      // Also check relatedTarget as a fallback
      if (dragEnterCounter <= 0) {
        dragEnterCounter = 0; // Prevent negative values
        // Double-check: if relatedTarget is still inside, don't remove
        const related = e.relatedTarget as Node | null;
        if (!related || !el.contains(related)) {
          el.classList.remove('gv-folder-dragover');
        }
      }
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation(); // Prevent bubbling to parent drop zones
      dragEnterCounter = 0; // Reset counter on drop
      el.classList.remove('gv-folder-dragover');
      const data = this.parseDragDataFromEvent(e);
      if (!data || data.type !== 'conversation' || !data.conversationId) return;
      const conv: ConversationReference = {
        conversationId: data.conversationId,
        title: normalizeText(data.title) || this.t('conversation_untitled'),
        url: data.url || '',
        addedAt: now(),
      };
      const folderId = targetFolderId;
      if (!folderId || folderId === this.UNCATEGORIZED_KEY) {
        // Drop to root or uncategorized section: move to uncategorized section
        // First remove from any existing folder
        Object.keys(this.data.folderContents).forEach((fid) => {
          if (fid === this.UNCATEGORIZED_KEY) return; // Don't remove from uncategorized yet
          this.data.folderContents[fid] = (this.data.folderContents[fid] || []).filter(
            (c) => c.conversationId !== conv.conversationId,
          );
        });
        // Add to uncategorized if not already there
        const uncatArr = this.data.folderContents[this.UNCATEGORIZED_KEY] || [];
        const existsInUncat = uncatArr.some((c) => c.conversationId === conv.conversationId);
        if (!existsInUncat) {
          uncatArr.push(conv);
          this.data.folderContents[this.UNCATEGORIZED_KEY] = uncatArr;
        }
      } else {
        const arr = this.data.folderContents[folderId] || [];
        const exists = arr.some((c) => c.conversationId === conv.conversationId);
        if (!exists) {
          arr.push(conv);
          this.data.folderContents[folderId] = arr;
        }
        // If moving from another folder (including uncategorized), remove there
        Object.keys(this.data.folderContents).forEach((fid) => {
          if (fid === folderId) return;
          this.data.folderContents[fid] = (this.data.folderContents[fid] || []).filter(
            (c) => c.conversationId !== conv.conversationId,
          );
        });
      }
      this.save().then(() => this.render());
    });
  }

  private observePromptList(): void {
    const root = this.historyRoot;
    if (!root) return;
    const observer = new MutationObserver((mutations) => {
      if (mutationAddsPromptLinks(mutations)) {
        this.schedulePromptListBinding();
      }
      if (mutationMayAffectPromptTitles(mutations)) {
        this.schedulePromptTitleSync();
      }
    });
    try {
      observer.observe(root, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['title', 'aria-label', 'href'],
      });
    } catch {}
    this.cleanupFns.push(() => {
      try {
        observer.disconnect();
      } catch {}
      if (this.promptListBindTimer !== null) {
        clearTimeout(this.promptListBindTimer);
        this.promptListBindTimer = null;
      }
      if (this.promptTitleSyncTimer !== null) {
        clearTimeout(this.promptTitleSyncTimer);
        this.promptTitleSyncTimer = null;
      }
    });

    // Also update on clicks within the prompt list (SPA navigation)
    const onClick = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const a = target.closest('a.prompt-link') as HTMLAnchorElement | null;
      if (a && /\/prompts\//.test(a.getAttribute('href') || '')) {
        setTimeout(() => this.highlightActiveConversation(), 0);
      }
    };
    try {
      root.addEventListener('click', onClick, true);
    } catch {}
    this.cleanupFns.push(() => {
      try {
        root.removeEventListener('click', onClick, true);
      } catch {}
    });
  }

  private schedulePromptListBinding(): void {
    if (this.promptListBindTimer !== null) return;
    this.promptListBindTimer = window.setTimeout(() => {
      this.promptListBindTimer = null;
      this.bindDraggablesInPromptList();
    }, PROMPT_LIST_BIND_DEBOUNCE_MS);
  }

  private schedulePromptTitleSync(): void {
    if (!this.hasStoredConversations()) return;
    if (this.promptTitleSyncTimer !== null) return;

    this.promptTitleSyncTimer = window.setTimeout(() => {
      this.promptTitleSyncTimer = null;
      void this.runPromptTitleSync();
    }, PROMPT_TITLE_SYNC_DEBOUNCE_MS);
  }

  private async runPromptTitleSync(): Promise<void> {
    if (this.promptTitleSyncInProgress) return;

    this.promptTitleSyncInProgress = true;
    try {
      await this.syncConversationTitlesFromPromptList();
    } finally {
      this.promptTitleSyncInProgress = false;
    }
  }

  private hasStoredConversations(): boolean {
    return Object.values(this.data.folderContents).some(
      (conversations) => conversations.length > 0,
    );
  }

  private extractPromptTitle(anchor: HTMLAnchorElement | null): string | null {
    if (!anchor) return null;

    const aria = normalizeText(anchor.getAttribute('aria-label'));
    if (aria) return aria;

    const title = normalizeText(anchor.getAttribute('title'));
    if (title) return title;

    const text = normalizeText(anchor.textContent);
    if (text) return text;

    return null;
  }

  private getPromptTitleFromNative(conversationId: string): string | null {
    const selectors = [
      `a.prompt-link[href*="/prompts/${conversationId}"]`,
      `a[href*="/prompts/${conversationId}"]`,
      `a.name-btn[href*="/prompts/${conversationId}"]`,
    ];

    for (const selector of selectors) {
      const anchor = document.querySelector(selector) as HTMLAnchorElement | null;
      const title = this.extractPromptTitle(anchor);
      if (title) return title;
    }

    return null;
  }

  private async syncConversationTitlesFromPromptList(): Promise<void> {
    if (!this.hasStoredConversations()) return;

    let hasUpdates = false;
    for (const conversations of Object.values(this.data.folderContents)) {
      for (const conversation of conversations) {
        if (conversation.customTitle) continue;
        const nativeTitle = this.getPromptTitleFromNative(conversation.conversationId);
        if (!nativeTitle || nativeTitle === conversation.title) continue;
        conversation.title = nativeTitle;
        conversation.updatedAt = now();
        hasUpdates = true;
      }
    }

    if (!hasUpdates) return;

    await this.save();
    this.render();
  }

  private resolvePromptAnchorFromHost(hostEl: HTMLElement): HTMLAnchorElement | null {
    if (hostEl.matches(PROMPT_LINK_SELECTOR)) {
      return hostEl as HTMLAnchorElement;
    }
    return hostEl.querySelector(PROMPT_LINK_SELECTOR) as HTMLAnchorElement | null;
  }

  private resolvePromptAnchorFromDragEvent(
    event: DragEvent,
    hostEl: HTMLElement,
  ): HTMLAnchorElement | null {
    const target = event.target;
    if (target instanceof Element) {
      const targetAnchor = target.closest(PROMPT_LINK_SELECTOR) as HTMLAnchorElement | null;
      if (targetAnchor) return targetAnchor;
    }
    return this.resolvePromptAnchorFromHost(hostEl);
  }

  private resolvePromptDragHost(anchor: HTMLAnchorElement): HTMLElement {
    for (const selector of PROMPT_DRAG_HOST_SELECTORS) {
      const match = anchor.closest(selector) as HTMLElement | null;
      if (match) return match;
    }
    return anchor.parentElement || anchor;
  }

  private setPromptDragData(e: DragEvent, data: DragData, dragImageEl: HTMLElement): void {
    try {
      const transfer = e.dataTransfer;
      if (!transfer) return;
      const json = JSON.stringify(data);
      transfer.effectAllowed = 'copyMove';
      transfer.setData('application/json', json);
      transfer.setData('text/plain', json);
      if (data.url) {
        transfer.setData('text/uri-list', data.url);
        transfer.setData('text/x-moz-url', `${data.url}\n${data.title || ''}`);
      }
    } catch {}
    try {
      e.dataTransfer?.setDragImage(dragImageEl, 10, 10);
    } catch {}
  }

  private parseDragDataFromEvent(event: DragEvent): DragData | null {
    const transfer = event.dataTransfer;
    if (!transfer) return null;

    const candidates = [
      transfer.getData('application/json'),
      transfer.getData('text/plain'),
      transfer.getData('text/uri-list'),
      transfer.getData('text/x-moz-url'),
      transfer.getData('URL'),
    ];

    for (const candidate of candidates) {
      if (!candidate) continue;
      const parsed = parseDragDataPayload(candidate);
      if (parsed) return parsed;
    }

    return null;
  }

  private bindDraggablesInPromptList(scope: ParentNode | null = this.historyRoot): void {
    const root = scope ?? this.historyRoot;
    if (!root) return;
    const anchors = root.querySelectorAll(UNBOUND_PROMPT_LINK_SELECTOR);
    anchors.forEach((a) => {
      const anchor = a as HTMLAnchorElement;
      const hostEl = this.resolvePromptDragHost(anchor);
      anchor.dataset.gvDragBound = '1';
      if (!(hostEl as Element & { _gvDragBound?: boolean })._gvDragBound) {
        (hostEl as Element & { _gvDragBound?: boolean })._gvDragBound = true;
        hostEl.draggable = true;
        if (!hostEl.style.cursor) {
          hostEl.style.cursor = 'grab';
        }
        hostEl.addEventListener('dragstart', (e) => {
          const promptAnchor = this.resolvePromptAnchorFromDragEvent(e, hostEl);
          if (!promptAnchor) return;

          const id = this.extractPromptId(promptAnchor);
          const title = normalizeText(promptAnchor.textContent || '');
          const rawHref = promptAnchor.getAttribute('href') || promptAnchor.href || '';
          const url = rawHref.startsWith('http')
            ? rawHref
            : `${location.origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;
          const data: DragData = { type: 'conversation', conversationId: id, title, url };
          this.setPromptDragData(e, data, hostEl);
        });
      }
    });
  }

  /**
   * Observe the library table for dynamic row additions
   * This is needed because the library page loads rows dynamically
   */
  private observeLibraryTable(): void {
    // The library table is within a mat-table element
    const tableRoot = document.querySelector(
      'table.mat-mdc-table, mat-table',
    ) as HTMLElement | null;
    if (!tableRoot) {
      // Fallback: observe entire body for table appearance
      const bodyObserver = new MutationObserver(() => {
        const table = document.querySelector('table.mat-mdc-table, mat-table');
        if (table) {
          this.bindDraggablesInLibraryTable();
        }
      });
      try {
        bodyObserver.observe(document.body, { childList: true, subtree: true });
      } catch {}
      this.cleanupFns.push(() => {
        try {
          bodyObserver.disconnect();
        } catch {}
      });
      return;
    }

    const observer = new MutationObserver(() => {
      this.bindDraggablesInLibraryTable();
    });
    try {
      observer.observe(tableRoot, { childList: true, subtree: true });
    } catch {}
    this.cleanupFns.push(() => {
      try {
        observer.disconnect();
      } catch {}
    });
  }

  /**
   * Bind drag handlers to library table rows
   * Each row contains an anchor with href like /prompts/{id}
   */
  private bindDraggablesInLibraryTable(): void {
    // Find all table rows that contain chat prompt links
    // The structure from user's example: <tr> > <td> > <a href="/prompts/..."> title </a>
    const rows = document.querySelectorAll('tr.mat-mdc-row, tr[mat-row]');
    rows.forEach((row) => {
      const tr = row as HTMLElement;
      // Find the anchor with prompt link in this row
      // Matches: a[href^="/prompts/"] or a.name-btn with /prompts/ in href
      const anchor = tr.querySelector(
        'a[href^="/prompts/"], a.name-btn[href*="/prompts/"]',
      ) as HTMLAnchorElement | null;
      if (!anchor) return;

      // Skip if already bound
      if ((tr as Element & { _gvLibraryDragBound?: boolean })._gvLibraryDragBound) return;
      (tr as Element & { _gvLibraryDragBound?: boolean })._gvLibraryDragBound = true;

      tr.draggable = true;
      tr.style.cursor = 'grab';

      tr.addEventListener('dragstart', (e) => {
        // Prevent interference from Angular Material's own drag handling if any
        e.stopPropagation();

        const id = this.extractPromptId(anchor);
        const title = normalizeText(anchor.textContent || '');
        // Ensure accurate URL construction
        const rawHref = anchor.getAttribute('href') || anchor.href || '';
        const url = rawHref.startsWith('http')
          ? rawHref
          : `${location.origin}${rawHref.startsWith('/') ? '' : '/'}${rawHref}`;

        const data: DragData = { type: 'conversation', conversationId: id, title, url };
        this.setPromptDragData(e, data, tr);

        // Visual feedback
        tr.style.opacity = '0.5';
      });

      tr.addEventListener('dragend', () => {
        tr.style.opacity = '';
      });
    });
  }

  /**
   * Inject a floating drop zone for the library page
   * Shows available folders when user starts dragging
   */
  private injectLibraryDropZone(): void {
    // Create a floating container that appears during drag
    const floatingZone = document.createElement('div');
    floatingZone.className = 'gv-library-drop-zone';
    floatingZone.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      background: rgba(32, 33, 36, 0.95);
      border: 2px dashed rgba(138, 180, 248, 0.5);
      border-radius: 12px;
      padding: 16px;
      min-width: 200px;
      max-width: 300px;
      max-height: 400px;
      overflow-y: auto;
      z-index: 2147483646;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.2s, transform 0.2s;
      transform: translateY(10px);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
      font-family: 'Google Sans', Roboto, Arial, sans-serif;
    `;

    const title = document.createElement('div');
    title.style.cssText = `
      color: #e8eaed;
      font-size: 14px;
      font-weight: 500;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 8px;
    `;
    title.innerHTML = `<span class="google-symbols" style="font-size: 18px;">folder</span>${this.t('folder_title')}`;
    floatingZone.appendChild(title);

    const folderList = document.createElement('div');
    folderList.className = 'gv-library-folder-list';
    floatingZone.appendChild(folderList);

    document.body.appendChild(floatingZone);

    // Update folder list content
    const updateFolderList = () => {
      folderList.innerHTML = '';

      // Add a "Root / Uncategorized" option at the top
      const rootItem = document.createElement('div');
      rootItem.className = 'gv-library-folder-item gv-library-root-item';
      rootItem.style.cssText = `
        padding: 10px 12px;
        margin: 4px 0 12px 0;
        background: rgba(138, 180, 248, 0.1);
        border-radius: 8px;
        color: #8ab4f8;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.15s, border-color 0.15s;
        border: 2px dashed rgba(138, 180, 248, 0.4);
      `;
      rootItem.innerHTML = `<span class="google-symbols" data-icon="inbox">inbox</span>${this.t('folder_uncategorized') || 'Uncategorized'}`;

      const onDropToRoot = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        rootItem.style.background = 'rgba(138, 180, 248, 0.2)';
        rootItem.style.borderColor = '#8ab4f8';

        const data = this.parseDragDataFromEvent(e);
        if (!data || data.type !== 'conversation' || !data.conversationId) return;

        const conv: ConversationReference = {
          conversationId: data.conversationId,
          title: normalizeText(data.title) || this.t('conversation_untitled'),
          url: data.url || '',
          addedAt: now(),
        };

        // Add to uncategorized section
        Object.keys(this.data.folderContents).forEach((fid) => {
          if (fid === this.UNCATEGORIZED_KEY) return;
          this.data.folderContents[fid] = (this.data.folderContents[fid] || []).filter(
            (c) => c.conversationId !== conv.conversationId,
          );
        });

        const uncatArr = this.data.folderContents[this.UNCATEGORIZED_KEY] || [];
        const existsInUncat = uncatArr.some((c) => c.conversationId === conv.conversationId);
        if (!existsInUncat) {
          uncatArr.push(conv);
          this.data.folderContents[this.UNCATEGORIZED_KEY] = uncatArr;
        }

        this.save();
        this.showNotification(
          this.t('conversation_saved_to_root') || 'Saved to Uncategorized',
          'info',
        );
      };

      rootItem.addEventListener('dragenter', (e) => {
        e.preventDefault();
        e.stopPropagation();
        rootItem.style.background = 'rgba(138, 180, 248, 0.3)';
        rootItem.style.borderColor = '#8ab4f8';
      });
      rootItem.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
        } catch {}
      });
      rootItem.addEventListener('dragleave', (e) => {
        e.stopPropagation();
        rootItem.style.background = 'rgba(138, 180, 248, 0.1)';
        rootItem.style.borderColor = 'rgba(138, 180, 248, 0.4)';
      });
      rootItem.addEventListener('drop', onDropToRoot);
      folderList.appendChild(rootItem);

      // Ensure at least one folder exists for the dedicated folder list section
      if (this.data.folders.length === 0) {
        const defaultFolder: Folder = {
          id: uid(),
          name: this.t('folder_default_name') || 'My Folder',
          parentId: null,
          isExpanded: true,
          createdAt: now(),
          updatedAt: now(),
        };
        this.data.folders.push(defaultFolder);
        this.data.folderContents[defaultFolder.id] = [];
        this.save();
      }

      // Render folders with proper hierarchy (root folders + their subfolders)
      const rootFolders = this.data.folders.filter((f) => !f.parentId);
      // Sort root folders: pinned first, then by creation time
      rootFolders.sort((a, b) => {
        const ap = a.pinned ? 1 : 0;
        const bp = b.pinned ? 1 : 0;
        if (ap !== bp) return bp - ap;
        return a.createdAt - b.createdAt;
      });

      // Helper function to create a folder drop item
      const createFolderDropItem = (folder: Folder, isSubfolder: boolean) => {
        const folderItem = document.createElement('div');
        folderItem.className = 'gv-library-folder-item';
        folderItem.dataset.folderId = folder.id;
        const paddingLeft = isSubfolder ? '28px' : '12px';
        folderItem.style.cssText = `
          padding: 10px ${paddingLeft};
          margin: 4px 0;
          background: rgba(255, 255, 255, 0.05);
          border-radius: 8px;
          color: #e8eaed;
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: background 0.15s, border-color 0.15s;
          border: 2px solid transparent;
        `;
        const iconName = isSubfolder ? 'subdirectory_arrow_right' : 'folder';
        folderItem.innerHTML = `<span class="google-symbols" style="font-size: 16px; color: #8ab4f8;">${iconName}</span>${folder.name}`;

        // Bind drop events
        folderItem.addEventListener('dragenter', (e) => {
          e.preventDefault();
          e.stopPropagation();
          folderItem.style.background = 'rgba(138, 180, 248, 0.2)';
          folderItem.style.borderColor = '#8ab4f8';
        });
        folderItem.addEventListener('dragover', (e) => {
          e.preventDefault();
          e.stopPropagation();
          try {
            if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
          } catch {}
        });
        folderItem.addEventListener('dragleave', (e) => {
          e.stopPropagation();
          folderItem.style.background = 'rgba(255, 255, 255, 0.05)';
          folderItem.style.borderColor = 'transparent';
        });
        folderItem.addEventListener('drop', (e) => {
          e.preventDefault();
          e.stopPropagation();
          folderItem.style.background = 'rgba(255, 255, 255, 0.05)';
          folderItem.style.borderColor = 'transparent';

          const data = this.parseDragDataFromEvent(e);
          if (!data || data.type !== 'conversation' || !data.conversationId) return;

          const conv: ConversationReference = {
            conversationId: data.conversationId,
            title: normalizeText(data.title) || this.t('conversation_untitled'),
            url: data.url || '',
            addedAt: now(),
          };

          // Add to this folder
          const arr = this.data.folderContents[folder.id] || [];
          const exists = arr.some((c) => c.conversationId === conv.conversationId);
          if (!exists) {
            arr.push(conv);
            this.data.folderContents[folder.id] = arr;
          }

          // Remove from other folders
          Object.keys(this.data.folderContents).forEach((fid) => {
            if (fid === folder.id) return;
            this.data.folderContents[fid] = (this.data.folderContents[fid] || []).filter(
              (c) => c.conversationId !== conv.conversationId,
            );
          });

          this.save();
          this.showNotification(
            `${this.t('conversation_added_to_folder') || 'Added to'} "${folder.name}"`,
            'info',
          );
        });

        return folderItem;
      };

      // Render root folders and their subfolders
      rootFolders.forEach((rootFolder) => {
        folderList.appendChild(createFolderDropItem(rootFolder, false));

        // Render subfolders of this root folder
        const subfolders = this.data.folders.filter((f) => f.parentId === rootFolder.id);
        subfolders.sort((a, b) => {
          const ap = a.pinned ? 1 : 0;
          const bp = b.pinned ? 1 : 0;
          if (ap !== bp) return bp - ap;
          return a.createdAt - b.createdAt;
        });
        subfolders.forEach((subfolder) => {
          folderList.appendChild(createFolderDropItem(subfolder, true));
        });
      });
    };

    // Show/hide the floating zone on drag events
    const showZone = () => {
      updateFolderList();
      floatingZone.style.opacity = '1';
      floatingZone.style.pointerEvents = 'auto';
      floatingZone.style.transform = 'translateY(0)';
    };

    const hideZone = () => {
      floatingZone.style.opacity = '0';
      floatingZone.style.pointerEvents = 'none';
      floatingZone.style.transform = 'translateY(10px)';
    };

    // Listen for drag events on the document
    const onDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement;
      // Check if the dragged element is or is within a library table row
      const isLibraryRow = target.closest?.('tr.mat-mdc-row, tr[mat-row]');
      if (isLibraryRow) {
        // Also ensure it's not a row from some other table
        const hasPromptLink = isLibraryRow.querySelector('a[href*="/prompts/"]');
        if (hasPromptLink) {
          setTimeout(showZone, 0);
        }
      }
    };

    document.addEventListener('dragstart', onDragStart);

    document.addEventListener('dragend', () => {
      setTimeout(hideZone, 100);
    });

    this.cleanupFns.push(() => {
      try {
        document.removeEventListener('dragstart', onDragStart);
        document.body.removeChild(floatingZone);
      } catch {}
    });
  }

  private extractPromptId(anchor: HTMLAnchorElement): string {
    const rawHref = anchor.getAttribute('href') || anchor.href || '';
    const id = extractPromptIdFromHref(rawHref);
    if (id) return id;

    try {
      const u = new URL(rawHref, location.origin);
      const parts = (u.pathname || '').split('/').filter(Boolean);
      // Expected format: /prompts/{id} -> ['', 'prompts', '{id}']
      if (parts.length >= 2 && parts[0] === 'prompts') {
        return parts[1];
      }
      return parts[1] || rawHref;
    } catch {
      return rawHref;
    }
  }

  private navigateToPrompt(promptId: string, url: string): void {
    // Prefer clicking the native link to preserve SPA behavior
    const selector = `ms-prompt-history-v3 a.prompt-link[href*="/prompts/${promptId}"]`;
    const a = document.querySelector(selector) as HTMLAnchorElement | null;
    if (a) {
      a.click();
      setTimeout(() => this.highlightActiveConversation(), 0);
      return;
    }
    try {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
      setTimeout(() => this.highlightActiveConversation(), 0);
    } catch {
      location.href = url;
    }
  }

  private handleExport(): void {
    const payload = {
      format: 'gemini-voyager.folders.v1',
      exportedAt: new Date().toISOString(),
      data: this.data,
    };
    downloadJSON(payload, `gemini-voyager-folders-${this.timestamp()}.json`);
  }

  private handleImport(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.addEventListener(
      'change',
      async () => {
        const f = input.files && input.files[0];
        if (!f) return;
        try {
          const text = await f.text();
          const json = JSON.parse(text);
          const next = (json && (json.data || json)) as FolderData;
          if (!next || !Array.isArray(next.folders) || typeof next.folderContents !== 'object') {
            alert(this.t('folder_import_invalid_format') || 'Invalid file format');
            return;
          }
          // Merge mode by default: simple union without duplicates
          const existingIds = new Set(this.data.folders.map((x) => x.id));
          for (const f of next.folders) {
            if (!existingIds.has(f.id)) {
              this.data.folders.push(f);
              this.data.folderContents[f.id] = next.folderContents[f.id] || [];
            } else {
              // Merge conversations
              const base = this.data.folderContents[f.id] || [];
              const add = next.folderContents[f.id] || [];
              const seen = new Set(base.map((c) => c.conversationId));
              for (const c of add) {
                if (!seen.has(c.conversationId)) base.push(c);
              }
              this.data.folderContents[f.id] = base;
            }
          }
          await this.save();
          this.render();
          alert(this.t('folder_import_success') || 'Imported');
        } catch {
          alert(this.t('folder_import_error') || 'Import failed');
        }
      },
      { once: true },
    );
    input.click();
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())} -${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())} `;
  }

  private async loadFolderEnabledSetting(): Promise<void> {
    try {
      const result = await browser.storage.sync.get({ geminiFolderEnabled: true });
      this.folderEnabled = result.geminiFolderEnabled !== false;
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to load folder enabled setting:', error);
      this.folderEnabled = true;
    }
  }

  private setupStorageListener(): void {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'sync') {
        if (changes.geminiFolderEnabled) {
          this.folderEnabled = changes.geminiFolderEnabled.newValue !== false;
          this.applyFolderEnabledSetting();
        }
        if (changes[this.SIDEBAR_WIDTH_KEY]) {
          const w = changes[this.SIDEBAR_WIDTH_KEY].newValue;
          if (typeof w === 'number') {
            const clamped = Math.min(
              this.MAX_SIDEBAR_WIDTH,
              Math.max(this.MIN_SIDEBAR_WIDTH, Math.round(w)),
            );
            this.sidebarWidth = clamped;
            this.applySidebarWidth();
          }
        }
      }
    });
  }

  private applyFolderEnabledSetting(): void {
    if (this.folderEnabled) {
      // If folder UI doesn't exist yet, initialize it
      if (!this.container) {
        this.initializeFolderUI().catch((error) => {
          console.error('[AIStudioFolderManager] Failed to initialize folder UI:', error);
        });
      } else {
        // UI already exists, just show it
        this.container.style.display = '';
      }
    } else {
      // Hide the folder UI if it exists
      if (this.container) {
        this.container.style.display = 'none';
      }
    }
  }

  /**
   * Attempt to recover data when load() fails
   * Uses multi-layer backup system: primary > emergency > beforeUnload > in-memory
   */
  private attemptDataRecovery(_error: unknown): void {
    console.warn('[AIStudioFolderManager] Attempting data recovery after load failure');

    // Step 1: Try to restore from localStorage backups (primary, emergency, beforeUnload)
    const recovered = this.backupService.recoverFromBackup();
    if (recovered && validateFolderData(recovered)) {
      this.data = recovered;
      console.warn('[AIStudioFolderManager] Data recovered from localStorage backup');
      this.showNotification('Folder data recovered from backup', 'warning');
      // Try to save recovered data to persistent storage
      this.save();
      return;
    }

    // Step 2: Keep existing in-memory data if it exists and is valid
    if (validateFolderData(this.data) && this.data.folders.length > 0) {
      console.warn('[AIStudioFolderManager] Keeping existing in-memory data after load error');
      this.showErrorNotification('Failed to load folder data, using cached version');
      return;
    }

    // Step 3: Last resort - initialize empty data and notify user
    console.error('[AIStudioFolderManager] All recovery attempts failed, initializing empty data');
    this.data = { folders: [], folderContents: {} };
    this.showErrorNotification('Failed to load folder data. All folders have been reset.');
  }

  /**
   * Show an error notification to the user
   * @deprecated Use showNotification() instead for better level support
   */
  private showErrorNotification(message: string): void {
    this.showNotification(message, 'error');
  }

  /**
   * Show a notification to the user with customizable level
   */
  private showNotification(message: string, level: 'info' | 'warning' | 'error' = 'error'): void {
    try {
      const notification = document.createElement('div');
      notification.className = `gv - notification gv - notification - ${level} `;
      notification.textContent = `[Gemini Voyager] ${message} `;

      // Color based on level
      const colors = {
        info: '#2196F3',
        warning: '#FF9800',
        error: '#f44336',
      };

      // Apply inline styles for visibility
      const style = notification.style;
      style.position = 'fixed';
      style.top = '20px';
      style.right = '20px';
      style.padding = '12px 20px';
      style.background = colors[level];
      style.color = 'white';
      style.borderRadius = '4px';
      style.boxShadow = '0 2px 8px rgba(0,0,0,0.2)';
      style.zIndex = String(2147483647);
      style.maxWidth = '400px';
      style.fontSize = '14px';
      style.fontFamily = 'system-ui, -apple-system, sans-serif';
      style.lineHeight = '1.4';

      document.body.appendChild(notification);

      // Auto-remove after timeout (longer for errors/warnings)
      const timeout =
        level === 'info' ? 3000 : level === 'warning' ? 7000 : NOTIFICATION_TIMEOUT_MS;
      setTimeout(() => {
        try {
          document.body.removeChild(notification);
        } catch {
          // Element might already be removed
        }
      }, timeout);
    } catch (notificationError) {
      console.error('[AIStudioFolderManager] Failed to show notification:', notificationError);
    }
  }

  /**
   * Check if extension context is valid
   */
  private isExtensionContextValid(): boolean {
    try {
      // Try to access chrome.runtime.id to check if context is valid
      return !!(browser?.runtime?.id || chrome?.runtime?.id);
    } catch {
      return false;
    }
  }

  /**
   * Load sidebar width from storage (with localStorage fallback)
   */
  private async loadSidebarWidth(): Promise<void> {
    try {
      // Try chrome.storage.sync first
      if (this.isExtensionContextValid()) {
        const result = await browser.storage.sync.get({ [this.SIDEBAR_WIDTH_KEY]: 280 });
        const width = result[this.SIDEBAR_WIDTH_KEY];
        if (
          typeof width === 'number' &&
          width >= this.MIN_SIDEBAR_WIDTH &&
          width <= this.MAX_SIDEBAR_WIDTH
        ) {
          this.sidebarWidth = width;
          return;
        }
      }
    } catch (error) {
      console.warn(
        '[AIStudioFolderManager] Failed to load from sync storage, trying localStorage:',
        error,
      );
    }

    // Fallback to localStorage
    try {
      const stored = localStorage.getItem(this.SIDEBAR_WIDTH_KEY);
      if (stored) {
        const width = parseInt(stored, 10);
        if (
          typeof width === 'number' &&
          width >= this.MIN_SIDEBAR_WIDTH &&
          width <= this.MAX_SIDEBAR_WIDTH
        ) {
          this.sidebarWidth = width;
        }
      }
    } catch (error) {
      console.error(
        '[AIStudioFolderManager] Failed to load sidebar width from localStorage:',
        error,
      );
    }
  }

  /**
   * Save sidebar width to storage (with localStorage fallback)
   */
  private async saveSidebarWidth(): Promise<void> {
    // Always save to localStorage as immediate backup
    try {
      localStorage.setItem(this.SIDEBAR_WIDTH_KEY, String(this.sidebarWidth));
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to save to localStorage:', error);
    }

    // Try to save to chrome.storage.sync if context is valid
    if (this.isExtensionContextValid()) {
      try {
        await browser.storage.sync.set({ [this.SIDEBAR_WIDTH_KEY]: this.sidebarWidth });
      } catch (error) {
        // Silent fail if extension context is invalidated (happens during dev reload)
        if (error instanceof Error && !error.message.includes('Extension context invalidated')) {
          console.error('[AIStudioFolderManager] Failed to save sidebar width:', error);
        }
      }
    }
  }

  /**
   * Apply sidebar width to the navbar element (only when expanded)
   */
  private applySidebarWidth(force: boolean = false): void {
    // Target the actual nav-content div, not the outer ms-navbar
    const navContent = document.querySelector('.nav-content.v3-left-nav') as HTMLElement | null;
    if (!navContent) return;

    // Check if sidebar is expanded by looking at the 'expanded' class
    const isExpanded = navContent.classList.contains('expanded');

    if (isExpanded || force) {
      navContent.style.width = `${this.sidebarWidth}px`;
      navContent.style.minWidth = `${this.sidebarWidth}px`;
      navContent.style.maxWidth = `${this.sidebarWidth}px`;
      navContent.style.flex = `0 0 ${this.sidebarWidth}px`;
    } else {
      // Remove our width overrides when collapsed to allow native behavior
      navContent.style.width = '';
      navContent.style.minWidth = '';
      navContent.style.maxWidth = '';
      navContent.style.flex = '';
    }
  }

  /**
   * Add a draggable resize handle to adjust sidebar width
   */
  private addResizeHandle(): void {
    // Target the actual nav-content div
    const navContent = document.querySelector('.nav-content.v3-left-nav') as HTMLElement | null;
    if (!navContent) {
      console.warn('[AIStudioFolderManager] nav-content not found, resize handle not added');
      return;
    }

    // Create resize handle
    const handle = document.createElement('div');
    handle.className = 'gv-sidebar-resize-handle';
    handle.title = 'Drag to resize sidebar';

    // Position it at the right edge of the nav-content with inline styles
    const handleStyle = handle.style;
    handleStyle.position = 'absolute';
    handleStyle.top = '0';
    handleStyle.right = '-4px'; // Position at right edge, overlapping slightly outside
    handleStyle.width = '8px';
    handleStyle.height = '100%';
    handleStyle.cursor = 'ew-resize';
    handleStyle.zIndex = '10000';
    handleStyle.backgroundColor = 'transparent';
    handleStyle.transition = 'background-color 0.2s';
    handleStyle.pointerEvents = 'auto';

    // Hover effect
    handle.addEventListener('mouseenter', () => {
      handleStyle.backgroundColor = 'rgba(66, 133, 244, 0.5)';
    });
    handle.addEventListener('mouseleave', () => {
      handleStyle.backgroundColor = 'transparent';
    });

    // Dragging logic
    let isDragging = false;
    let startX = 0;
    let startWidth = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startWidth = this.sidebarWidth;
      e.preventDefault();
      e.stopPropagation();

      // Add dragging class for visual feedback
      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const delta = e.clientX - startX;
      const newWidth = Math.max(
        this.MIN_SIDEBAR_WIDTH,
        Math.min(this.MAX_SIDEBAR_WIDTH, startWidth + delta),
      );

      this.sidebarWidth = newWidth;
      this.applySidebarWidth(true); // Force apply during drag

      // Handle position is relative, no need to update during drag
    };

    const handleMouseUp = () => {
      if (!isDragging) return;

      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';

      // Save the new width
      this.saveSidebarWidth();
    };

    handle.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Ensure nav-content has position relative for absolute handle positioning
    navContent.style.position = 'relative';

    // Add to nav-content for correct positioning
    navContent.appendChild(handle);

    // Update handle visibility when sidebar state changes
    const updateHandleVisibility = () => {
      const isExpanded = navContent.classList.contains('expanded');

      if (isExpanded) {
        handleStyle.display = 'block';
      } else {
        handleStyle.display = 'none'; // Hide when collapsed
      }
    };

    // Monitor sidebar state changes by watching the 'expanded' class
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          updateHandleVisibility();
          this.applySidebarWidth(); // Reapply width based on current state
          break;
        }
      }
    });

    try {
      observer.observe(navContent, {
        attributes: true,
        attributeFilter: ['class'],
      });
    } catch (error) {
      console.error('[AIStudioFolderManager] Failed to observe nav-content:', error);
    }

    // Initial visibility update
    updateHandleVisibility();

    this.cleanupFns.push(() => {
      try {
        observer.disconnect();
        handle.removeEventListener('mousedown', handleMouseDown);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (handle.parentElement) {
          handle.parentElement.removeChild(handle);
        }
      } catch {}
    });
  }

  /**
   * Handle cloud upload - upload folder data and prompts to Google Drive
   * This mirrors the logic in CloudSyncSettings.tsx handleSyncNow()
   * Note: AI Studio uses its own folder file but shares prompts with Gemini
   */
  private async handleCloudUpload(): Promise<void> {
    try {
      this.showNotification(this.t('uploadInProgress'), 'info');

      // Get current folder data
      const folders = this.data;

      // Get prompts from storage (shared with Gemini)
      let prompts: PromptItem[] = [];
      try {
        const storageResult = await chrome.storage.local.get(['gvPromptItems']);
        if (storageResult.gvPromptItems) {
          prompts = storageResult.gvPromptItems as PromptItem[];
        }
      } catch (err) {
        console.warn('[AIStudioFolderManager] Could not get prompts for upload:', err);
      }

      console.log(
        `[AIStudioFolderManager] Uploading - folders: ${folders.folders?.length || 0}, prompts: ${prompts.length}`,
      );

      // Send upload request to background script
      const response = (await browser.runtime.sendMessage({
        type: 'gv.sync.upload',
        payload: { folders, prompts, platform: 'aistudio' },
      })) as { ok?: boolean; error?: string } | undefined;

      if (response?.ok) {
        this.showNotification(this.t('uploadSuccess'), 'info');
      } else {
        const errorMsg = response?.error || 'Unknown error';
        this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AIStudioFolderManager] Cloud upload failed:', error);
      this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
    }
  }

  /**
   * Handle cloud sync - download and merge folder data and prompts from Google Drive
   * This mirrors the logic in CloudSyncSettings.tsx handleDownloadFromDrive()
   * Note: AI Studio uses its own folder file but shares prompts with Gemini
   */
  private async handleCloudSync(): Promise<void> {
    try {
      this.showNotification(this.t('downloadInProgress'), 'info');

      // Send download request to background script
      const response = (await browser.runtime.sendMessage({
        type: 'gv.sync.download',
        payload: { platform: 'aistudio' },
      })) as
        | {
            ok?: boolean;
            error?: string;
            data?: {
              folders?: { data?: FolderData };
              prompts?: { items?: PromptItem[] };
            };
          }
        | undefined;

      if (!response?.ok) {
        const errorMsg = response?.error || 'Download failed';
        this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
        return;
      }

      if (!response.data) {
        this.showNotification(this.t('syncNoData') || 'No data in cloud', 'info');
        return;
      }

      // Extract cloud data
      const cloudFoldersPayload = response.data?.folders;
      const cloudPromptsPayload = response.data?.prompts;
      const cloudFolderData = cloudFoldersPayload?.data || { folders: [], folderContents: {} };
      const cloudPromptItems = cloudPromptsPayload?.items || [];

      console.log(
        `[AIStudioFolderManager] Downloaded - folders: ${cloudFolderData.folders?.length || 0}, prompts: ${cloudPromptItems.length}`,
      );

      // Get local prompts for merge (shared with Gemini)
      let localPrompts: PromptItem[] = [];
      try {
        const storageResult = await chrome.storage.local.get(['gvPromptItems']);
        if (storageResult.gvPromptItems) {
          localPrompts = storageResult.gvPromptItems as PromptItem[];
        }
      } catch (err) {
        console.warn('[AIStudioFolderManager] Could not get local prompts for merge:', err);
      }

      // Merge folder data
      const localFolders = this.data;
      const mergedFolders = this.mergeFolderData(localFolders, cloudFolderData);

      // Merge prompts (simple ID-based merge)
      const mergedPrompts = this.mergePromptsData(localPrompts, cloudPromptItems);

      console.log(
        `[AIStudioFolderManager] Merged - folders: ${mergedFolders.folders?.length || 0}, prompts: ${mergedPrompts.length}`,
      );

      // Apply merged folder data
      this.data = mergedFolders;
      await this.save();

      // Save merged prompts to storage (shared with Gemini)
      try {
        await chrome.storage.local.set({
          gvPromptItems: mergedPrompts,
        });
      } catch (err) {
        console.error('[AIStudioFolderManager] Failed to save merged prompts:', err);
      }

      this.render();
      this.showNotification(this.t('downloadMergeSuccess'), 'info');
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      console.error('[AIStudioFolderManager] Cloud sync failed:', error);
      this.showNotification(this.t('syncError').replace('{error}', errorMsg), 'error');
    }
  }

  /**
   * Merge prompts by ID (simple deduplication)
   */
  private mergePromptsData(local: PromptItem[], cloud: PromptItem[]): PromptItem[] {
    const promptMap = new Map<string, PromptItem>();

    // Add local prompts first
    local.forEach((p) => {
      if (p?.id) promptMap.set(p.id, p);
    });

    // Add cloud prompts (cloud takes priority for newer items)
    cloud.forEach((p) => {
      if (!p?.id) return;
      const existing = promptMap.get(p.id);
      if (!existing) {
        promptMap.set(p.id, p);
      } else {
        // Compare timestamps, prefer newer
        const cloudTime = p.updatedAt || p.createdAt || 0;
        const localTime = existing.updatedAt || existing.createdAt || 0;
        if (cloudTime > localTime) {
          promptMap.set(p.id, p);
        }
      }
    });

    return Array.from(promptMap.values());
  }

  /**
   * Get dynamic tooltip for cloud upload button showing last upload time
   */
  private async getCloudUploadTooltip(): Promise<string> {
    try {
      const response = (await browser.runtime.sendMessage({ type: 'gv.sync.getState' })) as
        | { ok?: boolean; state?: { lastUploadTime?: number | null } }
        | undefined;
      if (response?.ok && response.state) {
        const lastUploadTime = response.state.lastUploadTime;
        const timeStr = this.formatRelativeTime(lastUploadTime ?? null);
        const baseTooltip = this.t('folder_cloud_upload');
        return lastUploadTime
          ? `${baseTooltip}\n${this.t('lastUploaded').replace('{time}', timeStr)}`
          : `${baseTooltip}\n${this.t('neverUploaded')}`;
      }
    } catch (e) {
      console.warn('[AIStudioFolderManager] Failed to get sync state for tooltip:', e);
    }
    return this.t('folder_cloud_upload');
  }

  /**
   * Get dynamic tooltip for cloud sync button showing last sync time
   */
  private async getCloudSyncTooltip(): Promise<string> {
    try {
      const response = (await browser.runtime.sendMessage({ type: 'gv.sync.getState' })) as
        | { ok?: boolean; state?: { lastSyncTime?: number | null } }
        | undefined;
      if (response?.ok && response.state) {
        const lastSyncTime = response.state.lastSyncTime;
        const timeStr = this.formatRelativeTime(lastSyncTime ?? null);
        const baseTooltip = this.t('folder_cloud_sync');
        return lastSyncTime
          ? `${baseTooltip}\n${this.t('lastSynced').replace('{time}', timeStr)}`
          : `${baseTooltip}\n${this.t('neverSynced')}`;
      }
    } catch (e) {
      console.warn('[AIStudioFolderManager] Failed to get sync state for tooltip:', e);
    }
    return this.t('folder_cloud_sync');
  }

  /**
   * Format a timestamp as relative time (e.g. "5 minutes ago")
   */
  private formatRelativeTime(timestamp: number | null): string {
    if (!timestamp) return '';
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) {
      return this.t('justNow');
    } else if (diffMins < 60) {
      return `${diffMins} ${this.t('minutesAgo')}`;
    } else if (diffHours < 24) {
      return `${diffHours} ${this.t('hoursAgo')}`;
    } else if (diffDays === 1) {
      return this.t('yesterday');
    } else {
      return new Date(timestamp).toLocaleDateString();
    }
  }
}

export async function startAIStudioFolderManager(): Promise<void> {
  try {
    const mgr = new AIStudioFolderManager();
    await mgr.init();
  } catch (e) {
    console.error('[AIStudioFolderManager] Start error:', e);
  }
}
