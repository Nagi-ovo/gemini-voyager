import {
  accountIsolationService,
  detectAccountContextFromDocument,
} from '@/core/services/AccountIsolationService';
import {
  DEFAULT_HIGHLIGHT_COLOR_PALETTE,
  type HighlightAccountScope,
  type HighlightColor,
  type HighlightCreateInput,
  type HighlightRecordV1,
  type HighlightUpdatePatch,
  normalizeHighlightColorPalette,
} from '@/core/types/highlight';
import { buildConversationIdFromUrl } from '@/core/utils/conversationIdentity';

import { HighlightEditor } from './HighlightEditor';
import { HighlightMarks } from './HighlightMarks';
import { HighlightNavigation, type HighlightNavigationResult } from './HighlightNavigation';
import { HighlightTimelineMarkers } from './HighlightTimelineMarkers';
import { HIGHLIGHT_EXACT_MAX_BYTES, buildHighlightAnchor } from './anchor';
import { HighlightClient, highlightClient } from './client';
import { getHighlightSelectionContext } from './dom';
import { getSaveFailureMessage, translate } from './messages';

const STYLE_ID = 'gv-highlight-style';
const RENDER_DEBOUNCE_MS = 120;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .gv-highlight-mark {
      border-radius: 2px;
      color: inherit;
      cursor: pointer;
      margin: 0;
      padding: 0;
      text-decoration: none;
    }
    .gv-highlight-mark:focus-visible,
    .gv-highlight-mark.gv-highlight-active {
      outline: 2px solid #0b57d0;
      outline-offset: 2px;
    }
    .gv-highlight-mark-yellow { background: rgba(250, 204, 21, 0.38); }
    .gv-highlight-mark-green { background: rgba(74, 222, 128, 0.30); }
    .gv-highlight-mark-blue { background: rgba(96, 165, 250, 0.28); }
    .gv-highlight-mark-pink { background: rgba(244, 114, 182, 0.28); }

    .gv-highlight-popover {
      position: fixed;
      z-index: 10002;
      box-sizing: border-box;
      width: min(340px, calc(100vw - 24px));
      padding: 12px;
      border: 1px solid rgba(255, 255, 255, 0.14);
      border-radius: 12px;
      background: #202124;
      color: #f1f3f4;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    .gv-highlight-popover-quote {
      max-height: 72px;
      margin-bottom: 10px;
      overflow: auto;
      color: #bdc1c6;
      font-size: 12px;
      white-space: pre-wrap;
    }
    .gv-highlight-note {
      box-sizing: border-box;
      width: 100%;
      min-height: 76px;
      resize: vertical;
      padding: 8px 10px;
      border: 1px solid #5f6368;
      border-radius: 8px;
      background: #292a2d;
      color: inherit;
      font: inherit;
    }
    .gv-highlight-note:focus {
      border-color: #8ab4f8;
      outline: 2px solid rgba(138, 180, 248, 0.22);
    }
    .gv-highlight-color-row {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 10px;
    }
    .gv-highlight-color-label { margin-inline-end: 2px; color: #bdc1c6; }
    .gv-highlight-swatch {
      position: relative;
      width: 22px;
      height: 22px;
      padding: 0;
      border: 2px solid transparent;
      border-radius: 50%;
      cursor: pointer;
    }
    .gv-highlight-swatch[aria-pressed="true"] {
      border-color: rgba(255, 255, 255, 0.94);
      outline: 2px solid #8ab4f8;
      outline-offset: 1px;
      box-shadow: 0 2px 8px rgba(138, 180, 248, 0.34);
    }
    .gv-highlight-swatch[aria-pressed="true"]::after {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      color: #fff;
      content: "✓";
      font-size: 12px;
      font-weight: 800;
      line-height: 1;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.78);
    }
    .gv-highlight-popover-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 12px;
    }
    .gv-highlight-popover-button {
      min-height: 32px;
      padding: 5px 11px;
      border: 1px solid #5f6368;
      border-radius: 16px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font: inherit;
      font-weight: 600;
    }
    .gv-highlight-popover-button:hover { background: rgba(255, 255, 255, 0.08); }
    .gv-highlight-popover-button:disabled { cursor: default; opacity: 0.55; }
    .gv-highlight-popover-button-primary {
      border-color: #8ab4f8;
      background: #8ab4f8;
      color: #202124;
    }
    .gv-highlight-popover-button-danger { color: #f28b82; }
    .gv-highlight-live {
      position: fixed;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .gv-highlight-timeline-tick {
      position: absolute;
      z-index: 4;
      inset-inline-end: 1px;
      width: 5px;
      height: 11px;
      margin: -5px 0 0;
      padding: 0;
      border: 0;
      border-radius: 3px;
      cursor: pointer;
      transform: none;
    }
    .gv-highlight-timeline-tick:focus-visible { outline: 2px solid #0b57d0; outline-offset: 2px; }
    .gv-highlight-timeline-tick-yellow { background: #e8b400; }
    .gv-highlight-timeline-tick-green { background: #24a148; }
    .gv-highlight-timeline-tick-blue { background: #1a73e8; }
    .gv-highlight-timeline-tick-pink { background: #d9468f; }

    .theme-host.light-theme .gv-highlight-popover,
    body[data-theme="light"] .gv-highlight-popover {
      border-color: rgba(60, 64, 67, 0.18);
      background: #fff;
      color: #202124;
      box-shadow: 0 8px 28px rgba(60, 64, 67, 0.22);
    }
    .theme-host.light-theme .gv-highlight-popover-quote,
    .theme-host.light-theme .gv-highlight-color-label,
    body[data-theme="light"] .gv-highlight-popover-quote,
    body[data-theme="light"] .gv-highlight-color-label { color: #5f6368; }
    .theme-host.light-theme .gv-highlight-note,
    body[data-theme="light"] .gv-highlight-note {
      border-color: #dadce0;
      background: #f8f9fa;
      color: #202124;
    }
    .theme-host.light-theme .gv-highlight-popover-button:hover,
    body[data-theme="light"] .gv-highlight-popover-button:hover { background: #f1f3f4; }
    .theme-host.light-theme .gv-highlight-popover-button-primary,
    body[data-theme="light"] .gv-highlight-popover-button-primary {
      border-color: #0b57d0;
      background: #0b57d0;
      color: #fff;
    }
    body.gv-rtl .gv-highlight-color-row,
    body.gv-rtl .gv-highlight-popover-actions { flex-direction: row-reverse; }
    @media (prefers-color-scheme: light) {
      .gv-highlight-popover {
        border-color: rgba(60, 64, 67, 0.18);
        background: #fff;
        color: #202124;
      }
      .gv-highlight-popover-quote,
      .gv-highlight-color-label { color: #5f6368; }
      .gv-highlight-note { border-color: #dadce0; background: #f8f9fa; color: #202124; }
      .gv-highlight-popover-button:hover { background: #f1f3f4; }
      .gv-highlight-popover-button-primary {
        border-color: #0b57d0;
        background: #0b57d0;
        color: #fff;
      }
    }
    .theme-host.dark-theme .gv-highlight-popover,
    body[data-theme="dark"] .gv-highlight-popover {
      border-color: rgba(255, 255, 255, 0.14);
      background: #202124;
      color: #f1f3f4;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.28);
    }
    .theme-host.dark-theme .gv-highlight-popover-quote,
    .theme-host.dark-theme .gv-highlight-color-label,
    body[data-theme="dark"] .gv-highlight-popover-quote,
    body[data-theme="dark"] .gv-highlight-color-label { color: #bdc1c6; }
    .theme-host.dark-theme .gv-highlight-note,
    body[data-theme="dark"] .gv-highlight-note {
      border-color: #5f6368;
      background: #292a2d;
      color: #f1f3f4;
    }
    .theme-host.dark-theme .gv-highlight-popover-button:hover,
    body[data-theme="dark"] .gv-highlight-popover-button:hover {
      background: rgba(255, 255, 255, 0.08);
    }
    .theme-host.dark-theme .gv-highlight-popover-button-primary,
    body[data-theme="dark"] .gv-highlight-popover-button-primary {
      border-color: #8ab4f8;
      background: #8ab4f8;
      color: #202124;
    }
    @media (forced-colors: active) {
      .gv-highlight-mark { background: transparent; outline: 1px solid Highlight; }
      .gv-highlight-timeline-tick { background: Highlight; }
    }
  `;
  document.head.appendChild(style);
}

export class HighlightManager {
  private readonly records = new Map<string, HighlightRecordV1>();
  private readonly marks = new HighlightMarks();
  private readonly navigation = new HighlightNavigation(
    this.marks.elements,
    this.records,
    () => this.destroyed,
  );
  private destroyed = false;
  private observer: MutationObserver | null = null;
  private renderTimer: number | null = null;
  private reloadTimer: number | null = null;
  private currentRoute = '';
  private currentConversationId = '';
  private accountScope: HighlightAccountScope | null = null;
  private scopeGeneration = 0;
  private loadGeneration = 0;
  private liveRegion: HTMLElement | null = null;
  private announceTimer: number | null = null;
  private colorPalette = [...DEFAULT_HIGHLIGHT_COLOR_PALETTE];
  private readonly onDocumentClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : null;
    const mark = target?.closest<HTMLElement>('.gv-highlight-mark[data-gv-highlight-id]');
    if (mark) {
      event.preventDefault();
      event.stopPropagation();
      const id = mark.dataset.gvHighlightId;
      const record = id ? this.records.get(id) : undefined;
      if (record) this.editor.open(record, mark, this.colorPalette);
    }
  };
  private readonly onDocumentKeydown = (event: KeyboardEvent): void => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target instanceof Element ? event.target : null;
    const mark = target?.closest<HTMLElement>('.gv-highlight-mark[data-gv-highlight-id]');
    if (!mark) return;
    event.preventDefault();
    const id = mark.dataset.gvHighlightId;
    const record = id ? this.records.get(id) : undefined;
    if (record) this.editor.open(record, mark, this.colorPalette);
  };
  private readonly onHashChange = (): void => {
    this.navigation.handleHash();
  };
  private readonly onRouteEvent = (): void => {
    this.checkRoute();
  };
  private readonly onRuntimeMessage = (message: unknown): void => {
    if (!message || typeof message !== 'object') return;
    const typed = message as { type?: unknown; payload?: { conversationId?: unknown } };
    if (typed.type !== 'gv.highlight.changed') return;
    const changedConversationId = typed.payload?.conversationId;
    if (
      typeof changedConversationId === 'string' &&
      changedConversationId !== this.currentConversationId
    ) {
      return;
    }
    this.scheduleReload();
  };

  private readonly editor = new HighlightEditor({
    save: (record, patch) => this.saveHighlight(record, patch),
    delete: (record) => this.deleteHighlight(record),
    announce: (message) => this.announce(message),
  });
  private readonly timelineMarkers = new HighlightTimelineMarkers(
    this.records,
    this.marks.elements,
    (id) => this.navigateToHighlight(id),
  );

  constructor(private readonly client: HighlightClient = highlightClient) {}

  setColorPalette(colors: readonly HighlightColor[]): void {
    this.colorPalette = normalizeHighlightColorPalette(colors);
  }

  setTimelineMarkersEnabled(enabled: boolean): void {
    this.timelineMarkers.setEnabled(enabled);
  }

  async init(): Promise<void> {
    if (this.destroyed) return;
    injectStyles();
    this.ensureLiveRegion();
    if (!(await this.refreshScopeForCurrentRoute()) || this.destroyed) return;

    document.addEventListener('click', this.onDocumentClick, true);
    document.addEventListener('keydown', this.onDocumentKeydown, true);
    window.addEventListener('hashchange', this.onHashChange);
    window.addEventListener('popstate', this.onRouteEvent);
    this.timelineMarkers.start();
    chrome.runtime.onMessage.addListener(this.onRuntimeMessage);

    this.observer = new MutationObserver(() => this.scheduleRender());
    this.observeDocument();
    await this.reload();
  }

  canCreateFromRange(range: Range): boolean {
    const context = getHighlightSelectionContext(range);
    return Boolean(context && !range.collapsed && range.toString().trim());
  }

  async createFromRange(range: Range, color: HighlightColor = 'yellow'): Promise<boolean> {
    const context = getHighlightSelectionContext(range);
    if (!context) return false;
    const anchor = buildHighlightAnchor(context.assistantRoot, range);
    if (!anchor) {
      if (new TextEncoder().encode(range.toString()).byteLength > HIGHLIGHT_EXACT_MAX_BYTES) {
        this.announce(translate('highlightTooLong', 'The selected text is too long to highlight.'));
      } else {
        this.announce(translate('highlightSaveFailed', 'Could not save the highlight.'));
      }
      return false;
    }

    const input: HighlightCreateInput = {
      conversationId: context.conversationId,
      conversationUrl: context.conversationUrl,
      conversationTitle: context.conversationTitle,
      turnId: context.turnId,
      role: 'assistant',
      anchor,
      color,
    };

    try {
      const selectedUrl = new URL(context.conversationUrl);
      const selectedRoute = selectedUrl.pathname + selectedUrl.search;
      if (selectedRoute !== this.getRouteKey() || !(await this.refreshAccountScopeForMutation())) {
        throw new Error('The conversation changed before the highlight could be saved');
      }
      const scope = this.accountScope;
      if (!scope) throw new Error('Highlight account scope is unavailable');
      const record = await this.client.create(scope, input);
      if (this.destroyed) return false;
      this.records.set(record.id, record);
      this.renderAll();
      this.announce(translate('highlightSaved', 'Highlight saved.'));
      return true;
    } catch (error) {
      this.announce(getSaveFailureMessage(error));
      return false;
    }
  }

  navigateToHighlight(
    id: string,
    behavior: ScrollBehavior = 'smooth',
    allowTurnFallback = true,
  ): HighlightNavigationResult {
    return this.navigation.navigate(id, behavior, allowTurnFallback);
  }

  private getRouteKey(): string {
    return `${location.pathname}${location.search}`;
  }

  private checkRoute(): void {
    if (this.destroyed) return;
    const nextRoute = this.getRouteKey();
    if (nextRoute === this.currentRoute) return;
    this.currentRoute = nextRoute;
    this.currentConversationId = buildConversationIdFromUrl(location.href);
    this.accountScope = null;
    this.editor.close();
    this.clearRenderedMarks();
    this.records.clear();
    void this.refreshScopeAndReload();
  }

  private async resolveAccountScope(): Promise<HighlightAccountScope | null> {
    try {
      const context = detectAccountContextFromDocument(location.href, document);
      const resolved = await accountIsolationService.resolveAccountScope({
        pageUrl: location.href,
        routeUserId: context.routeUserId,
        email: context.email,
      });
      return {
        platform: 'gemini',
        accountKey: resolved.accountKey,
        accountId: resolved.accountId,
        routeUserId: resolved.routeUserId,
      };
    } catch {
      return null;
    }
  }

  private async refreshScopeAndReload(): Promise<void> {
    if ((await this.refreshScopeForCurrentRoute()) && !this.destroyed) await this.reload();
  }

  private async refreshScopeForCurrentRoute(): Promise<boolean> {
    while (!this.destroyed) {
      const generation = ++this.scopeGeneration;
      const route = this.getRouteKey();
      const scope = await this.resolveAccountScope();
      if (this.destroyed || generation !== this.scopeGeneration) return false;
      if (route !== this.getRouteKey()) continue;
      this.currentRoute = route;
      this.currentConversationId = buildConversationIdFromUrl(location.href);
      this.accountScope = scope;
      return scope !== null;
    }
    return false;
  }

  private async refreshAccountScopeForMutation(): Promise<boolean> {
    const previous = this.accountScope;
    if (!(await this.refreshScopeForCurrentRoute())) return false;
    const next = this.accountScope;
    if (
      previous &&
      next &&
      (previous.accountKey !== next.accountKey || previous.platform !== next.platform)
    ) {
      // Listing the newly resolved account also performs the one-time migration
      // from a legacy `default` bucket before an edit/create continues.
      await this.reload();
    }
    return true;
  }

  private async reload(): Promise<void> {
    const generation = ++this.loadGeneration;
    const conversationId = this.currentConversationId;
    const scope = this.accountScope;
    if (!conversationId || !scope) return;
    try {
      const records = await this.client.list(scope, conversationId);
      if (this.destroyed || generation !== this.loadGeneration) return;
      this.clearRenderedMarks();
      this.records.clear();
      records
        .filter((record) => !record.deletedAt)
        .forEach((record) => this.records.set(record.id, record));
      this.renderAll();
      this.navigation.handleHash();
    } catch {
      // A disabled/reloaded extension should leave Gemini untouched.
    }
  }

  private scheduleReload(): void {
    if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
    this.reloadTimer = window.setTimeout(() => {
      this.reloadTimer = null;
      void this.reload();
    }, RENDER_DEBOUNCE_MS);
  }

  private scheduleRender(): void {
    if (this.destroyed || this.renderTimer !== null) return;
    this.renderTimer = window.setTimeout(() => {
      this.renderTimer = null;
      if (this.getRouteKey() !== this.currentRoute) {
        this.checkRoute();
        return;
      }
      this.renderAll();
    }, RENDER_DEBOUNCE_MS);
  }

  private observeDocument(): void {
    if (!this.observer || this.destroyed || !document.body) return;
    this.observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  private renderAll(): void {
    if (this.destroyed) return;
    this.observer?.disconnect();
    try {
      this.marks.render(this.records);
      this.timelineMarkers.render();
      this.navigation.retryPending();
    } finally {
      this.observeDocument();
    }
  }

  private clearRenderedMarks(): void {
    this.observer?.disconnect();
    try {
      this.marks.clear();
      this.timelineMarkers.clear();
    } finally {
      this.observeDocument();
    }
  }

  private async saveHighlight(
    record: HighlightRecordV1,
    patch: HighlightUpdatePatch,
  ): Promise<void> {
    if (!(await this.refreshAccountScopeForMutation())) {
      throw new Error('Highlight account scope is unavailable');
    }
    const scope = this.accountScope;
    if (!scope) throw new Error('Highlight account scope is unavailable');
    const updated = await this.client.update(scope, record.conversationId, record.id, patch);
    if (this.destroyed) return;
    this.records.set(updated.id, updated);
    this.marks.updateColor(updated.id, updated.color);
    this.timelineMarkers.render();
  }

  private async deleteHighlight(record: HighlightRecordV1): Promise<void> {
    if (!(await this.refreshAccountScopeForMutation())) {
      throw new Error('Highlight account scope is unavailable');
    }
    const scope = this.accountScope;
    if (!scope) throw new Error('Highlight account scope is unavailable');
    await this.client.delete(scope, record.conversationId, record.id);
    if (this.destroyed) return;
    this.records.delete(record.id);
    this.marks.remove(record.id);
    this.timelineMarkers.render();
  }

  private ensureLiveRegion(): void {
    if (this.liveRegion?.isConnected) return;
    const live = document.createElement('div');
    live.className = 'gv-highlight-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
    this.liveRegion = live;
  }

  private announce(message: string): void {
    this.ensureLiveRegion();
    if (!this.liveRegion) return;
    this.liveRegion.textContent = '';
    if (this.announceTimer !== null) window.clearTimeout(this.announceTimer);
    this.announceTimer = window.setTimeout(() => {
      this.announceTimer = null;
      if (this.liveRegion) this.liveRegion.textContent = message;
    }, 0);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.loadGeneration++;
    this.scopeGeneration++;
    this.observer?.disconnect();
    this.observer = null;
    this.timelineMarkers.destroy();
    document.removeEventListener('click', this.onDocumentClick, true);
    document.removeEventListener('keydown', this.onDocumentKeydown, true);
    window.removeEventListener('hashchange', this.onHashChange);
    window.removeEventListener('popstate', this.onRouteEvent);
    chrome.runtime.onMessage.removeListener(this.onRuntimeMessage);
    if (this.renderTimer !== null) window.clearTimeout(this.renderTimer);
    if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
    this.navigation.destroy();
    if (this.announceTimer !== null) window.clearTimeout(this.announceTimer);
    this.editor.close();
    this.clearRenderedMarks();
    this.liveRegion?.remove();
    this.liveRegion = null;
    document.getElementById(STYLE_ID)?.remove();
  }
}
