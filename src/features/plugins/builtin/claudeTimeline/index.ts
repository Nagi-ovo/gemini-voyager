import { StorageKeys } from '@/core/types/common';
import { hashString } from '@/core/utils/hash';
import { StarredMessagesService } from '@/pages/content/timeline/StarredMessagesService';
import { TimelinePreviewPanel } from '@/pages/content/timeline/TimelinePreviewPanel';
import type { StarredMessage } from '@/pages/content/timeline/starredTypes';
import type { PreviewMarkerData } from '@/pages/content/timeline/types';
import { initI18n } from '@/utils/i18n';

// ponytail: one stable Claude selector; add fallbacks only when Claude actually breaks it.
const USER_MESSAGE_SELECTOR = '[data-testid="user-message"]';
const BAR_SELECTOR = '.gemini-timeline-bar[data-gv-claude-timeline="true"]';
const REFRESH_DELAY_MS = 120;
const LONG_PRESS_MS = 550;
const ACTIVE_ANCHOR = 0.45;
const NAVIGATION_ACTIVE_LOCK_MS = 900;
const TOOLTIP_DELAY_MS = 150;

type Dot = HTMLButtonElement & {
  dataset: DOMStringMap & { targetTurnId?: string; markerIndex?: string };
};

interface Marker {
  id: string;
  summary: string;
  index: number;
  starred: boolean;
  starredAt?: number;
  element: HTMLElement;
  dotElement: Dot | null;
}

export function buildClaudeConversationId(input = location.href): string {
  try {
    const url = new URL(input, location.origin);
    const chatId = url.pathname.match(/^\/chat\/([^/?#]+)/)?.[1];
    return chatId
      ? `claude:conv:${chatId}`
      : `claude:${hashString(`${url.origin}${url.pathname}`)}`;
  } catch {
    return `claude:${hashString(String(input || ''))}`;
  }
}

export function buildClaudeTurnId(index: number, text: string): string {
  return `c-${index}-${hashString(text || String(index))}`;
}

class ClaudeTimeline {
  private bar: HTMLElement | null = null;
  private trackContent: HTMLElement | null = null;
  private tooltip: HTMLElement | null = null;
  private previewPanel: TimelinePreviewPanel | null = null;
  private observer: MutationObserver | null = null;
  private markers: Marker[] = [];
  private markerCenters: number[] = [];
  private conversationId = '';
  private starred = new Map<string, number>();
  private refreshTimer: number | null = null;
  private longPressTimer: number | null = null;
  private tooltipTimer: number | null = null;
  private longPressDot: Dot | null = null;
  private suppressClickUntil = 0;
  private activeTurnId: string | null = null;
  private navigationActiveLockUntil = 0;
  private scrollTarget: HTMLElement | Window | null = null;
  private storageListener:
    | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
    | null = null;
  private destroyed = false;

  async start(): Promise<void> {
    await initI18n().catch(() => {});
    if (this.destroyed) return;
    this.ensureUi();
    await this.refresh();
    if (this.destroyed) return;
    this.observe();
    window.addEventListener('hashchange', this.handleHash);
    window.addEventListener('resize', this.handleResize);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    if (this.tooltipTimer !== null) clearTimeout(this.tooltipTimer);
    this.cancelLongPress();
    this.observer?.disconnect();
    this.observer = null;
    this.setScrollTarget(null);
    window.removeEventListener('hashchange', this.handleHash);
    window.removeEventListener('resize', this.handleResize);
    if (this.storageListener && chrome.storage?.onChanged) {
      chrome.storage.onChanged.removeListener(this.storageListener);
    }
    this.storageListener = null;
    this.previewPanel?.destroy();
    this.previewPanel = null;
    this.tooltip?.remove();
    this.tooltip = null;
    this.bar?.remove();
    this.bar = null;
    this.trackContent = null;
    this.markers = [];
  }

  private observe(): void {
    if (!document.body || this.observer) return;
    this.observer = new MutationObserver((records) => {
      if (!records.some((record) => this.shouldRefreshForMutation(record))) return;
      this.scheduleRefresh();
    });
    this.observer.observe(document.body, { childList: true, subtree: true });

    if (chrome.storage?.onChanged && !this.storageListener) {
      this.storageListener = (changes, areaName) => {
        if (areaName !== 'local' || !changes[StorageKeys.TIMELINE_STARRED_MESSAGES]) return;
        void this.loadStars(true).then(() => this.applyStarredState());
      };
      chrome.storage.onChanged.addListener(this.storageListener);
    }
  }

  private isOwnMutation(record: MutationRecord): boolean {
    const nodes = [
      record.target,
      ...Array.from(record.addedNodes),
      ...Array.from(record.removedNodes),
    ];
    return nodes.every((node) => {
      const element =
        node instanceof window.Element
          ? node
          : node.parentElement instanceof window.Element
            ? node.parentElement
            : null;
      return !!element?.closest(
        '[data-gv-claude-timeline="true"], .timeline-preview-panel, .timeline-preview-toggle',
      );
    });
  }

  private shouldRefreshForMutation(record: MutationRecord): boolean {
    if (this.isOwnMutation(record)) return false;
    return (
      !!this.toElement(record.target)?.closest(USER_MESSAGE_SELECTOR) ||
      [...Array.from(record.addedNodes), ...Array.from(record.removedNodes)].some((node) =>
        this.touchesTurn(node),
      )
    );
  }

  private touchesTurn(node: Node): boolean {
    const element = this.toElement(node);
    return !!(
      element?.closest(USER_MESSAGE_SELECTOR) || element?.querySelector?.(USER_MESSAGE_SELECTOR)
    );
  }

  private toElement(node: Node): Element | null {
    return node instanceof window.Element
      ? node
      : node.parentElement instanceof window.Element
        ? node.parentElement
        : null;
  }

  private ensureUi(): void {
    let bar = document.querySelector(BAR_SELECTOR) as HTMLElement | null;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'gemini-timeline-bar';
      bar.dataset.gvClaudeTimeline = 'true';
      const track = document.createElement('div');
      track.className = 'timeline-track';
      const content = document.createElement('div');
      content.className = 'timeline-track-content';
      track.appendChild(content);
      bar.appendChild(track);
      document.body.appendChild(bar);
    }
    this.bar = bar;
    this.trackContent = bar.querySelector('.timeline-track-content') as HTMLElement | null;
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.id = 'claude-timeline-tooltip';
      this.tooltip.className = 'timeline-tooltip';
      this.tooltip.setAttribute('aria-hidden', 'true');
      const text = document.createElement('div');
      text.className = 'claude-timeline-tooltip-text';
      this.tooltip.appendChild(text);
      document.body.appendChild(this.tooltip);
    }
    if (!this.previewPanel) {
      this.previewPanel = new TimelinePreviewPanel(bar);
      this.previewPanel.init((turnId) => this.navigateTo(turnId));
    }
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer !== null) clearTimeout(this.refreshTimer);
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.refresh();
    }, REFRESH_DELAY_MS);
  }

  private async refresh(): Promise<void> {
    if (this.destroyed) return;
    this.ensureUi();
    await this.loadStars();
    if (this.destroyed) return;
    const oldDots = new Map(this.markers.map((marker) => [marker.id, marker.dotElement]));
    const previousIds = this.markers.map((marker) => marker.id);
    const turns = Array.from(document.querySelectorAll<HTMLElement>(USER_MESSAGE_SELECTOR));
    const nextMarkers = turns.map((element, index) => {
      const summary = this.extractText(element);
      const id = buildClaudeTurnId(index, summary);
      element.dataset.gvClaudeTurnId = id;
      return {
        id,
        element,
        summary,
        index,
        starred: this.starred.has(id),
        starredAt: this.starred.get(id),
        dotElement: oldDots.get(id) ?? null,
      };
    });
    const sameMarkers =
      previousIds.length === nextMarkers.length &&
      previousIds.every((id, index) => id === nextMarkers[index]?.id);
    this.markers = nextMarkers;
    this.setScrollTarget(this.markers[0] ? this.getScrollTarget(this.markers[0].element) : window);
    this.markerCenters = this.computeMarkerCenters();
    if (!sameMarkers || this.markers.some((marker) => !marker.dotElement)) this.renderDots();
    this.updatePreview();
    this.refreshActive();
    this.handleHash();
  }

  private async loadStars(force = false): Promise<void> {
    const nextConversationId = buildClaudeConversationId();
    if (!force && nextConversationId === this.conversationId) return;
    this.conversationId = nextConversationId;
    const messages = await StarredMessagesService.getStarredMessagesForConversation(
      this.conversationId,
    );
    this.starred = new Map(messages.map((message) => [message.turnId, message.starredAt]));
  }

  private renderDots(): void {
    if (!this.trackContent) return;
    this.trackContent.textContent = '';
    const last = Math.max(1, this.markers.length - 1);
    this.markers.forEach((marker, index) => {
      const dot = document.createElement('button') as Dot;
      dot.className = 'timeline-dot';
      dot.type = 'button';
      dot.dataset.targetTurnId = marker.id;
      dot.dataset.markerIndex = String(index);
      dot.style.setProperty('--n', String(this.markers.length === 1 ? 0.5 : index / last));
      dot.setAttribute('aria-label', marker.summary || `Message ${index + 1}`);
      dot.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
      dot.setAttribute('aria-current', marker.id === this.activeTurnId ? 'true' : 'false');
      dot.classList.toggle('starred', marker.starred);
      dot.classList.toggle('active', marker.id === this.activeTurnId);
      dot.addEventListener('click', (event) => {
        if (Date.now() < this.suppressClickUntil) {
          event.preventDefault();
          return;
        }
        this.navigateTo(marker.id);
      });
      dot.addEventListener('pointerdown', () => this.startLongPress(dot));
      dot.addEventListener('pointerup', () => this.cancelLongPress());
      dot.addEventListener('pointercancel', () => this.cancelLongPress());
      dot.addEventListener('pointerenter', () => this.scheduleTooltip(dot));
      dot.addEventListener('pointerleave', () => {
        this.cancelLongPress();
        this.hideTooltip();
      });
      dot.addEventListener('focus', () => this.showTooltip(dot));
      dot.addEventListener('blur', () => this.hideTooltip());
      marker.dotElement = dot;
      this.trackContent!.appendChild(dot);
    });
  }

  private startLongPress(dot: Dot): void {
    this.cancelLongPress();
    this.longPressDot = dot;
    dot.classList.add('holding');
    this.longPressTimer = window.setTimeout(() => {
      this.longPressTimer = null;
      this.suppressClickUntil = Date.now() + 350;
      const id = dot.dataset.targetTurnId;
      if (id) void this.toggleStar(id);
      this.cancelLongPress();
    }, LONG_PRESS_MS);
  }

  private cancelLongPress(): void {
    if (this.longPressTimer !== null) clearTimeout(this.longPressTimer);
    this.longPressTimer = null;
    this.longPressDot?.classList.remove('holding');
    this.longPressDot = null;
  }

  private async toggleStar(turnId: string): Promise<void> {
    const marker = this.markers.find((item) => item.id === turnId);
    if (!marker) return;
    if (this.starred.has(turnId)) {
      this.starred.delete(turnId);
      await StarredMessagesService.removeStarredMessage(this.conversationId, turnId);
    } else {
      const starredAt = Date.now();
      this.starred.set(turnId, starredAt);
      const message: StarredMessage = {
        turnId,
        content: marker.summary,
        conversationId: this.conversationId,
        conversationUrl: location.href.split('#')[0],
        conversationTitle: this.getTitle(),
        starredAt,
      };
      await StarredMessagesService.addStarredMessage(message);
    }
    this.applyStarredState();
  }

  private applyStarredState(): void {
    this.markers.forEach((marker) => {
      marker.starred = this.starred.has(marker.id);
      marker.starredAt = this.starred.get(marker.id);
      marker.dotElement?.classList.toggle('starred', marker.starred);
      marker.dotElement?.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
    });
    this.updatePreview();
  }

  private updatePreview(): void {
    this.previewPanel?.updateMarkers(this.markers as PreviewMarkerData[]);
    this.previewPanel?.updateActiveTurn(this.activeTurnId);
  }

  private setActiveTurn(turnId: string | null): void {
    if (this.activeTurnId === turnId) return;
    const previousTurnId = this.activeTurnId;
    this.activeTurnId = turnId;
    this.updateDotActive(previousTurnId, false);
    this.updateDotActive(turnId, true);
    this.previewPanel?.updateActiveTurn(turnId);
  }

  private updateDotActive(turnId: string | null, active: boolean): void {
    const dot = this.markers.find((marker) => marker.id === turnId)?.dotElement;
    dot?.classList.toggle('active', active);
    dot?.setAttribute('aria-current', active ? 'true' : 'false');
  }

  private scheduleTooltip(dot: Dot): void {
    if (this.tooltipTimer !== null) clearTimeout(this.tooltipTimer);
    this.tooltipTimer = window.setTimeout(() => {
      this.tooltipTimer = null;
      this.showTooltip(dot);
    }, TOOLTIP_DELAY_MS);
  }

  private showTooltip(dot: Dot): void {
    if (!this.tooltip || !dot.isConnected) return;
    const marker = this.markers.find((item) => item.id === dot.dataset.targetTurnId);
    if (!marker?.summary) return;

    this.getTooltipTextElement().textContent = `${marker.starred ? '★ ' : ''}${marker.summary}`;
    this.tooltip.setAttribute('dir', 'auto');
    this.tooltip.setAttribute('aria-hidden', 'false');
    this.tooltip.style.width = 'min(288px, calc(100vw - 32px))';

    const rect = dot.getBoundingClientRect();
    const gap = 18;
    const tooltipWidth = this.tooltip.offsetWidth || 288;
    const tooltipHeight = this.tooltip.offsetHeight || 78;
    const leftPlacement = rect.left > window.innerWidth / 2;
    const left = leftPlacement ? rect.left - gap - tooltipWidth : rect.right + gap;
    const top = Math.max(
      8,
      Math.min(
        window.innerHeight - tooltipHeight - 8,
        rect.top + rect.height / 2 - tooltipHeight / 2,
      ),
    );
    this.tooltip.style.left = `${Math.max(8, Math.round(left))}px`;
    this.tooltip.style.top = `${Math.round(top)}px`;
    this.tooltip.setAttribute('data-placement', leftPlacement ? 'left' : 'right');
    this.tooltip.classList.add('visible');
  }

  private hideTooltip(): void {
    if (this.tooltipTimer !== null) clearTimeout(this.tooltipTimer);
    this.tooltipTimer = null;
    this.tooltip?.classList.remove('visible');
    this.tooltip?.setAttribute('aria-hidden', 'true');
  }

  private getTooltipTextElement(): HTMLElement {
    return (this.tooltip?.firstElementChild as HTMLElement | null) ?? this.tooltip!;
  }

  private refreshActive(): void {
    if (this.activeTurnId && this.markers.some((marker) => marker.id === this.activeTurnId)) {
      this.updateDotActive(this.activeTurnId, true);
      return;
    }
    this.updateActiveFromScroll();
  }

  private updateActiveFromScroll = (): void => {
    if (!this.markers.length) {
      this.setActiveTurn(null);
      return;
    }
    if (Date.now() < this.navigationActiveLockUntil) return;
    if (this.isAtScrollBottom()) {
      this.setActiveTurn(this.markers[this.markers.length - 1]?.id ?? null);
      return;
    }
    const ref = this.getScrollTop() + this.getViewportHeight() * ACTIVE_ANCHOR;
    let low = 0;
    let high = this.markerCenters.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      if (this.markerCenters[mid] <= ref) low = mid + 1;
      else high = mid;
    }
    const previous = Math.max(0, low - 1);
    const next = Math.min(this.markerCenters.length - 1, low);
    const index =
      Math.abs(this.markerCenters[next] - ref) < Math.abs(this.markerCenters[previous] - ref)
        ? next
        : previous;
    this.setActiveTurn(this.markers[index]?.id ?? null);
  };

  private setScrollTarget(target: HTMLElement | Window | null): void {
    if (this.scrollTarget === target) return;
    this.scrollTarget?.removeEventListener('scroll', this.updateActiveFromScroll);
    this.scrollTarget = target;
    this.scrollTarget?.addEventListener('scroll', this.updateActiveFromScroll, { passive: true });
  }

  private navigateTo(turnId: string): void {
    const marker = this.markers.find((item) => item.id === turnId);
    if (!marker) return;
    this.navigationActiveLockUntil = Date.now() + NAVIGATION_ACTIVE_LOCK_MS;
    this.setActiveTurn(turnId);
    this.scrollMarkerIntoView(marker.element);
  }

  private handleHash = (): void => {
    const turnId = decodeURIComponent(location.hash.replace(/^#gv-turn-/, ''));
    if (!turnId || turnId === location.hash) return;
    this.navigateTo(turnId);
  };

  private handleResize = (): void => {
    this.scheduleRefresh();
    this.previewPanel?.reposition();
  };

  private extractText(element: HTMLElement): string {
    return (element.textContent || '').replace(/\s+/g, ' ').trim();
  }

  private getTitle(): string {
    const title = document.title.replace(/\s*[|-]\s*Claude.*$/i, '').trim();
    return title || this.markers[0]?.summary.slice(0, 50) || 'Claude conversation';
  }

  private getScrollTarget(element: HTMLElement): HTMLElement | Window {
    for (let parent = element.parentElement; parent && parent !== document.body; ) {
      const style = getComputedStyle(parent);
      if (
        /(auto|scroll|overlay)/.test(style.overflowY) &&
        parent.scrollHeight > parent.clientHeight
      )
        return parent;
      parent = parent.parentElement;
    }
    return window;
  }

  private computeMarkerCenters(): number[] {
    const viewportTop =
      this.scrollTarget && this.scrollTarget !== window
        ? (this.scrollTarget as HTMLElement).getBoundingClientRect().top
        : 0;
    const scrollTop = this.getScrollTop();
    return this.markers.map((marker) => {
      const rect = marker.element.getBoundingClientRect();
      return scrollTop + rect.top - viewportTop + rect.height / 2;
    });
  }

  private getScrollTop(): number {
    return this.scrollTarget && this.scrollTarget !== window
      ? (this.scrollTarget as HTMLElement).scrollTop
      : window.scrollY || document.documentElement.scrollTop || 0;
  }

  private getViewportHeight(): number {
    return this.scrollTarget && this.scrollTarget !== window
      ? (this.scrollTarget as HTMLElement).clientHeight
      : window.innerHeight || document.documentElement.clientHeight || 0;
  }

  private getScrollHeight(): number {
    return this.scrollTarget && this.scrollTarget !== window
      ? (this.scrollTarget as HTMLElement).scrollHeight
      : (document.scrollingElement || document.documentElement).scrollHeight;
  }

  private isAtScrollBottom(): boolean {
    const viewportHeight = this.getViewportHeight();
    const scrollHeight = this.getScrollHeight();
    return (
      scrollHeight > viewportHeight && this.getScrollTop() + viewportHeight >= scrollHeight - 2
    );
  }

  private scrollMarkerIntoView(element: HTMLElement): void {
    const target = this.getScrollTarget(element);
    const rect = element.getBoundingClientRect();
    if (target === window) {
      const top =
        this.getScrollTop() + rect.top + rect.height / 2 - this.getViewportHeight() * ACTIVE_ANCHOR;
      window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
      return;
    }
    const container = target as HTMLElement;
    const containerRect = container.getBoundingClientRect();
    const top =
      container.scrollTop +
      rect.top -
      containerRect.top -
      container.clientHeight * ACTIVE_ANCHOR +
      rect.height / 2;
    if (container.scrollTo) container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    else container.scrollTop = Math.max(0, top);
  }
}

let instance: ClaudeTimeline | null = null;

export function startClaudeTimeline(): void {
  if (instance) return;
  instance = new ClaudeTimeline();
  void instance.start();
}

export function stopClaudeTimeline(): void {
  instance?.destroy();
  instance = null;
}
