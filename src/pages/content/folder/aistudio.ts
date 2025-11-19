import browser from 'webextension-polyfill';

import type { Folder, FolderData, ConversationReference, DragData } from './types';

import { storageService } from '@/core/services/StorageService';
import { DataBackupService } from '@/core/services/DataBackupService';
import { getStorageMonitor } from '@/core/services/StorageMonitor';
import { StorageKeys } from '@/core/types/common';
import { initI18n, createTranslator } from '@/utils/i18n';

function waitForElement<T extends Element = Element>(selector: string, timeoutMs = 10000): Promise<T | null> {
  return new Promise((resolve) => {
    const found = document.querySelector(selector) as T | null;
    if (found) return resolve(found);
    const obs = new MutationObserver(() => {
      const el = document.querySelector(selector) as T | null;
      if (el) {
        try { obs.disconnect(); } catch {}
        resolve(el);
      }
    });
    try { obs.observe(document.body, { childList: true, subtree: true }); } catch {}
    if (timeoutMs > 0) {
      setTimeout(() => {
        try { obs.disconnect(); } catch {}
        resolve(null);
      }, timeoutMs);
    }
  });
}

function normalizeText(text: string | null | undefined): string {
  try {
    return String(text || '').replace(/\s+/g, ' ').trim();
  } catch {
    return '';
  }
}

function downloadJSON(data: any, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    try { document.body.removeChild(a); } catch {}
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

export class AIStudioFolderManager {
  private t: (key: string) => string = (k) => k;
  private data: FolderData = { folders: [], folderContents: {} };
  private container: HTMLElement | null = null;
  private historyRoot: HTMLElement | null = null;
  private cleanupFns: Array<() => void> = [];
  private readonly STORAGE_KEY = StorageKeys.FOLDER_DATA_AISTUDIO;
  private folderEnabled: boolean = true; // Whether folder feature is enabled
  private backupService!: DataBackupService<FolderData>; // Initialized in init()

  // Helper to create a ligature icon span with a data-icon attribute
  private createIcon(name: string): HTMLSpanElement {
    const span = document.createElement('span');
    span.className = 'google-symbols';
    try { span.dataset.icon = name; } catch {}
    span.textContent = name;
    return span;
  }

  async init(): Promise<void> {
    await initI18n();
    this.t = createTranslator();

    // Initialize backup service
    this.backupService = new DataBackupService<FolderData>(
      'aistudio-folders',
      validateFolderData
    );

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

    // Only enable on prompts routes
    if (!/\/prompts(\/|$)/.test(location.pathname)) return;

    // Load folder enabled setting
    await this.loadFolderEnabledSetting();

    // Set up storage change listener (always needed to respond to setting changes)
    this.setupStorageListener();

    // If folder feature is disabled, skip initialization
    if (!this.folderEnabled) {
      return;
    }

    // Initialize folder UI
    await this.initializeFolderUI();
  }

  private async initializeFolderUI(): Promise<void> {
    // Find the prompt history component and sidebar region
    this.historyRoot = (await waitForElement<HTMLElement>('ms-prompt-history-v3')) || null;
    if (!this.historyRoot) return;
    try { document.documentElement.classList.add('gv-aistudio-root'); } catch {}

    await this.load();
    this.injectUI();
    this.observePromptList();
    this.bindDraggablesInPromptList();

    // Highlight current conversation initially and on navigation
    this.highlightActiveConversation();
    this.installRouteChangeListener();
  }

  private async load(): Promise<void> {
    try {
      const res = await storageService.get<FolderData>(this.STORAGE_KEY);
      if (res.success && res.data && validateFolderData(res.data)) {
        this.data = res.data;
        // Create primary backup on successful load
        this.backupService.createPrimaryBackup(this.data);
        console.log('[AIStudioFolderManager] Data loaded successfully');
      } else {
        // Don't immediately clear data - try to recover from backup
        console.warn('[AIStudioFolderManager] Storage returned no data, attempting recovery from backup');
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

      // Attempt to save to main storage
      await storageService.set<FolderData>(this.STORAGE_KEY, this.data);

      // Create primary backup AFTER successful save
      this.backupService.createPrimaryBackup(this.data);

      console.log('[AIStudioFolderManager] Data saved successfully');
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
    this.render();

    // Apply initial folder enabled setting
    this.applyFolderEnabledSetting();
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

    // After rendering, update active highlight
    this.highlightActiveConversation();
  }

  private getCurrentPromptIdFromLocation(): string | null {
    try {
      const m = (location.pathname || '').match(/\/prompts\/([^/?#]+)/);
      return m ? m[1] : null;
    } catch { return null; }
  }

  private highlightActiveConversation(): void {
    if (!this.container) return;
    const currentId = this.getCurrentPromptIdFromLocation();
    const rows = this.container.querySelectorAll('.gv-folder-conversation') as NodeListOf<HTMLElement>;
    rows.forEach((row) => {
      const isActive = currentId && row.dataset.conversationId === currentId;
      row.classList.toggle('gv-folder-conversation-selected', !!isActive);
    });
  }

  private installRouteChangeListener(): void {
    const update = () => setTimeout(() => this.highlightActiveConversation(), 0);
    try { window.addEventListener('popstate', update); } catch {}
    try {
      const hist = history as any;
      const wrap = (method: 'pushState' | 'replaceState') => {
        const orig = hist[method];
        hist[method] = function (...args: any[]) {
          const ret = orig.apply(this, args);
          try { update(); } catch {}
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
      this.cleanupFns.push(() => { try { clearInterval(id); } catch {} });
    } catch {}
  }

  private renderFolder(folder: Folder): HTMLElement {
    const item = document.createElement('div');
    item.className = 'gv-folder-item';
    item.dataset.folderId = folder.id;
    item.dataset.pinned = folder.pinned ? 'true' : 'false';

    const header = document.createElement('div');
    header.className = 'gv-folder-item-header';
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
    (icon as any).dataset.icon = 'folder';
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
    try { (pinBtn as any).dataset.state = folder.pinned ? 'pinned' : 'unpinned'; } catch {}
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

    // Content (conversations only; subfolders are not supported in AI Studio)
    if (folder.isExpanded) {
      const content = document.createElement('div');
      content.className = 'gv-folder-content';
      this.bindDropZone(content, folder.id);

      const convs = this.data.folderContents[folder.id] || [];
      for (const conv of convs) {
        content.appendChild(this.renderConversation(folder.id, conv));
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
    (icon as any).dataset.icon = 'chat';
    icon.textContent = 'chat';
    row.appendChild(icon);

    const title = document.createElement('span');
    title.className = 'gv-conversation-title gds-label-l';
    title.textContent = conv.title || this.t('conversation_untitled');
    row.appendChild(title);


    const starBtn = document.createElement('button');
    starBtn.className = conv.starred ? 'gv-conversation-star-btn starred' : 'gv-conversation-star-btn';
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
      this.removeConversationFromFolder(folderId, conv.conversationId);
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
      try { e.dataTransfer?.setData('application/json', JSON.stringify(data)); } catch {}
      try { e.dataTransfer?.setDragImage(row, 10, 10); } catch {}
    });

    return row;
  }

  private openFolderMenu(ev: MouseEvent, folderId: string): void {
    ev.stopPropagation();
    const menu = document.createElement('div');
    menu.className = 'gv-context-menu';
    const rename = document.createElement('button');
    rename.textContent = this.t('folder_rename');
    rename.addEventListener('click', () => {
      this.renameFolder(folderId);
      try { document.body.removeChild(menu); } catch {}
    });
    const del = document.createElement('button');
    del.textContent = this.t('folder_delete');
    del.addEventListener('click', () => {
      this.deleteFolder(folderId);
      try { document.body.removeChild(menu); } catch {}
    });
    menu.appendChild(rename);
    menu.appendChild(del);

    // Apply styles with proper typing
    const st = menu.style;
    st.position = 'fixed';
    st.top = `${ev.clientY}px`;
    st.left = `${ev.clientX}px`;
    st.zIndex = String(2147483647);
    st.display = 'flex';
    (st as any).flexDirection = 'column';
    document.body.appendChild(menu);
    const onClickAway = (e: MouseEvent) => {
      if (e.target instanceof Node && !menu.contains(e.target)) {
        try { document.body.removeChild(menu); } catch {}
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
    this.data.folders = this.data.folders.filter((f) => f.id !== folderId);
    delete this.data.folderContents[folderId];
    await this.save();
    this.render();
  }

  private removeConversationFromFolder(folderId: string, conversationId: string): void {
    const arr = this.data.folderContents[folderId] || [];
    this.data.folderContents[folderId] = arr.filter((c) => c.conversationId !== conversationId);
    this.save().then(() => this.render());
  }

  private bindDropZone(el: HTMLElement, targetFolderId: string | null): void {
    el.addEventListener('dragenter', (e) => {
      e.preventDefault();
      el.classList.add('gv-folder-dragover');
    });
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch {}
    });
    el.addEventListener('dragleave', () => {
      el.classList.remove('gv-folder-dragover');
    });
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      el.classList.remove('gv-folder-dragover');
      let raw = e.dataTransfer?.getData('application/json');
      if (!raw) {
        try { raw = e.dataTransfer?.getData('text/plain') || ''; } catch {}
      }
      if (!raw) return;
      let data: DragData | null = null;
      try { data = JSON.parse(raw) as DragData; } catch { data = null; }
      if (!data || data.type !== 'conversation' || !data.conversationId) return;
      const conv: ConversationReference = {
        conversationId: data.conversationId,
        title: normalizeText(data.title) || this.t('conversation_untitled'),
        url: data.url || '',
        addedAt: now(),
      };
      const folderId = targetFolderId;
      if (!folderId) {
        // Drop to root: remove from any folder
        Object.keys(this.data.folderContents).forEach((fid) => {
          this.data.folderContents[fid] = (this.data.folderContents[fid] || []).filter((c) => c.conversationId !== conv.conversationId);
        });
      } else {
        const arr = this.data.folderContents[folderId] || [];
        const exists = arr.some((c) => c.conversationId === conv.conversationId);
        if (!exists) {
          arr.push(conv);
          this.data.folderContents[folderId] = arr;
        }
        // If moving from another folder, remove there
        Object.keys(this.data.folderContents).forEach((fid) => {
          if (fid === folderId) return;
          this.data.folderContents[fid] = (this.data.folderContents[fid] || []).filter((c) => c.conversationId !== conv.conversationId);
        });
      }
      this.save().then(() => this.render());
    });
  }

  private observePromptList(): void {
    const root = this.historyRoot;
    if (!root) return;
    const observer = new MutationObserver(() => {
      this.bindDraggablesInPromptList();
      // Update highlight when the list updates
      this.highlightActiveConversation();
    });
    try { observer.observe(root, { childList: true, subtree: true }); } catch {}
    this.cleanupFns.push(() => {
      try { observer.disconnect(); } catch {}
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
    try { root.addEventListener('click', onClick, true); } catch {}
    this.cleanupFns.push(() => {
      try { root.removeEventListener('click', onClick, true); } catch {}
    });
  }

  private bindDraggablesInPromptList(): void {
    const anchors = document.querySelectorAll('ms-prompt-history-v3 a.prompt-link[href^="/prompts/"]');
    anchors.forEach((a) => {
      const anchor = a as HTMLAnchorElement;
      const li = anchor.closest('li');
      const hostEl = (li || anchor) as HTMLElement;
      if ((hostEl as any)._gvDragBound) return;
      (hostEl as any)._gvDragBound = true;
      hostEl.draggable = true;
      hostEl.addEventListener('dragstart', (e) => {
        const id = this.extractPromptId(anchor);
        const title = normalizeText(anchor.textContent || '');
        const url = anchor.href || `${location.origin}${anchor.getAttribute('href') || ''}`;
        const data: DragData = { type: 'conversation', conversationId: id, title, url };
        try {
          if (e.dataTransfer) {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('application/json', JSON.stringify(data));
            // Fallback to text/plain to interop with stricter DnD
            e.dataTransfer.setData('text/plain', JSON.stringify(data));
          }
        } catch {}
        try { e.dataTransfer?.setDragImage(hostEl, 10, 10); } catch {}
      });
    });
  }

  private extractPromptId(anchor: HTMLAnchorElement): string {
    try {
      const u = new URL(anchor.href || anchor.getAttribute('href') || '', location.origin);
      const parts = (u.pathname || '').split('/').filter(Boolean);
      return parts[1] || anchor.href;
    } catch {
      const href = anchor.getAttribute('href') || anchor.href || '';
      const m = href.match(/\/prompts\/([^/?#]+)/);
      return (m && m[1]) || href;
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
    input.addEventListener('change', async () => {
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
      } catch (e) {
        alert(this.t('folder_import_error') || 'Import failed');
      }
    }, { once: true });
    input.click();
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
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
      if (areaName === 'sync' && changes.geminiFolderEnabled) {
        this.folderEnabled = changes.geminiFolderEnabled.newValue !== false;
        this.applyFolderEnabledSetting();
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
  private attemptDataRecovery(error: unknown): void {
    console.warn('[AIStudioFolderManager] Attempting data recovery after load failure');

    // Step 1: Try to restore from localStorage backups (primary, emergency, beforeUnload)
    const recovered = this.backupService.recoverFromBackup();
    if (recovered && validateFolderData(recovered)) {
      this.data = recovered;
      console.warn('[AIStudioFolderManager] Data recovered from localStorage backup');
      this.showErrorNotification('Folder data recovered from backup');
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
      notification.className = `gv-notification gv-notification-${level}`;
      notification.textContent = `[Gemini Voyager] ${message}`;

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
      const timeout = level === 'info' ? 3000 : level === 'warning' ? 7000 : NOTIFICATION_TIMEOUT_MS;
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
}

export async function startAIStudioFolderManager(): Promise<void> {
  try {
    const mgr = new AIStudioFolderManager();
    await mgr.init();
  } catch (e) {
    console.error('[AIStudioFolderManager] Start error:', e);
  }
}
