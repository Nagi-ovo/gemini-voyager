import type { Folder, FolderData, ConversationReference, DragData } from './types';

import { storageService } from '@/core/services/StorageService';
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

export class AIStudioFolderManager {
  private t: (key: string) => string = (k) => k;
  private data: FolderData = { folders: [], folderContents: {} };
  private container: HTMLElement | null = null;
  private historyRoot: HTMLElement | null = null;
  private cleanupFns: Array<() => void> = [];
  private readonly STORAGE_KEY = StorageKeys.FOLDER_DATA_AISTUDIO;

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

    // Only enable on prompts routes
    if (!/\/prompts(\/|$)/.test(location.pathname)) return;

    // Find the prompt history component and sidebar region
    this.historyRoot = (await waitForElement<HTMLElement>('ms-prompt-history-v3')) || null;
    if (!this.historyRoot) return;
    try { document.documentElement.classList.add('gv-aistudio-root'); } catch {}

    await this.load();
    this.injectUI();
    this.observePromptList();
    this.bindDraggablesInPromptList();
  }

  private async load(): Promise<void> {
    try {
      const res = await storageService.get<FolderData>(this.STORAGE_KEY);
      if (res.success && res.data) {
        this.data = res.data;
      } else {
        this.data = { folders: [], folderContents: {} };
      }
    } catch {
      this.data = { folders: [], folderContents: {} };
    }
  }

  private async save(): Promise<void> {
    try {
      await storageService.set<FolderData>(this.STORAGE_KEY, this.data);
    } catch {}
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
    title.textContent = conv.title || 'Untitled';
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
        title: normalizeText(data.title) || 'Untitled',
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
    });
    try { observer.observe(root, { childList: true, subtree: true }); } catch {}
    this.cleanupFns.push(() => {
      try { observer.disconnect(); } catch {}
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
      return;
    }
    try {
      window.history.pushState({}, '', url);
      window.dispatchEvent(new PopStateEvent('popstate'));
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
}

export async function startAIStudioFolderManager(): Promise<void> {
  try {
    const mgr = new AIStudioFolderManager();
    await mgr.init();
  } catch (e) {
    console.error('[AIStudioFolderManager] Start error:', e);
  }
}
