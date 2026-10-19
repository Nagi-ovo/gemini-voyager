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

import {
  type AccountHints,
  type PageIdentity,
  capturePageIdentity,
  isDifferentAccount,
  routeKeyOf,
} from '../selectionToolbar/pageIdentity';
import { HighlightEditor } from './HighlightEditor';
import { HighlightMarks } from './HighlightMarks';
import { HighlightNavigation, type HighlightNavigationResult } from './HighlightNavigation';
import { HIGHLIGHT_EXACT_MAX_BYTES, buildHighlightAnchor } from './anchor';
import { HighlightClient, highlightClient } from './client';
import { getHighlightSelectionContext } from './dom';
import highlightStyles from './highlight.css?inline';
import { HighlightTimelineAnnotations } from './highlightTimelineAnnotations';
import { getSaveFailureMessage, translate } from './messages';
import { type MutationIdentity, isAccountSwitch, isSameMutationPage } from './mutationIdentity';
import { followPageAccount, readPageAccountHints } from './pageAccount';

const STYLE_ID = 'gv-highlight-style';
const RENDER_DEBOUNCE_MS = 120;

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = highlightStyles;
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
  /** The account the shown records belong to; an email that fills in later updates it. */
  private accountHints: AccountHints | null = null;
  private scopeGeneration = 0;
  private loadGeneration = 0;
  private routeEpoch = 0;
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
  private readonly timelineAnnotations = new HighlightTimelineAnnotations(
    this.records,
    this.marks.elements,
    (id) => void this.navigateToHighlight(id),
  );

  constructor(private readonly client: HighlightClient = highlightClient) {}

  setColorPalette(colors: readonly HighlightColor[]): void {
    this.colorPalette = normalizeHighlightColorPalette(colors);
  }

  setTimelineMarkersEnabled(enabled: boolean): void {
    this.timelineAnnotations.setEnabled(enabled);
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
    if (this.destroyed) return false;
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

    const identity = this.captureMutation();
    try {
      const selectedUrl = new URL(context.conversationUrl);
      if (routeKeyOf(selectedUrl.pathname, selectedUrl.search) !== identity.page.routeKey) {
        throw new Error('The conversation changed before the highlight could be saved');
      }
      const scope = await this.resolveMutationScope(identity);
      const record = await this.client.create(scope, input);
      // The write was accepted for the source chat; only that chat's page may show it.
      if (!this.isCurrentMutation(identity)) return false;
      this.records.set(record.id, record);
      this.renderAll();
      this.announce(translate('highlightSaved', 'Highlight saved.'));
      return true;
    } catch (error) {
      if (this.isCurrentMutation(identity)) this.announce(getSaveFailureMessage(error));
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

  /** A rewrite of `/app/x` into `/u/0/app/x` stays the same route: nothing reloads or goes stale. */
  private getRouteKey(): string {
    return routeKeyOf(location.pathname, location.search);
  }

  private checkRoute(): void {
    if (this.destroyed) return;
    const nextRoute = this.getRouteKey();
    if (nextRoute === this.currentRoute) {
      this.checkAccount();
      return;
    }
    this.enterRoute(nextRoute);
    this.leavePage();
  }

  /** Same path, another signed-in account: drop A's records and load B's. True when it switched. */
  private checkAccount(): boolean {
    if (this.destroyed || !this.accountHints) return false;
    const followed = followPageAccount(this.accountHints);
    if (followed !== 'switched') {
      this.accountHints = followed;
      return false;
    }
    this.routeEpoch++;
    this.loadGeneration++;
    this.leavePage();
    return true;
  }

  /** Forget everything shown for the previous chat or account and load the current one. */
  private leavePage(): void {
    this.currentConversationId = buildConversationIdFromUrl(location.href);
    this.accountScope = null;
    this.accountHints = null;
    this.editor.close();
    this.clearRenderedMarks();
    this.records.clear();
    void this.refreshScopeAndReload();
  }

  /**
   * Move to another route. Loads and mutations started on the previous one go stale at once, even
   * before the new scope resolves: a late list or save from chat A must never land in chat B.
   */
  private enterRoute(route: string): void {
    if (this.currentRoute && route !== this.currentRoute) {
      this.routeEpoch++;
      this.loadGeneration++;
    }
    this.currentRoute = route;
  }

  private async resolveAccountScope(page?: PageIdentity): Promise<HighlightAccountScope | null> {
    try {
      const hints = page ?? detectAccountContextFromDocument(location.href, document);
      const resolved = await accountIsolationService.resolveAccountScope({
        pageUrl: page?.href ?? location.href,
        routeUserId: hints.routeUserId,
        email: hints.email,
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
      const hints = readPageAccountHints();
      const scope = await this.resolveAccountScope();
      if (this.destroyed || generation !== this.scopeGeneration) return false;
      // A scope resolved for account A must not list highlights onto B's page.
      if (route !== this.getRouteKey() || isDifferentAccount(hints, readPageAccountHints())) {
        continue;
      }
      this.enterRoute(route);
      this.currentConversationId = buildConversationIdFromUrl(location.href);
      this.accountScope = scope;
      this.accountHints = hints;
      return scope !== null;
    }
    return false;
  }

  private captureMutation(): MutationIdentity {
    return { page: capturePageIdentity(), epoch: this.routeEpoch, scope: this.accountScope };
  }

  /** Whether a mutation's result may still change this page's records, marks or messages. */
  private isCurrentMutation(identity: MutationIdentity): boolean {
    return !this.destroyed && identity.epoch === this.routeEpoch && isSameMutationPage(identity);
  }

  /**
   * The scope a mutation writes to, resolved from the hints taken when the user acted rather than
   * from whatever the page shows once the lookup returns.
   */
  private async resolveMutationScope(identity: MutationIdentity): Promise<HighlightAccountScope> {
    const scope = await this.resolveAccountScope(identity.page);
    if (!scope) throw new Error('Highlight account scope is unavailable');
    // Never write an action into the account the user switched to while it waited.
    if (isAccountSwitch(identity, scope)) {
      throw new Error('The account changed before the highlight could be saved');
    }
    const captured = identity.scope;
    if (captured && captured.accountKey !== scope.accountKey && this.isCurrentMutation(identity)) {
      // A startup placeholder completed to the real account. Listing it also claims the legacy
      // `default` bucket before the write continues.
      this.accountScope = scope;
      await this.reload();
      if (isAccountSwitch(identity, scope)) {
        throw new Error('The account changed before the highlight could be saved');
      }
    }
    return scope;
  }

  private async reload(): Promise<void> {
    const generation = ++this.loadGeneration;
    const route = this.currentRoute;
    const conversationId = this.currentConversationId;
    const scope = this.accountScope;
    if (!conversationId || !scope) return;
    try {
      const records = await this.client.list(scope, conversationId);
      if (this.destroyed || generation !== this.loadGeneration) return;
      // A pushState without popstate, or an account switch on the same path, with no DOM change
      // yet: this list belongs to the old chat or account.
      if (this.getRouteKey() !== route) {
        this.checkRoute();
        return;
      }
      if (this.checkAccount()) return;
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
      if (this.checkAccount()) return;
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
      this.timelineAnnotations.render();
      this.navigation.retryPending();
    } finally {
      this.observeDocument();
    }
  }

  private clearRenderedMarks(): void {
    this.observer?.disconnect();
    try {
      this.marks.clear();
      this.timelineAnnotations.clear();
    } finally {
      this.observeDocument();
    }
  }

  private async saveHighlight(
    record: HighlightRecordV1,
    patch: HighlightUpdatePatch,
  ): Promise<void> {
    // Detached editor buttons can retain callbacks after stop; only actions already accepted may finish.
    if (this.destroyed) return;
    const identity = this.captureMutation();
    const scope = await this.resolveMutationScope(identity);
    const updated = await this.client.update(scope, record.conversationId, record.id, patch);
    if (!this.isCurrentMutation(identity)) return;
    this.records.set(updated.id, updated);
    this.marks.updateColor(updated.id, updated.color);
    this.timelineAnnotations.render();
  }

  private async deleteHighlight(record: HighlightRecordV1): Promise<void> {
    // A stopped editor must not accept a new deletion from a retained button.
    if (this.destroyed) return;
    const identity = this.captureMutation();
    const scope = await this.resolveMutationScope(identity);
    await this.client.delete(scope, record.conversationId, record.id);
    if (!this.isCurrentMutation(identity)) return;
    this.records.delete(record.id);
    this.marks.remove(record.id);
    this.timelineAnnotations.render();
  }

  private ensureLiveRegion(): void {
    if (this.destroyed || this.liveRegion?.isConnected) return;
    const live = document.createElement('div');
    live.className = 'gv-highlight-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
    this.liveRegion = live;
  }

  private announce(message: string): void {
    // A late result after stop must not put a live region back on the page.
    if (this.destroyed) return;
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
    this.timelineAnnotations.destroy();
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
