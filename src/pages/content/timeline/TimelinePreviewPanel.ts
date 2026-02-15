import browser from 'webextension-polyfill';

import { StorageKeys } from '@/core/types/common';

import { getTranslationSync } from '../../../utils/i18n';
import type { PreviewMarkerData } from './types';

const SEARCH_DEBOUNCE_MS = 200;

const LIST_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

export class TimelinePreviewPanel {
  private panelEl: HTMLElement | null = null;
  private listEl: HTMLElement | null = null;
  private searchInput: HTMLInputElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private _isOpen = false;
  private markers: ReadonlyArray<PreviewMarkerData> = [];
  private filteredMarkers: ReadonlyArray<PreviewMarkerData> = [];
  private activeTurnId: string | null = null;
  private searchQuery = '';
  private searchDebounceTimer: number | null = null;
  private onNavigate: ((turnId: string, index: number) => void) | null = null;
  private onSearchChange: ((query: string) => void) | null = null;
  private onDocumentPointerDown: ((e: PointerEvent) => void) | null = null;
  private onKeyDown: ((e: KeyboardEvent) => void) | null = null;
  private onWindowResize: (() => void) | null = null;
  private onStorageChanged:
    | ((changes: Record<string, browser.Storage.StorageChange>, areaName: string) => void)
    | null = null;

  constructor(private readonly anchorElement: HTMLElement) {}

  get isOpen(): boolean {
    return this._isOpen;
  }

  init(
    onNavigate: (turnId: string, index: number) => void,
    onSearchChange?: (query: string) => void,
  ): void {
    this.onNavigate = onNavigate;
    this.onSearchChange = onSearchChange ?? null;
    this.createDOM();
    this.positionToggle();
    this.setupEventListeners();
  }

  updateMarkers(markers: ReadonlyArray<PreviewMarkerData>): void {
    if (this.markersEqual(markers)) return;
    this.markers = markers;
    this.applyFilter();
  }

  updateActiveTurn(turnId: string | null): void {
    if (this.activeTurnId === turnId) return;
    this.activeTurnId = turnId;
    if (!this._isOpen || !this.listEl) return;
    this.updateActiveHighlight();
    this.scrollActiveIntoView();
  }

  toggle(): void {
    if (this._isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open(): void {
    if (this._isOpen || !this.panelEl) return;
    this._isOpen = true;
    this.renderList();
    this.positionPanel();
    this.panelEl.classList.add('visible');
    this.toggleBtn?.classList.add('active');
    this.scrollActiveIntoView();
  }

  close(): void {
    if (!this._isOpen || !this.panelEl) return;
    this._isOpen = false;
    this.panelEl.classList.remove('visible');
    this.toggleBtn?.classList.remove('active');
    if (this.searchInput) {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.filteredMarkers = this.markers;
    }
    this.onSearchChange?.('');
  }

  destroy(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = null;
    }
    if (this.onDocumentPointerDown) {
      document.removeEventListener('pointerdown', this.onDocumentPointerDown);
      this.onDocumentPointerDown = null;
    }
    if (this.onKeyDown) {
      document.removeEventListener('keydown', this.onKeyDown);
      this.onKeyDown = null;
    }
    if (this.onWindowResize) {
      window.removeEventListener('resize', this.onWindowResize);
      this.onWindowResize = null;
    }
    if (this.onStorageChanged) {
      browser.storage.onChanged.removeListener(this.onStorageChanged);
      this.onStorageChanged = null;
    }
    this.toggleBtn?.remove();
    this.panelEl?.remove();
    this.toggleBtn = null;
    this.panelEl = null;
    this.listEl = null;
    this.searchInput = null;
    this.onSearchChange?.('');
    this.onNavigate = null;
    this.onSearchChange = null;
    this.markers = [];
    this.filteredMarkers = [];
  }

  private createDOM(): void {
    // Toggle button — fixed position to the left of the timeline bar
    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'timeline-preview-toggle';
    this.toggleBtn.setAttribute('aria-label', 'Toggle preview panel');
    this.toggleBtn.innerHTML = LIST_ICON_SVG;
    this.toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggle();
    });
    document.body.appendChild(this.toggleBtn);

    // Panel
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'timeline-preview-panel';

    // Search section
    const searchWrapper = document.createElement('div');
    searchWrapper.className = 'timeline-preview-search';
    this.searchInput = document.createElement('input');
    this.searchInput.type = 'text';
    this.searchInput.placeholder = getTranslationSync('timelinePreviewSearch');
    this.searchInput.addEventListener('input', () => {
      this.handleSearchInput();
    });
    searchWrapper.appendChild(this.searchInput);
    this.panelEl.appendChild(searchWrapper);

    // List
    this.listEl = document.createElement('div');
    this.listEl.className = 'timeline-preview-list';
    this.setupScrollIsolation();
    this.panelEl.appendChild(this.listEl);

    document.body.appendChild(this.panelEl);
  }

  private setupEventListeners(): void {
    // Click outside to close
    this.onDocumentPointerDown = (e: PointerEvent) => {
      if (!this._isOpen) return;
      const target = e.target as Node;
      if (this.panelEl?.contains(target) || this.toggleBtn?.contains(target)) return;
      this.close();
    };
    document.addEventListener('pointerdown', this.onDocumentPointerDown);

    // Escape to close
    this.onKeyDown = (e: KeyboardEvent) => {
      if (!this._isOpen) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        this.close();
      }
    };
    document.addEventListener('keydown', this.onKeyDown);

    // Reposition on resize
    this.onWindowResize = () => {
      this.positionToggle();
      if (this._isOpen) this.positionPanel();
    };
    window.addEventListener('resize', this.onWindowResize);

    // Re-render translated text on language change
    this.onStorageChanged = (changes, areaName) => {
      if ((areaName === 'sync' || areaName === 'local') && changes[StorageKeys.LANGUAGE]) {
        this.updateTranslatedText();
      }
    };
    browser.storage.onChanged.addListener(this.onStorageChanged);
  }

  private updateTranslatedText(): void {
    if (this.searchInput) {
      this.searchInput.placeholder = getTranslationSync('timelinePreviewSearch');
    }
    if (this._isOpen) {
      this.renderList();
    }
  }

  private setupScrollIsolation(): void {
    if (!this.listEl) return;

    this.listEl.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.stopPropagation();
        const { scrollTop, scrollHeight, clientHeight } = this.listEl!;
        const atTop = scrollTop <= 0 && e.deltaY < 0;
        const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
        if (atTop || atBottom) {
          e.preventDefault();
        }
      },
      { passive: false },
    );
  }

  /** Position the toggle button to the left of the timeline bar, vertically centered. */
  private positionToggle(): void {
    if (!this.toggleBtn) return;
    const barRect = this.anchorElement.getBoundingClientRect();
    const btnSize = 24;
    const gap = 4;
    this.toggleBtn.style.left = `${Math.round(barRect.left - btnSize - gap)}px`;
    this.toggleBtn.style.top = `${Math.round(barRect.top + barRect.height / 2 - btnSize / 2)}px`;
  }

  private positionPanel(): void {
    if (!this.panelEl) return;
    const barRect = this.anchorElement.getBoundingClientRect();
    const panelWidth = 320;
    const gap = 12;
    const maxHeight = Math.min(500, window.innerHeight * 0.7);
    const barCenterY = barRect.top + barRect.height / 2;

    let left = barRect.left - panelWidth - gap;
    if (left < 8) left = 8;

    this.panelEl.style.maxHeight = `${Math.round(maxHeight)}px`;
    this.panelEl.style.left = `${Math.round(left)}px`;

    // Measure actual rendered height to center properly (works for both few and many items)
    const panelHeight = this.panelEl.offsetHeight || maxHeight;
    let top = barCenterY - panelHeight / 2;
    top = Math.max(8, Math.min(top, window.innerHeight - panelHeight - 8));

    this.panelEl.style.top = `${Math.round(top)}px`;
  }

  private applyFilter(): void {
    if (!this.searchQuery) {
      this.filteredMarkers = this.markers;
    } else {
      const q = this.searchQuery.toLowerCase();
      this.filteredMarkers = this.markers.filter((m) => m.summary.toLowerCase().includes(q));
    }
    if (this._isOpen) {
      this.renderList();
    }
    this.onSearchChange?.(this.searchQuery);
  }

  private handleSearchInput(): void {
    if (this.searchDebounceTimer) {
      clearTimeout(this.searchDebounceTimer);
    }
    this.searchDebounceTimer = window.setTimeout(() => {
      this.searchDebounceTimer = null;
      this.searchQuery = this.searchInput?.value.trim() ?? '';
      this.applyFilter();
    }, SEARCH_DEBOUNCE_MS);
  }

  private renderList(): void {
    if (!this.listEl) return;
    this.listEl.textContent = '';

    if (this.filteredMarkers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'timeline-preview-empty';
      empty.textContent = this.searchQuery
        ? getTranslationSync('timelinePreviewNoResults')
        : getTranslationSync('timelinePreviewNoMessages');
      this.listEl.appendChild(empty);
      return;
    }

    const fragment = document.createDocumentFragment();
    for (const marker of this.filteredMarkers) {
      fragment.appendChild(this.createItem(marker));
    }
    this.listEl.appendChild(fragment);
  }

  private createItem(marker: PreviewMarkerData): HTMLElement {
    const item = document.createElement('div');
    item.className = 'timeline-preview-item';
    item.dataset.turnId = marker.id;

    if (marker.starred) {
      item.classList.add('starred');
    }
    if (marker.id === this.activeTurnId) {
      item.classList.add('active');
    }

    const indexLabel = document.createElement('span');
    indexLabel.className = 'timeline-preview-index';
    indexLabel.textContent = `${marker.index + 1}`;
    item.appendChild(indexLabel);

    const text = document.createElement('span');
    text.className = 'timeline-preview-text';
    const displayText = this.truncateText(marker.summary, 80);
    if (this.searchQuery) {
      this.appendHighlighted(text, displayText, this.searchQuery);
    } else {
      text.textContent = displayText;
    }
    item.appendChild(text);

    item.addEventListener('click', () => {
      this.onNavigate?.(marker.id, marker.index);
    });

    return item;
  }

  /** Split text around case-insensitive query matches and wrap each match in <mark>. */
  private appendHighlighted(container: HTMLElement, text: string, query: string): void {
    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let cursor = 0;
    let idx = lowerText.indexOf(lowerQuery, cursor);
    while (idx !== -1) {
      if (idx > cursor) {
        container.appendChild(document.createTextNode(text.slice(cursor, idx)));
      }
      const mark = document.createElement('mark');
      mark.className = 'timeline-preview-highlight';
      mark.textContent = text.slice(idx, idx + query.length);
      container.appendChild(mark);
      cursor = idx + query.length;
      idx = lowerText.indexOf(lowerQuery, cursor);
    }
    if (cursor < text.length) {
      container.appendChild(document.createTextNode(text.slice(cursor)));
    }
  }

  private truncateText(text: string, maxLen: number): string {
    if (text.length <= maxLen) return text;
    return text.slice(0, maxLen - 1) + '\u2026';
  }

  private updateActiveHighlight(): void {
    if (!this.listEl) return;
    const items = this.listEl.querySelectorAll('.timeline-preview-item');
    items.forEach((item) => {
      const el = item as HTMLElement;
      el.classList.toggle('active', el.dataset.turnId === this.activeTurnId);
    });
  }

  private scrollActiveIntoView(): void {
    if (!this.listEl || !this.activeTurnId) return;
    const activeItem = this.listEl.querySelector(
      '.timeline-preview-item.active',
    ) as HTMLElement | null;
    activeItem?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }

  private markersEqual(newMarkers: ReadonlyArray<PreviewMarkerData>): boolean {
    if (newMarkers.length !== this.markers.length) return false;
    for (let i = 0; i < newMarkers.length; i++) {
      const a = this.markers[i];
      const b = newMarkers[i];
      if (a.id !== b.id || a.summary !== b.summary || a.starred !== b.starred) return false;
    }
    return true;
  }
}
