import { keyboardShortcutService } from '@/core/services/KeyboardShortcutService';
import { StorageKeys } from '@/core/types/common';

import { getTranslationSync, initI18n } from '../../../utils/i18n';
import { eventBus } from './EventBus';
import { StarredMessagesService } from './StarredMessagesService';
import { TimelinePreviewPanel } from './TimelinePreviewPanel';
import type { StarredMessage, StarredMessagesData } from './starredTypes';
import type { DotElement, MarkerLevel } from './types';

function hashString(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/** Accessibility prefixes injected by Gemini's DOM that should be stripped from previews effectively globally. */
const TURN_LABEL_PREFIXES =
  /^[\u200B\u200C\u200D\u200E\u200F\uFEFF]*(?:you said|you wrote|user message|your prompt|you asked)[:\s]*/i;
const VISUALLY_HIDDEN_CLASS_FRAGMENT = 'visually-hidden';

type ExtGlobal = typeof globalThis & {
  chrome?: {
    storage?: {
      sync?: {
        get(k: Record<string, unknown>, cb: (items: Record<string, unknown>) => void): void;
        set?(items: Record<string, unknown>): void;
      };
      onChanged?: {
        addListener(
          cb: (changes: Record<string, { newValue: unknown }>, area: string) => void,
        ): void;
      };
    };
    runtime?: { lastError?: { message: string } };
  };
  browser?: {
    storage?: {
      sync?: {
        get(k: Record<string, unknown>): Promise<Record<string, unknown>>;
        set?(items: Record<string, unknown>): void;
      };
      onChanged?: {
        addListener(
          cb: (changes: Record<string, { newValue: unknown }>, area: string) => void,
        ): void;
      };
    };
  };
};

export class TimelineManager {
  private scrollContainer: HTMLElement | null = null;
  private conversationContainer: HTMLElement | null = null;
  private markers: Array<{
    id: string;
    element: HTMLElement;
    summary: string;
    n: number;
    baseN: number;
    dotElement: DotElement | null;
    starred: boolean;
  }> = [];
  private activeTurnId: string | null = null;
  private ui: {
    timelineBar: HTMLElement | null;
    tooltip: HTMLElement | null;
    track?: HTMLElement | null;
    trackContent?: HTMLElement | null;
    slider?: HTMLElement | null;
    sliderHandle?: HTMLElement | null;
  } = { timelineBar: null, tooltip: null };
  private isScrolling = false;

  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private visibleUserTurns: Set<Element> = new Set();
  private onTimelineBarClick: ((e: Event) => void) | null = null;
  private onScroll: (() => void) | null = null;
  private onTimelineWheel: ((e: WheelEvent) => void) | null = null;
  private onWindowResize: (() => void) | null = null;
  private onTimelineBarOver: ((e: MouseEvent) => void) | null = null;
  private onTimelineBarOut: ((e: MouseEvent) => void) | null = null;
  private scrollRafId: number | null = null;
  private lastActiveChangeTime = 0;
  private minActiveChangeInterval = 120;
  private pendingActiveId: string | null = null;
  private activeChangeTimer: number | null = null;
  private tooltipHideDelay = 100;
  private scrollMode: 'jump' | 'flow' = 'flow';
  private hideContainer: boolean = false;
  private runnerRing: HTMLElement | null = null;
  private flowAnimating = false;
  private tooltipHideTimer: number | null = null;
  private measureEl: HTMLElement | null = null;
  private measureCanvas: HTMLCanvasElement | null = null;
  private measureCtx: CanvasRenderingContext2D | null = null;
  private showRafId: number | null = null;
  private scale = 1;
  private contentHeight = 0;
  private yPositions: number[] = [];
  private markerTops: number[] = [];
  private visibleRange: { start: number; end: number } = { start: 0, end: -1 };
  private firstUserTurnOffset = 0;
  private contentSpanPx = 1;
  private usePixelTop = false;
  private _cssVarTopSupported: boolean | null = null;
  private sliderDragging = false;
  private sliderFadeTimer: number | null = null;
  private sliderFadeDelay = 1000;
  private sliderAlwaysVisible = false;
  private onSliderDown: ((ev: PointerEvent) => void) | null = null;
  private onSliderMove: ((ev: PointerEvent) => void) | null = null;
  private onSliderUp: ((ev: PointerEvent) => void) | null = null;
  private sliderStartClientY = 0;
  private sliderStartTop = 0;
  private markersVersion = 0;
  private resizeIdleTimer: number | null = null;
  private resizeIdleDelay = 140;
  private resizeIdleRICId: number | null = null;
  private onVisualViewportResize: (() => void) | null = null;
  private zeroTurnsTimer: number | null = null;
  private onStorage: ((e: StorageEvent) => void) | null = null;
  private onChromeStorageChanged:
    | ((changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void)
    | null = null;
  private starred: Set<string> = new Set();
  private markerMap: Map<
    string,
    {
      id: string;
      element: HTMLElement;
      dotElement: DotElement | null;
      starred: boolean;
      n: number;
      baseN: number;
      summary: string;
    }
  > = new Map();
  private conversationId: string | null = null;
  private userTurnSelector: string = '';
  private markerLevels: Map<string, MarkerLevel> = new Map();
  private collapsedMarkers: Set<string> = new Set();
  private markerLevelEnabled = false;
  private contextMenu: HTMLElement | null = null;
  private onContextMenu: ((ev: MouseEvent) => void) | null = null;
  private onDocumentClick: ((ev: MouseEvent) => void) | null = null;
  private onPointerDown: ((ev: PointerEvent) => void) | null = null;
  private onPointerMove: ((ev: PointerEvent) => void) | null = null;
  private onPointerUp: ((ev: PointerEvent) => void) | null = null;
  private onPointerCancel: ((ev: PointerEvent) => void) | null = null;
  private onPointerLeave: ((ev: PointerEvent) => void) | null = null;
  private pressTargetDot: DotElement | null = null;
  private pressStartPos: { x: number; y: number } | null = null;
  private longPressTimer: number | null = null;
  private longPressTriggered = false;
  private suppressClickUntil = 0;
  private longPressDuration = 550;
  private longPressMoveTolerance = 6;
  private onBarEnter: (() => void) | null = null;
  private onBarLeave: (() => void) | null = null;
  private onSliderEnter: (() => void) | null = null;
  private onSliderLeave: (() => void) | null = null;
  private draggable = false;
  private barDragging = false;
  private barStartPos = { x: 0, y: 0 };
  private barStartOffset = { x: 0, y: 0 };
  private onBarPointerDown: ((ev: PointerEvent) => void) | null = null;
  private onBarPointerMove: ((ev: PointerEvent) => void) | null = null;
  private onBarPointerUp: ((ev: PointerEvent) => void) | null = null;
  private eventBusUnsubscribers: Array<() => void> = [];
  private shortcutUnsubscribe: (() => void) | null = null;
  private navigationQueue: Array<'previous' | 'next'> = [];
  private isNavigating: boolean = false;
  private previewPanel: TimelinePreviewPanel | null = null;

  async init(): Promise<void> {
    await initI18n();
    const ok = await this.findCriticalElements();
    if (!ok) return;
    this.injectTimelineUI();
    this.setupEventListeners();
    this.setupObservers();
    this.conversationId = this.computeConversationId();
    await this.loadStars();
    await this.syncStarredFromService();
    this.loadMarkerLevels();
    this.loadCollapsedMarkers();
    // Ensure initial render even when Gemini DOM is already stable (no mutations after observer attaches)
    this.recalculateAndRenderMarkers();
    // Handle URL hash for starred message navigation
    this.handleStarredMessageNavigation();
    // Initialize keyboard shortcuts
    await this.initKeyboardShortcuts();
    try {
      const g = globalThis as ExtGlobal;
      const defaults = {
        geminiTimelineScrollMode: 'flow',
        geminiTimelineHideContainer: false,
        geminiTimelineDraggable: false,
        geminiTimelineMarkerLevel: false,
        geminiTimelinePosition: null,
      };

      let res: Record<string, unknown> | null = null;
      // prefer chrome.storage or browser.storage if available to sync with popup
      if (g.chrome?.storage?.sync || g.browser?.storage?.sync) {
        res = await new Promise((resolve) => {
          if (g.chrome?.storage?.sync?.get) {
            g.chrome.storage.sync.get(
              defaults as Record<string, unknown>,
              (items: Record<string, unknown>) => {
                if (g.chrome.runtime.lastError) {
                  console.error(
                    `[Timeline] chrome.storage.get failed: ${g.chrome.runtime.lastError.message}`,
                  );
                  resolve(null);
                } else {
                  resolve(items);
                }
              },
            );
          } else {
            g.browser?.storage?.sync
              ?.get(defaults)
              .then(resolve)
              .catch((error: Error) => {
                console.error(`[Timeline] browser.storage.get failed: ${error.message}`);
                resolve(null);
              });
          }
        });
      } else {
        // No extension storage available, try to load critical fallback from localStorage
        const saved = localStorage.getItem('geminiTimelineScrollMode');
        if (saved === 'flow' || saved === 'jump') res = { geminiTimelineScrollMode: saved };
      }

      const m = res?.geminiTimelineScrollMode;
      if (m === 'flow' || m === 'jump') this.scrollMode = m;
      this.hideContainer = !!res?.geminiTimelineHideContainer;
      this.applyContainerVisibility();
      this.toggleDraggable(!!res?.geminiTimelineDraggable);
      this.toggleMarkerLevel(!!res?.geminiTimelineMarkerLevel);

      // Load position with auto-migration from v1 to v2
      const position = res?.geminiTimelinePosition as
        | {
            version?: number;
            topPercent?: number;
            leftPercent?: number;
            top?: number;
            left?: number;
          }
        | undefined;
      if (position) {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        // v2 format: use percentage (responsive)
        if (
          position.version === 2 &&
          position.topPercent !== undefined &&
          position.leftPercent !== undefined
        ) {
          const top = (position.topPercent / 100) * viewportHeight;
          const left = (position.leftPercent / 100) * viewportWidth;
          this.applyPosition(top, left);
        }
        // v1 format: migrate to v2 (auto-upgrade)
        else if (position.top !== undefined && position.left !== undefined) {
          // Apply old position first
          this.applyPosition(position.top, position.left);

          // Migrate to v2 format (percentage-based)
          const migratedPosition = {
            version: 2,
            topPercent: (position.top / viewportHeight) * 100,
            leftPercent: (position.left / viewportWidth) * 100,
          };
          (g.chrome?.storage?.sync || g.browser?.storage?.sync)?.set?.({
            geminiTimelinePosition: migratedPosition,
          });
        }
      }

      // listen for changes from popup and update mode live
      try {
        const onChanged = g.chrome?.storage?.onChanged || g.browser?.storage?.onChanged;
        if (onChanged) {
          onChanged.addListener((changes: Record<string, { newValue: unknown }>, area: string) => {
            if (area !== 'sync') return;
            if (changes?.geminiTimelineScrollMode) {
              const n = changes.geminiTimelineScrollMode.newValue;
              if (n === 'flow' || n === 'jump') this.scrollMode = n;
            }
            if (changes?.geminiTimelineHideContainer) {
              this.hideContainer = !!changes.geminiTimelineHideContainer.newValue;
              this.applyContainerVisibility();
            }
            if (changes?.geminiTimelineDraggable) {
              this.toggleDraggable(!!changes.geminiTimelineDraggable.newValue);
            }
            if (changes?.geminiTimelineMarkerLevel) {
              this.toggleMarkerLevel(!!changes.geminiTimelineMarkerLevel.newValue);
            }
            if (changes?.geminiTimelinePosition && !changes.geminiTimelinePosition.newValue) {
              if (this.ui.timelineBar) {
                this.ui.timelineBar.style.top = '';
                this.ui.timelineBar.style.left = '';
              }
            }
          });
        }
      } catch {}
    } catch (err) {
      console.error('[Timeline] Init storage error:', err);
    }
  }

  private computeElementTopsInScrollContainer(elements: HTMLElement[]): number[] {
    if (!this.scrollContainer || elements.length === 0) return [];

    const containerRect = this.scrollContainer.getBoundingClientRect();
    const scrollTop = this.scrollContainer.scrollTop;

    const first = elements[0];
    const firstOffsetParent = first.offsetParent;
    const firstOffsetTop = first.offsetTop;
    const firstTop = first.getBoundingClientRect().top - containerRect.top + scrollTop;

    const sameOffsetParent =
      firstOffsetParent !== null && elements.every((el) => el.offsetParent === firstOffsetParent);

    const tops = elements.map((el) => {
      if (sameOffsetParent) {
        return firstTop + (el.offsetTop - firstOffsetTop);
      }
      return el.getBoundingClientRect().top - containerRect.top + scrollTop;
    });

    for (let i = 1; i < tops.length; i++) {
      if (tops[i] < tops[i - 1]) return [];
    }

    return tops;
  }

  private updateIntersectionObserverTargetsFromMarkers(): void {
    if (!this.intersectionObserver) return;
    this.intersectionObserver.disconnect();
    this.markers.forEach((m) => this.intersectionObserver!.observe(m.element));
  }

  private applyContainerVisibility(): void {
    if (!this.ui.timelineBar) return;
    this.ui.timelineBar.classList.toggle('timeline-no-container', !!this.hideContainer);
  }

  private computeConversationId(): string {
    const raw = `${location.host}${location.pathname}${location.search}`;
    return `gemini:${hashString(raw)}`;
  }

  /**
   * DRY helper: Get storage key for starred messages
   */
  private getStarsStorageKey(): string | null {
    return this.conversationId ? `geminiTimelineStars:${this.conversationId}` : null;
  }

  /**
   * DRY helper: Safe localStorage getItem with try-catch
   */
  private safeLocalStorageGet(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      console.warn('[Timeline] Failed to read from localStorage:', error);
      return null;
    }
  }

  /**
   * DRY helper: Safe localStorage setItem with try-catch
   */
  private safeLocalStorageSet(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (error) {
      console.warn('[Timeline] Failed to write to localStorage:', error);
      return false;
    }
  }

  private areStarredSetsEqual(a: Set<string>, b: Set<string>): boolean {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  private applyStarredIdSet(nextSet: Set<string>, persistLocal = true): void {
    if (this.areStarredSetsEqual(this.starred, nextSet)) return;

    this.starred = new Set(nextSet);

    if (persistLocal) this.saveStars();

    for (const marker of this.markers) {
      const want = this.starred.has(marker.id);
      if (marker.starred !== want) {
        marker.starred = want;
        if (marker.dotElement) {
          marker.dotElement.classList.toggle('starred', want);
          marker.dotElement.setAttribute('aria-pressed', want ? 'true' : 'false');
        }
      }
    }

    if (this.ui.tooltip?.classList.contains('visible')) {
      const currentDot = this.ui.timelineBar?.querySelector(
        '.timeline-dot:hover, .timeline-dot:focus',
      ) as DotElement | null;
      if (currentDot) this.refreshTooltipForDot(currentDot);
    }
  }

  private applySharedStarredData(data?: StarredMessagesData | null): void {
    if (!this.conversationId) return;

    const rawMessages = data?.messages?.[this.conversationId];
    const conversationMessages = Array.isArray(rawMessages) ? rawMessages : [];
    const nextSet = new Set(conversationMessages.map((message) => String(message.turnId)));

    this.applyStarredIdSet(nextSet);
  }

  private async syncStarredFromService(): Promise<void> {
    if (!this.conversationId) return;
    try {
      const messages = await StarredMessagesService.getStarredMessagesForConversation(
        this.conversationId,
      );
      const nextSet = new Set(messages.map((message) => String(message.turnId)));
      this.applyStarredIdSet(nextSet);
    } catch (error) {
      console.warn('[Timeline] Failed to sync starred messages from shared storage:', error);
    }
  }

  private getConversationTitle(): string {
    const getText = (el: Element | null | undefined): string | null => {
      const text = el?.textContent?.trim();
      return text && text.length > 0 ? text : null;
    };

    // Strategy 1: Prefer the currently selected conversation in folder view
    try {
      const selected = document.querySelector(
        '.gv-folder-conversation-selected .gv-conversation-title',
      );
      const title = getText(selected);
      if (title) return title;
    } catch (error) {
      console.debug('[Timeline] Failed to get title from selected folder conversation:', error);
    }

    // Strategy 2: Try to get from page title
    const titleElement = document.querySelector('title');
    if (titleElement) {
      const title = titleElement.textContent?.trim();
      // Filter out generic titles
      if (
        title &&
        title !== 'Gemini' &&
        title !== 'Google Gemini' &&
        title !== 'Google AI Studio' &&
        !title.startsWith('Gemini -') &&
        !title.startsWith('Google AI Studio -') &&
        title.length > 0
      ) {
        return title;
      }
    }

    // Strategy 3: Try to get from sidebar conversation list
    // Look for the active conversation in the sidebar
    try {
      // Gemini uses various selectors for conversation titles
      const selectors = [
        // Gemini sidebar active conversation
        'mat-list-item.mdc-list-item--activated [mat-line]',
        'mat-list-item[aria-current="page"] [mat-line]',
        // AI Studio active conversation
        '.conversation-list-item.active .conversation-title',
        '.active-conversation .title',
      ];

      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent) {
          const text = element.textContent.trim();
          if (text && text.length > 0 && text !== 'New chat') {
            return text;
          }
        }
      }
    } catch (error) {
      console.debug('[Timeline] Failed to get title from sidebar:', error);
    }

    // Strategy 4: Use first user message as title (fallback)
    const firstMarker = this.markers[0];
    if (firstMarker && firstMarker.summary) {
      const preview = firstMarker.summary.slice(0, 50);
      return preview.length < firstMarker.summary.length ? `${preview}...` : preview;
    }

    // Strategy 5: Extract from URL if it contains conversation ID
    try {
      const urlPath = window.location.pathname;
      const match = urlPath.match(/\/app\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        return `Conversation ${match[1].slice(0, 8)}...`;
      }
    } catch (error) {
      console.debug('[Timeline] Failed to extract from URL:', error);
    }

    // Final fallback: generic name
    return 'Untitled Conversation';
  }

  private waitForElement(selector: string, timeoutMs: number = 5000): Promise<Element | null> {
    return new Promise((resolve) => {
      const found = document.querySelector(selector);
      if (found) return resolve(found);
      const obs = new MutationObserver(() => {
        const el = document.querySelector(selector);
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

  private waitForAnyElement(
    selectors: string[],
    timeoutMs: number = 5000,
  ): Promise<{ element: Element; selector: string } | null> {
    return new Promise((resolve) => {
      for (const selector of selectors) {
        const found = document.querySelector(selector);
        if (found) return resolve({ element: found, selector });
      }

      const obs = new MutationObserver(() => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el) {
            try {
              obs.disconnect();
            } catch {}
            resolve({ element: el, selector });
            return;
          }
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

  private async findCriticalElements(): Promise<boolean> {
    const configured = this.getConfiguredUserTurnSelector();
    let userOverride = '';
    let autoDetected = '';
    try {
      userOverride = localStorage.getItem('geminiTimelineUserTurnSelector') || '';
      autoDetected = localStorage.getItem('geminiTimelineUserTurnSelectorAuto') || '';
    } catch {}
    const defaultCandidates = [
      // Angular-based Gemini UI user bubble (primary)
      '.user-query-bubble-with-background',
      // Angular containers (fallbacks if bubble selector changes)
      '.user-query-bubble-container',
      '.user-query-container',
      'user-query-content .user-query-bubble-with-background',
      // Attribute-based fallbacks for other Gemini variants
      'div[aria-label="User message"]',
      'article[data-author="user"]',
      'article[data-turn="user"]',
      '[data-message-author-role="user"]',
      'div[role="listitem"][data-user="true"]',
    ];
    // Compatibility strategy:
    // - Keep explicit user override as highest priority.
    // - Prefer built-in defaults over auto-detected cache, so stale auto cache can self-heal after refresh.
    let candidates = [...defaultCandidates];
    if (userOverride.length) {
      candidates = [userOverride, ...defaultCandidates.filter((s) => s !== userOverride)];
    } else {
      const cached = autoDetected || configured;
      if (cached && !candidates.includes(cached)) candidates.push(cached);
    }
    let firstTurn: Element | null = null;
    let matchedSelector = '';
    const found = await this.waitForAnyElement(candidates, 4000);
    if (found) {
      firstTurn = found.element;
      matchedSelector = found.selector;
      this.userTurnSelector = matchedSelector;
    }
    if (!firstTurn) {
      this.conversationContainer =
        (document.querySelector('main') as HTMLElement) || (document.body as HTMLElement);
      this.userTurnSelector = defaultCandidates.join(',');
    } else {
      // Scope selection/observers:
      // - Broad scope (main/body) if:
      //   a) user provided an explicit override, or
      //   b) auto-detected selector suggests Angular-based user query DOM (contains 'user-query')
      // - Otherwise, scope to the immediate parent for performance
      const looksAngularUserQuery = /user-query/i.test(matchedSelector || '');
      if ((userOverride && matchedSelector === userOverride) || looksAngularUserQuery) {
        this.conversationContainer =
          (document.querySelector('main') as HTMLElement) || (document.body as HTMLElement);
      } else {
        const parent = firstTurn.parentElement as HTMLElement | null;
        if (!parent) return false;
        this.conversationContainer = parent;
      }
      // Persist auto-detected selector for future sessions when no explicit user override exists
      if (!userOverride && matchedSelector) {
        try {
          localStorage.setItem('geminiTimelineUserTurnSelectorAuto', matchedSelector);
        } catch {}
      }
      // If a stale user override failed (matchedSelector differs), clear it so we don't keep retrying it
      if (userOverride && matchedSelector && matchedSelector !== userOverride) {
        try {
          localStorage.removeItem('geminiTimelineUserTurnSelector');
        } catch {}
      }
    }
    let p: HTMLElement | null = (firstTurn as HTMLElement) || this.conversationContainer;
    while (p && p !== document.body) {
      const st = getComputedStyle(p);
      if (st.overflowY === 'auto' || st.overflowY === 'scroll') {
        this.scrollContainer = p;
        break;
      }
      p = p.parentElement;
    }
    if (!this.scrollContainer)
      this.scrollContainer =
        (document.scrollingElement as HTMLElement) ||
        document.documentElement ||
        (document.body as unknown as HTMLElement);
    return true;
  }

  private getConfiguredUserTurnSelector(): string {
    try {
      const user = localStorage.getItem('geminiTimelineUserTurnSelector');
      if (user && typeof user === 'string') return user;
      const auto = localStorage.getItem('geminiTimelineUserTurnSelectorAuto');
      return auto && typeof auto === 'string' ? auto : '';
    } catch {
      return '';
    }
  }

  private injectTimelineUI(): void {
    let bar = document.querySelector('.gemini-timeline-bar') as HTMLElement | null;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'gemini-timeline-bar';
      document.body.appendChild(bar);
    }
    this.ui.timelineBar = bar;
    let track = bar.querySelector('.timeline-track') as HTMLElement | null;
    if (!track) {
      track = document.createElement('div');
      track.className = 'timeline-track';
      bar.appendChild(track);
    }
    let content = track.querySelector('.timeline-track-content') as HTMLElement | null;
    if (!content) {
      content = document.createElement('div');
      content.className = 'timeline-track-content';
      track.appendChild(content);
    }
    this.ui.track = track;
    this.ui.trackContent = content;

    let slider = document.querySelector('.timeline-left-slider') as HTMLElement | null;
    if (!slider) {
      slider = document.createElement('div');
      slider.className = 'timeline-left-slider';
      const handle = document.createElement('div');
      handle.className = 'timeline-left-handle';
      slider.appendChild(handle);
      document.body.appendChild(slider);
    }
    this.ui.slider = slider;
    this.ui.sliderHandle = slider.querySelector('.timeline-left-handle') as HTMLElement | null;

    if (!this.ui.tooltip) {
      const tip = document.createElement('div');
      tip.className = 'timeline-tooltip';
      tip.id = 'gemini-timeline-tooltip';
      document.body.appendChild(tip);
      this.ui.tooltip = tip;
      if (!this.measureEl) {
        const m = document.createElement('div');
        m.setAttribute('aria-hidden', 'true');
        Object.assign(m.style, {
          position: 'fixed',
          left: '-9999px',
          top: '0',
          visibility: 'hidden',
          pointerEvents: 'none',
        });
        const cs = getComputedStyle(tip);
        Object.assign(m.style, {
          backgroundColor: cs.backgroundColor,
          color: cs.color,
          fontFamily: cs.fontFamily,
          fontSize: cs.fontSize,
          lineHeight: cs.lineHeight,
          padding: cs.padding,
          border: cs.border,
          borderRadius: cs.borderRadius,
          whiteSpace: 'normal',
          wordBreak: 'break-word',
          maxWidth: 'none',
          display: 'block',
        });
        document.body.appendChild(m);
        this.measureEl = m;
      }
      if (!this.measureCanvas) {
        this.measureCanvas = document.createElement('canvas');
        this.measureCtx = this.measureCanvas.getContext('2d');
      }
    }

    // Preview panel
    if (!this.previewPanel && this.ui.timelineBar) {
      this.previewPanel = new TimelinePreviewPanel(this.ui.timelineBar);
      this.previewPanel.init(
        (turnId, index) => {
          const marker = this.markers[index];
          if (!marker?.element) return;
          const fromIdx = this.getActiveIndex();
          const dur = this.computeFlowDuration(fromIdx, index);
          if (this.scrollMode === 'flow' && fromIdx >= 0 && index >= 0 && fromIdx !== index) {
            this.activeTurnId = null;
            this.updateActiveDotUI();
            this.startRunner(fromIdx, index, dur);
          }
          this.smoothScrollTo(marker.element, dur);
        },
        (query) => this.highlightSearchInDOM(query),
      );
    }
  }

  private updateIntersectionObserverTargets(): void {
    if (!this.intersectionObserver || !this.conversationContainer || !this.userTurnSelector) return;
    this.intersectionObserver.disconnect();
    this.visibleUserTurns.clear();
    const nodeList = this.conversationContainer.querySelectorAll(this.userTurnSelector);
    const topLevel = this.filterTopLevel(Array.from(nodeList));
    topLevel.forEach((el) => this.intersectionObserver!.observe(el));
  }

  private normalizeText(text: string | null): string {
    try {
      if (!text) return '';
      // 1. Collapse whitespace
      const collapsed = String(text).replace(/\s+/g, ' ').trim();
      // 2. Strip prefixes (You said, etc.)
      return collapsed.replace(TURN_LABEL_PREFIXES, '');
    } catch {
      return '';
    }
  }

  private hasVisuallyHiddenClass(el: Element): boolean {
    if (!(el instanceof HTMLElement) || el.classList.length === 0) return false;
    for (const cls of el.classList) {
      if (cls.toLowerCase().includes(VISUALLY_HIDDEN_CLASS_FRAGMENT)) return true;
    }
    return false;
  }

  private extractTurnText(element: HTMLElement | null): string {
    if (!element) return '';
    try {
      if (!this.hasVisuallyHiddenClass(element)) {
        const descendants = element.getElementsByTagName('*');
        let containsVisuallyHiddenDescendant = false;
        for (let i = 0; i < descendants.length; i++) {
          if (this.hasVisuallyHiddenClass(descendants[i])) {
            containsVisuallyHiddenDescendant = true;
            break;
          }
        }
        if (!containsVisuallyHiddenDescendant) {
          return this.normalizeText(element.textContent || '');
        }
      } else {
        return '';
      }

      const clone = element.cloneNode(true) as HTMLElement;
      if (this.hasVisuallyHiddenClass(clone)) return '';
      const descendants = clone.getElementsByTagName('*');
      for (let i = descendants.length - 1; i >= 0; i--) {
        if (this.hasVisuallyHiddenClass(descendants[i])) {
          descendants[i].remove();
        }
      }
      return this.normalizeText(clone.textContent || '');
    } catch {
      return this.normalizeText(element.textContent || '');
    }
  }

  /**
   * Performance-optimized filter to remove nested elements.
   * Sorts elements by depth first, which can prune the search space in the average case.
   * Worst-case complexity: O(n²), but average case is improved over naive implementation.
   */
  private filterTopLevel(elements: Element[]): HTMLElement[] {
    const arr = elements.map((e) => e as HTMLElement);
    if (arr.length === 0) return arr;

    // Use Set for O(1) lookup of descendants
    const descendants = new Set<HTMLElement>();

    // Sort by depth (shallower first) to optimize checking
    const sorted = arr.slice().sort((a, b) => {
      let aDepth = 0,
        bDepth = 0;
      let node: Element | null = a;
      while (node.parentElement) {
        aDepth++;
        node = node.parentElement;
      }
      node = b;
      while (node.parentElement) {
        bDepth++;
        node = node.parentElement;
      }
      return aDepth - bDepth;
    });

    // Only check if element is descendant of earlier elements
    for (let i = 0; i < sorted.length; i++) {
      const el = sorted[i];
      for (let j = 0; j < i; j++) {
        if (sorted[j].contains(el)) {
          descendants.add(el);
          break;
        }
      }
    }

    return arr.filter((el) => !descendants.has(el));
  }

  /**
   * Performance-optimized deduplication with cached text normalization
   */
  private dedupeByTextAndOffset(elements: HTMLElement[], firstTurnOffset: number): HTMLElement[] {
    const seen = new Set<string>();
    const out: HTMLElement[] = [];

    // Cache normalized text to avoid repeated processing
    const normalizedCache = new Map<HTMLElement, string>();

    for (const el of elements) {
      // Get or compute normalized text
      let normalizedText = normalizedCache.get(el);
      if (normalizedText === undefined) {
        normalizedText = this.extractTurnText(el);
        normalizedCache.set(el, normalizedText);
      }

      const offsetFromStart = (el.offsetTop || 0) - firstTurnOffset;
      const key = `${normalizedText}|${Math.round(offsetFromStart)}`;

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(el);
    }
    return out;
  }

  private getCSSVarNumber(el: Element, name: string, fallback: number): number {
    const v = getComputedStyle(el).getPropertyValue(name).trim();
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fallback;
  }

  private getTrackPadding(): number {
    return this.ui.timelineBar
      ? this.getCSSVarNumber(this.ui.timelineBar, '--timeline-track-padding', 12)
      : 12;
  }
  private getMinGap(): number {
    return this.ui.timelineBar
      ? this.getCSSVarNumber(this.ui.timelineBar, '--timeline-min-gap', 12)
      : 12;
  }

  private ensureTurnId(el: Element, index: number): string {
    const asEl = el as HTMLElement & { dataset?: DOMStringMap & { turnId?: string } };
    let id = asEl.dataset?.turnId || '';
    if (!id) {
      const basis = this.extractTurnText(asEl) || `user-${index}`;
      // Use only content hash (without index) to ensure stable IDs across page refreshes
      // This prevents starred messages from losing their stars when the conversation continues
      id = `u-${hashString(basis)}`;
      try {
        if (asEl.dataset) asEl.dataset.turnId = id;
      } catch {}
    }
    return id;
  }

  private detectCssVarTopSupport(pad: number, usableC: number): boolean {
    try {
      const test = document.createElement('button');
      test.className = 'timeline-dot';
      test.style.visibility = 'hidden';
      test.setAttribute('aria-hidden', 'true');
      test.style.setProperty('--n', '0.5');
      this.ui.trackContent!.appendChild(test);
      const cs = getComputedStyle(test);
      const px = parseFloat(cs.top || '');
      test.remove();
      const expected = pad + 0.5 * usableC;
      return Number.isFinite(px) && Math.abs(px - expected) <= 2;
    } catch {
      return false;
    }
  }

  private updateTimelineGeometry(): void {
    if (!this.ui.timelineBar || !this.ui.trackContent) return;
    const H = this.ui.timelineBar.clientHeight || 0;
    const pad = this.getTrackPadding();
    const minGap = this.getMinGap();
    const N = this.markers.length;
    // Get hidden markers for collapse feature
    const hiddenIndices = this.getHiddenMarkerIndices();
    const visibleCount = N - hiddenIndices.size;
    const desired = Math.max(
      H,
      visibleCount > 0 ? 2 * pad + Math.max(0, visibleCount - 1) * minGap : H,
    );
    this.contentHeight = Math.ceil(desired);
    this.scale = H > 0 ? this.contentHeight / H : 1;
    this.ui.trackContent.style.height = `${this.contentHeight}px`;

    const usableC = Math.max(1, this.contentHeight - 2 * pad);
    // Calculate Y positions with collapse - using effective baseN for repositioning
    const { desiredY } = this.calculateCollapsedPositions(hiddenIndices, pad, usableC);

    // Apply min gap only to visible markers
    const gapMultipliers: number[] = new Array(N).fill(1.0);
    const adjusted = this.applyMinGapWithHidden(
      desiredY,
      pad,
      pad + usableC,
      minGap,
      hiddenIndices,
      gapMultipliers,
    );
    this.yPositions = adjusted;

    for (let i = 0; i < N; i++) {
      if (hiddenIndices.has(i)) {
        this.markers[i].n = -1;
        continue;
      }
      const top = adjusted[i];
      const n = (top - pad) / usableC;
      this.markers[i].n = Math.max(0, Math.min(1, n));
      const dot = this.markers[i].dotElement;
      if (dot && !this.usePixelTop) {
        dot.style.setProperty('--n', String(this.markers[i].n));
      }
    }
    if (this._cssVarTopSupported === null) {
      this._cssVarTopSupported = this.detectCssVarTopSupport(pad, usableC);
      this.usePixelTop = !this._cssVarTopSupported;
    }
    this.updateSlider();
    const barH = this.ui.timelineBar.clientHeight || 0;
    this.sliderAlwaysVisible = this.contentHeight > barH + 1;
    if (this.sliderAlwaysVisible) this.showSlider();
  }

  /* Apply minimum gap between visible markers, skipping hidden ones */
  private applyMinGapWithHidden(
    positions: number[],
    minTop: number,
    maxTop: number,
    gap: number,
    hiddenIndices: Set<number>,
    gapMultipliers: number[],
  ): number[] {
    const n = positions.length;
    if (n === 0) return positions;

    const out = positions.slice();
    let prevVisibleIdx = -1;
    for (let i = 0; i < n; i++) {
      if (hiddenIndices.has(i)) continue;

      if (prevVisibleIdx === -1) {
        out[i] = Math.max(minTop, Math.min(positions[i], maxTop));
      } else {
        const currentGap = gap * gapMultipliers[i];
        const minAllowed = out[prevVisibleIdx] + currentGap;
        out[i] = Math.max(positions[i], minAllowed);
      }
      prevVisibleIdx = i;
    }
    let lastVisibleIdx = -1;
    for (let i = n - 1; i >= 0; i--) {
      if (!hiddenIndices.has(i)) {
        lastVisibleIdx = i;
        break;
      }
    }

    if (lastVisibleIdx >= 0 && out[lastVisibleIdx] > maxTop) {
      out[lastVisibleIdx] = maxTop;

      let nextVisibleIdx = lastVisibleIdx;
      for (let i = lastVisibleIdx - 1; i >= 0; i--) {
        if (hiddenIndices.has(i)) continue;

        const currentGap = gap * gapMultipliers[nextVisibleIdx];
        const maxAllowed = out[nextVisibleIdx] - currentGap;
        out[i] = Math.min(out[i], maxAllowed);
        nextVisibleIdx = i;
      }
    }

    // Clamp all visible markers
    for (let i = 0; i < n; i++) {
      if (hiddenIndices.has(i)) continue;
      if (out[i] < minTop) out[i] = minTop;
      if (out[i] > maxTop) out[i] = maxTop;
    }

    return out;
  }

  private applyMinGap(positions: number[], minTop: number, maxTop: number, gap: number): number[] {
    const n = positions.length;
    if (n === 0) return positions;
    const out = positions.slice();
    out[0] = Math.max(minTop, Math.min(positions[0], maxTop));
    for (let i = 1; i < n; i++) {
      const minAllowed = out[i - 1] + gap;
      out[i] = Math.max(positions[i], minAllowed);
    }
    if (out[n - 1] > maxTop) {
      out[n - 1] = maxTop;
      for (let i = n - 2; i >= 0; i--) {
        const maxAllowed = out[i + 1] - gap;
        out[i] = Math.min(out[i], maxAllowed);
      }
      if (out[0] < minTop) {
        out[0] = minTop;
        for (let i = 1; i < n; i++) {
          const minAllowed = out[i - 1] + gap;
          out[i] = Math.max(out[i], minAllowed);
        }
      }
    }
    for (let i = 0; i < n; i++) {
      if (out[i] < minTop) out[i] = minTop;
      if (out[i] > maxTop) out[i] = maxTop;
    }
    return out;
  }

  private recalculateAndRenderMarkers = (): void => {
    if (
      !this.conversationContainer ||
      !this.ui.timelineBar ||
      !this.scrollContainer ||
      !this.userTurnSelector
    )
      return;
    const userTurnNodeList = this.conversationContainer.querySelectorAll(this.userTurnSelector);
    this.visibleRange = { start: 0, end: -1 };
    if (userTurnNodeList.length === 0) {
      if (!this.zeroTurnsTimer) {
        // Optimized retry interval: reduced from 350ms to 200ms
        this.zeroTurnsTimer = window.setTimeout(() => {
          this.zeroTurnsTimer = null;
          this.recalculateAndRenderMarkers();
        }, 200);
      }
      return;
    }
    if (this.zeroTurnsTimer) {
      clearTimeout(this.zeroTurnsTimer);
      this.zeroTurnsTimer = null;
    }

    // Clear all existing dots before rebuilding
    (this.ui.trackContent || this.ui.timelineBar)!
      .querySelectorAll('.timeline-dot')
      .forEach((n) => n.remove());

    // Filter to top-level matches first to avoid nested duplicates, then dedupe by text+offset
    let allEls = Array.from(userTurnNodeList) as HTMLElement[];
    allEls = this.filterTopLevel(allEls);
    if (allEls.length === 0) return;

    const firstTurnOffset = (allEls[0] as HTMLElement).offsetTop;
    allEls = this.dedupeByTextAndOffset(allEls, firstTurnOffset);
    this.markerTops = this.computeElementTopsInScrollContainer(allEls);

    let contentSpan: number;
    if (allEls.length < 2) {
      contentSpan = 1;
    } else {
      const lastTurnOffset = (allEls[allEls.length - 1] as HTMLElement).offsetTop;
      contentSpan = lastTurnOffset - firstTurnOffset;
    }
    if (contentSpan <= 0) contentSpan = 1;
    this.firstUserTurnOffset = firstTurnOffset;
    this.contentSpanPx = contentSpan;

    this.markerMap.clear();
    this.markers = Array.from(allEls).map((el, idx) => {
      const element = el as HTMLElement;
      const offsetFromStart = element.offsetTop - firstTurnOffset;
      let n = offsetFromStart / contentSpan;
      n = Math.max(0, Math.min(1, n));
      const id = this.ensureTurnId(element, idx);
      const m = {
        id,
        element,
        summary: this.extractTurnText(element),
        n,
        baseN: n,
        dotElement: null,
        starred: this.starred.has(id),
      };
      this.markerMap.set(id, m);
      return m;
    });
    this.markersVersion++;
    this.updateTimelineGeometry();
    if (!this.activeTurnId && this.markers.length > 0)
      this.activeTurnId = this.markers[this.markers.length - 1].id;
    this.updateIntersectionObserverTargetsFromMarkers();
    this.syncTimelineTrackToMain();
    this.updateVirtualRangeAndRender();
    this.updateActiveDotUI();
    this.scheduleScrollSync();
    this.previewPanel?.updateMarkers(
      this.markers.map((m, i) => ({ id: m.id, summary: m.summary, index: i, starred: m.starred })),
    );
  };

  private setupObservers(): void {
    this.mutationObserver = new MutationObserver(() => {
      this.debouncedRecalc();
    });
    if (this.conversationContainer)
      this.mutationObserver.observe(this.conversationContainer, { childList: true, subtree: true });

    this.resizeObserver = new ResizeObserver(() => {
      this.updateTimelineGeometry();
      this.syncTimelineTrackToMain();
      this.updateVirtualRangeAndRender();
    });
    if (this.ui.timelineBar) this.resizeObserver.observe(this.ui.timelineBar);

    this.intersectionObserver = new IntersectionObserver(
      () => {
        this.scheduleScrollSync();
      },
      { root: this.scrollContainer, threshold: 0.1, rootMargin: '-40% 0px -59% 0px' },
    );
  }

  private setupEventListeners(): void {
    this.onTimelineBarClick = (e: Event) => {
      const dot = (e.target as HTMLElement).closest('.timeline-dot') as DotElement | null;
      if (!dot) return;
      const now = Date.now();
      if (now < (this.suppressClickUntil || 0)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const resolveTargetFromDot = (): { targetElement: HTMLElement | null; toIdx: number } => {
        // Use index lookup if available for robust handling of duplicate content
        const indexStr = dot.dataset.markerIndex;
        let targetElement: HTMLElement | null = null;
        let toIdx = -1;

        if (indexStr) {
          toIdx = parseInt(indexStr, 10);
          const marker = this.markers[toIdx];
          if (marker) {
            targetElement = marker.element;
          }
        }

        // Fallback to ID-based lookup if index fails
        if (!targetElement) {
          const targetId = dot.dataset.targetTurnId || '';
          if (!targetId) return { targetElement: null, toIdx: -1 };

          targetElement =
            (this.conversationContainer?.querySelector(
              `[data-turn-id="${targetId}"]`,
            ) as HTMLElement | null) ||
            this.markers.find((m) => m.id === targetId)?.element ||
            null;
          toIdx = this.markers.findIndex((m) => m.id === targetId);
        }

        return { targetElement, toIdx };
      };

      let { targetElement, toIdx } = resolveTargetFromDot();

      // On Gemini reload/rehydration, marker nodes or scroll container may become stale.
      // Refresh once and resolve target again to keep click navigation reliable.
      if (this.maybeRefreshMarkersForInteraction(targetElement)) {
        ({ targetElement, toIdx } = resolveTargetFromDot());
      }

      if (targetElement) {
        const fromIdx = this.getActiveIndex();
        // toIdx is already determined above
        const dur = this.computeFlowDuration(fromIdx, toIdx);
        if (this.scrollMode === 'flow' && fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
          // Clear previous highlight immediately so runner motion is visually obvious.
          this.activeTurnId = null;
          this.updateActiveDotUI();
          this.startRunner(fromIdx, toIdx, dur);
        }
        this.smoothScrollTo(targetElement, dur);
      }
    };
    this.ui.timelineBar!.addEventListener('click', this.onTimelineBarClick);

    this.onScroll = () => this.scheduleScrollSync();
    this.scrollContainer!.addEventListener('scroll', this.onScroll, { passive: true });

    this.onTimelineWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY || 0;
      this.scrollContainer!.scrollTop += delta;
      this.scheduleScrollSync();
      this.showSlider();
    };
    this.ui.timelineBar!.addEventListener('wheel', this.onTimelineWheel, { passive: false });

    this.onTimelineBarOver = (e: MouseEvent) => {
      const dot = (e.target as HTMLElement).closest('.timeline-dot') as DotElement | null;
      if (dot) this.showTooltipForDot(dot);
    };
    this.onTimelineBarOut = (e: MouseEvent) => {
      const fromDot = (e.target as HTMLElement).closest('.timeline-dot');
      const toDot = (e.relatedTarget as HTMLElement | null)?.closest?.('.timeline-dot');
      if (fromDot && !toDot) this.hideTooltip();
    };
    this.ui.timelineBar!.addEventListener('mouseover', this.onTimelineBarOver);
    this.ui.timelineBar!.addEventListener('mouseout', this.onTimelineBarOut);

    // Right-click context menu for level selection
    this.onContextMenu = (ev: MouseEvent) => {
      if (!this.markerLevelEnabled) return;
      const dot = (ev.target as HTMLElement).closest('.timeline-dot') as DotElement | null;
      if (!dot) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.showContextMenu(dot, ev.clientX, ev.clientY);
    };
    this.ui.timelineBar!.addEventListener('contextmenu', this.onContextMenu);

    // Close context menu when clicking elsewhere
    this.onDocumentClick = (ev: MouseEvent) => {
      if (this.contextMenu && !this.contextMenu.contains(ev.target as Node)) {
        this.hideContextMenu();
      }
    };
    document.addEventListener('click', this.onDocumentClick);

    this.onPointerDown = (ev: PointerEvent) => {
      const dot = (ev.target as HTMLElement).closest('.timeline-dot') as DotElement | null;
      if (!dot) return;
      if (typeof ev.button === 'number' && ev.button !== 0) return;
      this.cancelLongPress();
      this.pressTargetDot = dot;
      this.pressStartPos = { x: ev.clientX, y: ev.clientY };
      dot.classList.add('holding');
      this.longPressTriggered = false;
      this.longPressTimer = window.setTimeout(() => {
        this.longPressTimer = null;
        if (!this.pressTargetDot) return;
        const id = this.pressTargetDot.dataset.targetTurnId!;
        this.toggleStar(id);
        this.longPressTriggered = true;
        this.suppressClickUntil = Date.now() + 350;
        this.refreshTooltipForDot(this.pressTargetDot!);
        this.pressTargetDot.classList.remove('holding');
      }, this.longPressDuration);
    };
    this.onPointerMove = (ev: PointerEvent) => {
      if (!this.pressTargetDot || !this.pressStartPos) return;
      const dx = ev.clientX - this.pressStartPos.x;
      const dy = ev.clientY - this.pressStartPos.y;
      if (dx * dx + dy * dy > this.longPressMoveTolerance * this.longPressMoveTolerance)
        this.cancelLongPress();
    };
    this.onPointerUp = () => this.cancelLongPress();
    this.onPointerCancel = () => this.cancelLongPress();
    this.onPointerLeave = (ev: PointerEvent) => {
      const dot = (ev.target as HTMLElement).closest('.timeline-dot') as DotElement | null;
      if (dot && dot === this.pressTargetDot) this.cancelLongPress();
    };
    this.ui.timelineBar!.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
    window.addEventListener('pointercancel', this.onPointerCancel, { passive: true });
    this.ui.timelineBar!.addEventListener('pointerleave', this.onPointerLeave);

    this.onWindowResize = () => {
      if (this.ui.tooltip?.classList.contains('visible')) {
        const activeDot = this.ui.timelineBar!.querySelector(
          '.timeline-dot:hover, .timeline-dot:focus',
        ) as DotElement | null;
        if (activeDot) this.refreshTooltipForDot(activeDot);
      }
      this.updateTimelineGeometry();
      this.syncTimelineTrackToMain();
      this.updateVirtualRangeAndRender();
      // Reapply position for responsive design (v2 format only)
      this.reapplyPosition();
    };
    window.addEventListener('resize', this.onWindowResize);
    if (window.visualViewport) {
      this.onVisualViewportResize = () => {
        this.updateTimelineGeometry();
        this.syncTimelineTrackToMain();
        this.updateVirtualRangeAndRender();
        // Reapply position for responsive design (v2 format only)
        this.reapplyPosition();
      };
      window.visualViewport.addEventListener('resize', this.onVisualViewportResize);
    }

    this.onSliderDown = (ev: PointerEvent) => {
      if (!this.ui.sliderHandle) return;
      try {
        this.ui.sliderHandle.setPointerCapture(ev.pointerId);
      } catch {}
      this.sliderDragging = true;
      this.showSlider();
      this.sliderStartClientY = ev.clientY;
      const rect = this.ui.sliderHandle.getBoundingClientRect();
      this.sliderStartTop = rect.top;
      this.onSliderMove = (e: PointerEvent) => this.handleSliderDrag(e);
      this.onSliderUp = (e: PointerEvent) => this.endSliderDrag(e);
      window.addEventListener('pointermove', this.onSliderMove);
      window.addEventListener('pointerup', this.onSliderUp, { once: true });
    };
    this.ui.sliderHandle?.addEventListener('pointerdown', this.onSliderDown);

    this.onBarEnter = () => this.showSlider();
    this.onBarLeave = () => this.hideSliderDeferred();
    this.onSliderEnter = () => this.showSlider();
    this.onSliderLeave = () => this.hideSliderDeferred();
    this.ui.timelineBar!.addEventListener('pointerenter', this.onBarEnter);
    this.ui.timelineBar!.addEventListener('pointerleave', this.onBarLeave);
    this.ui.slider?.addEventListener('pointerenter', this.onSliderEnter);
    this.ui.slider?.addEventListener('pointerleave', this.onSliderLeave);

    this.onBarPointerDown = (ev: PointerEvent) => {
      if ((ev.target as HTMLElement).closest('.timeline-dot, .timeline-thumb')) {
        return;
      }
      this.barDragging = true;
      this.barStartPos = { x: ev.clientX, y: ev.clientY };
      const rect = this.ui.timelineBar!.getBoundingClientRect();
      this.barStartOffset = { x: rect.left, y: rect.top };
      this.ui.timelineBar!.setPointerCapture(ev.pointerId);
      this.onBarPointerMove = (e: PointerEvent) => this.handleBarDrag(e);
      this.onBarPointerUp = (e: PointerEvent) => this.endBarDrag(e);
      window.addEventListener('pointermove', this.onBarPointerMove);
      window.addEventListener('pointerup', this.onBarPointerUp, { once: true });
    };

    this.onStorage = (e: StorageEvent) => {
      if (!e || e.storageArea !== localStorage) return;
      const expectedKey = this.getStarsStorageKey();
      if (!expectedKey || e.key !== expectedKey) return;
      let nextArr: string[] = [];
      try {
        nextArr = JSON.parse(e.newValue || '[]') || [];
      } catch {
        nextArr = [];
      }
      const nextSet = new Set(nextArr.map(String));
      this.applyStarredIdSet(nextSet, false);
    };
    window.addEventListener('storage', this.onStorage);

    if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      this.onChromeStorageChanged = (changes, areaName) => {
        if (areaName !== 'local') return;
        const starredChange = changes[StorageKeys.TIMELINE_STARRED_MESSAGES];
        if (!starredChange) return;
        this.applySharedStarredData(starredChange.newValue as StarredMessagesData | null);
      };
      chrome.storage.onChanged.addListener(this.onChromeStorageChanged);
    }

    // Subscribe to EventBus for cross-component starred state synchronization
    this.eventBusUnsubscribers.push(
      eventBus.on('starred:removed', ({ conversationId, turnId }) => {
        // Only handle events for current conversation
        if (conversationId !== this.conversationId) return;

        // Update local starred set
        if (this.starred.has(turnId)) {
          this.starred.delete(turnId);
          this.saveStars();

          // Update marker UI
          const marker = this.markerMap.get(turnId);
          if (marker && marker.dotElement) {
            marker.starred = false;
            marker.dotElement.classList.remove('starred');
            marker.dotElement.setAttribute('aria-pressed', 'false');
          }

          console.log('[Timeline] Starred removed via EventBus:', turnId);
        }
      }),
    );

    this.eventBusUnsubscribers.push(
      eventBus.on('starred:added', ({ conversationId, turnId }) => {
        // Only handle events for current conversation
        if (conversationId !== this.conversationId) return;

        // Update local starred set
        if (!this.starred.has(turnId)) {
          this.starred.add(turnId);
          this.saveStars();

          // Update marker UI
          const marker = this.markerMap.get(turnId);
          if (marker && marker.dotElement) {
            marker.starred = true;
            marker.dotElement.classList.add('starred');
            marker.dotElement.setAttribute('aria-pressed', 'true');
          }

          console.log('[Timeline] Starred added via EventBus:', turnId);
        }
      }),
    );
  }

  private smoothScrollTo(targetElement: HTMLElement, duration = 600): void {
    const containerRect = this.scrollContainer!.getBoundingClientRect();
    const targetRect = targetElement.getBoundingClientRect();
    const targetPosition = targetRect.top - containerRect.top + this.scrollContainer!.scrollTop;
    const startPosition = this.scrollContainer!.scrollTop;
    const distance = targetPosition - startPosition;
    let startTime: number | null = null;

    if (this.scrollMode === 'jump') {
      this.scrollContainer!.scrollTop = targetPosition;
      return;
    }
    const animation = (currentTime: number) => {
      this.isScrolling = true;
      if (startTime === null) startTime = currentTime;
      const timeElapsed = currentTime - startTime;
      const run = this.easeInOutQuad(timeElapsed, startPosition, distance, duration);
      this.scrollContainer!.scrollTop = run;
      if (timeElapsed < duration) {
        requestAnimationFrame(animation);
      } else {
        this.scrollContainer!.scrollTop = targetPosition;
        this.isScrolling = false;
      }
    };
    requestAnimationFrame(animation);
  }

  private easeInOutQuad(t: number, b: number, c: number, d: number): number {
    // Overridable via spring profile
    const spring = (() => {
      try {
        return localStorage.getItem('geminiTimelineSpring') || 'ios';
      } catch {
        return 'ios';
      }
    })();
    const clamp = (x: number) => Math.max(0, Math.min(1, x));
    const u = clamp(t / d);
    if (spring === 'snappy') {
      // Ease out back a bit then settle
      const s = 1.15; // overshoot
      const x = u < 0.6 ? u / 0.6 : 1 + (0.6 - u) * 0.15;
      return b + c * clamp(x * s - (s - 1));
    }
    if (spring === 'gentle') {
      // Smooth cubic ease-in-out
      return b + c * (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    }
    // iOS-like spring-ish: ease out with slight acceleration then decel
    const k1 = 0.42,
      k2 = 0.58; // pseudo cubic bezier
    const s = u * u * (3 - 2 * u); // smoothstep baseline
    const mix = (a: number, b: number, m: number) => a + (b - a) * m;
    const shaped = mix(Math.pow(u, k1), Math.pow(u, k2), 0.5) * 0.15 + s * 0.85;
    return b + c * clamp(shaped);
  }

  private updateActiveDotUI(): void {
    this.markers.forEach((marker) => {
      marker.dotElement?.classList.toggle('active', marker.id === this.activeTurnId);
    });
    this.previewPanel?.updateActiveTurn(this.activeTurnId);
  }

  private static readonly SEARCH_HIGHLIGHT_CLASS = 'timeline-search-highlight';

  private clearSearchHighlights(): void {
    const cls = TimelineManager.SEARCH_HIGHLIGHT_CLASS;
    const marks = this.conversationContainer?.querySelectorAll(`mark.${cls}`);
    if (!marks) return;
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize();
    });
  }

  private highlightSearchInDOM(query: string): void {
    this.clearSearchHighlights();
    if (!query || !this.conversationContainer) return;
    const lowerQuery = query.toLowerCase();
    for (const marker of this.markers) {
      if (!marker.element) continue;
      const walker = document.createTreeWalker(marker.element, NodeFilter.SHOW_TEXT);
      const matches: { node: Text; index: number }[] = [];
      let node: Text | null;
      while ((node = walker.nextNode() as Text | null)) {
        const idx = node.textContent?.toLowerCase().indexOf(lowerQuery) ?? -1;
        if (idx !== -1) matches.push({ node, index: idx });
      }
      // Process in reverse to keep offsets stable
      for (let i = matches.length - 1; i >= 0; i--) {
        const { node: textNode, index: matchIdx } = matches[i];
        const after = textNode.splitText(matchIdx + query.length);
        const matchText = textNode.splitText(matchIdx);
        const mark = document.createElement('mark');
        mark.className = TimelineManager.SEARCH_HIGHLIGHT_CLASS;
        mark.textContent = matchText.textContent;
        matchText.parentNode!.replaceChild(mark, matchText);
        // keep reference to 'after' to avoid TS unused warning
        void after;
      }
    }
  }

  /**
   * Optimized debounce delay: reduced from 350ms to 200ms for better responsiveness
   * while still preventing excessive recalculations during rapid DOM changes
   */
  private debouncedRecalc = this.debounce(() => this.recalculateAndRenderMarkers(), 200);

  private debounce<T extends (...args: unknown[]) => void>(func: T, delay: number): T {
    let timeout: number | null = null;
    return ((...args: unknown[]) => {
      if (timeout) clearTimeout(timeout);
      timeout = window.setTimeout(() => func.apply(this, args), delay);
    }) as unknown as T;
  }

  private getActiveIndex(): number {
    if (!this.activeTurnId) return -1;
    return this.markers.findIndex((m) => m.id === this.activeTurnId);
  }

  private getFlowDurationMs(): number {
    try {
      const d = parseInt(localStorage.getItem('geminiTimelineFlowDurationMs') || '650', 10);
      return Math.max(300, Math.min(1800, Number.isFinite(d) ? d : 650));
    } catch {
      return 650;
    }
  }

  private computeFlowDuration(fromIdx: number, toIdx: number): number {
    const base = this.getFlowDurationMs();
    if (fromIdx < 0 || toIdx < 0) return base;
    const span = Math.abs(this.yPositions[toIdx] - this.yPositions[fromIdx]);
    const H = Math.max(1, this.ui.timelineBar?.clientHeight || 1);
    // Scale duration by normalized travel distance inside the bar (bounded)
    const scale = Math.max(0.6, Math.min(1.6, span / H));
    return Math.round(base * scale);
  }

  private ensureRunnerRing(): void {
    if (!this.ui.trackContent) return;
    if (!this.runnerRing) {
      const ring = document.createElement('div');
      ring.className = 'timeline-runner-ring';
      Object.assign(ring.style, {
        position: 'absolute',
        left: '50%',
        width: '20px',
        height: '20px',
        transform: 'translate(-50%, -50%)',
        borderRadius: '9999px',
        boxShadow: '0 0 0 2px var(--timeline-dot-active-color), 0 0 12px rgba(59,130,246,.45)',
        background: 'transparent',
        pointerEvents: 'none',
        zIndex: '4',
        opacity: '0',
        transition: 'opacity 120ms ease',
      } as CSSStyleDeclaration);
      this.ui.trackContent.appendChild(ring);
      this.runnerRing = ring;
    }
  }

  private startRunner(fromIdx: number, toIdx: number, duration: number): void {
    this.ensureRunnerRing();
    if (!this.runnerRing) return;
    const y1 = Math.round(this.yPositions[fromIdx]);
    const y2 = Math.round(this.yPositions[toIdx]);
    const t0 =
      typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
    this.runnerRing.style.opacity = '1';
    const animate = () => {
      const now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const t = Math.min(1, (now - t0) / Math.max(1, duration));
      // Use the same spring shaping as easeInOutQuad override
      const spring = (() => {
        try {
          return localStorage.getItem('geminiTimelineSpring') || 'ios';
        } catch {
          return 'ios';
        }
      })();
      let eased: number;
      if (spring === 'snappy') eased = Math.min(1, t + 0.08 * Math.sin(t * 8));
      else if (spring === 'gentle') eased = t * t * (3 - 2 * t);
      else eased = t * t * (3 - 2 * t) * 0.85 + t * 0.15;
      const y = Math.round(y1 + (y2 - y1) * eased);
      if (this.runnerRing) {
        this.runnerRing.style.top = `${y}px`;
      }
      if (t < 1) {
        this.flowAnimating = true;
        requestAnimationFrame(animate);
      } else {
        this.flowAnimating = false;
        if (this.runnerRing) {
          this.runnerRing.style.opacity = '0';
        }
      }
    };
    animate();
  }

  private truncateToThreeLines(
    text: string,
    targetWidth: number,
  ): { text: string; height: number } {
    if (!this.measureEl || !this.ui.tooltip) return { text, height: 0 };
    const tip = this.ui.tooltip;
    const lineH = this.getCSSVarNumber(tip, '--timeline-tooltip-lh', 18);
    const padY = this.getCSSVarNumber(tip, '--timeline-tooltip-pad-y', 10);
    const borderW = this.getCSSVarNumber(tip, '--timeline-tooltip-border-w', 1);
    const maxH = Math.round(3 * lineH + 2 * padY + 2 * borderW);
    const ell = '…';
    const el = this.measureEl;
    el.style.width = `${Math.max(0, Math.floor(targetWidth))}px`;
    el.textContent = String(text || '')
      .replace(/\s+/g, ' ')
      .trim();
    let h = el.offsetHeight;
    if (h <= maxH) return { text: el.textContent, height: h };
    const raw = el.textContent;
    let lo = 0,
      hi = raw.length,
      ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      el.textContent = raw.slice(0, mid).trimEnd() + ell;
      h = el.offsetHeight;
      if (h <= maxH) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const out = ans >= raw.length ? raw : raw.slice(0, ans).trimEnd() + ell;
    el.textContent = out;
    h = el.offsetHeight;
    return { text: out, height: Math.min(h, maxH) };
  }

  private computePlacementInfo(dot: HTMLElement): { placement: 'left' | 'right'; width: number } {
    const tip = this.ui.tooltip || document.body;
    const dotRect = dot.getBoundingClientRect();
    const vw = window.innerWidth;
    const arrowOut = this.getCSSVarNumber(tip, '--timeline-tooltip-arrow-outside', 6);
    const baseGap = this.getCSSVarNumber(tip, '--timeline-tooltip-gap-visual', 12);
    const boxGap = this.getCSSVarNumber(tip, '--timeline-tooltip-gap-box', 8);
    const gap = baseGap + Math.max(0, arrowOut) + Math.max(0, boxGap);
    const viewportPad = 8;
    const maxW = this.getCSSVarNumber(tip, '--timeline-tooltip-max', 288);
    const minW = 160;
    const leftAvail = Math.max(0, dotRect.left - gap - viewportPad);
    const rightAvail = Math.max(0, vw - dotRect.right - gap - viewportPad);
    let placement: 'left' | 'right' = rightAvail > leftAvail ? 'right' : 'left';
    let avail = placement === 'right' ? rightAvail : leftAvail;
    const tiers = [280, 240, 200, 160];
    const hardMax = Math.max(minW, Math.min(maxW, Math.floor(avail)));
    let width = tiers.find((t) => t <= hardMax) || Math.max(minW, Math.min(hardMax, 160));
    if (width < minW && placement === 'left' && rightAvail > leftAvail) {
      placement = 'right';
      avail = rightAvail;
      const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
      width = tiers.find((t) => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
    } else if (width < minW && placement === 'right' && leftAvail >= rightAvail) {
      placement = 'left';
      avail = leftAvail;
      const hardMax2 = Math.max(minW, Math.min(maxW, Math.floor(avail)));
      width = tiers.find((t) => t <= hardMax2) || Math.max(120, Math.min(hardMax2, minW));
    }
    width = Math.max(120, Math.min(width, maxW));
    return { placement, width };
  }

  private showTooltipForDot(dot: DotElement): void {
    if (!this.ui.tooltip) return;
    if (this.previewPanel?.isOpen) return;
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    const tip = this.ui.tooltip;
    tip.classList.remove('visible');
    let fullText = (dot.getAttribute('aria-label') || '').trim();
    const id = dot.dataset.targetTurnId!;
    if (id && this.starred.has(id)) fullText = `★ ${fullText}`;
    const p = this.computePlacementInfo(dot);
    const layout = this.truncateToThreeLines(fullText, p.width);
    tip.textContent = layout.text;
    this.placeTooltipAt(dot, p.placement, p.width, layout.height);
    tip.setAttribute('aria-hidden', 'false');
    if (this.showRafId !== null) {
      cancelAnimationFrame(this.showRafId);
      this.showRafId = null;
    }
    this.showRafId = requestAnimationFrame(() => {
      this.showRafId = null;
      tip.classList.add('visible');
    });
  }

  private placeTooltipAt(
    dot: HTMLElement,
    placement: 'left' | 'right',
    width: number,
    height: number,
  ): void {
    if (!this.ui.tooltip) return;
    const tip = this.ui.tooltip;
    const dotRect = dot.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const arrowOut = this.getCSSVarNumber(tip, '--timeline-tooltip-arrow-outside', 6);
    const baseGap = this.getCSSVarNumber(tip, '--timeline-tooltip-gap-visual', 12);
    const boxGap = this.getCSSVarNumber(tip, '--timeline-tooltip-gap-box', 8);
    const gap = baseGap + Math.max(0, arrowOut) + Math.max(0, boxGap);
    const viewportPad = 8;
    let left: number;
    if (placement === 'left') {
      left = Math.round(dotRect.left - gap - width);
      if (left < viewportPad) {
        const altLeft = Math.round(dotRect.right + gap);
        if (altLeft + width <= vw - viewportPad) {
          placement = 'right';
          left = altLeft;
        } else {
          const fitWidth = Math.max(120, vw - viewportPad - altLeft);
          left = altLeft;
          width = fitWidth;
        }
      }
    } else {
      left = Math.round(dotRect.right + gap);
      if (left + width > vw - viewportPad) {
        const altLeft = Math.round(dotRect.left - gap - width);
        if (altLeft >= viewportPad) {
          placement = 'left';
          left = altLeft;
        } else {
          const fitWidth = Math.max(120, vw - viewportPad - left);
          width = fitWidth;
        }
      }
    }
    // Set width first, let height auto-size to text
    tip.style.width = `${Math.floor(width)}px`;
    // If height not provided, measure after width + content set
    const autoH = !height || height <= 0 ? tip.offsetHeight : height;
    let top = Math.round(dotRect.top + dotRect.height / 2 - autoH / 2);
    top = Math.max(viewportPad, Math.min(vh - height - viewportPad, top));
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.setAttribute('data-placement', placement);
  }

  private refreshTooltipForDot(dot: DotElement): void {
    if (!this.ui.tooltip) return;
    const tip = this.ui.tooltip;
    if (!tip.classList.contains('visible')) return;
    let fullText = (dot.getAttribute('aria-label') || '').trim();
    const id = dot.dataset.targetTurnId!;
    if (id && this.starred.has(id)) fullText = `★ ${fullText}`;
    const p = this.computePlacementInfo(dot);
    const layout = this.truncateToThreeLines(fullText, p.width);
    tip.textContent = layout.text;
    this.placeTooltipAt(dot, p.placement, p.width, layout.height);
  }

  private scheduleScrollSync(): void {
    if (this.scrollRafId !== null) return;
    this.scrollRafId = requestAnimationFrame(() => {
      this.scrollRafId = null;
      this.syncTimelineTrackToMain();
      this.updateVirtualRangeAndRender();
      this.computeActiveByScroll();
      this.updateSlider();
    });
  }

  private computeActiveByScroll(): void {
    if (this.isScrolling || !this.scrollContainer || this.markers.length === 0) return;
    const scrollTop = this.scrollContainer.scrollTop;
    const ref = scrollTop + this.scrollContainer.clientHeight * 0.45;
    let activeId = this.markers[0].id;

    if (this.markerTops.length === this.markers.length && this.markerTops.length > 0) {
      const idx = Math.max(
        0,
        Math.min(this.markers.length - 1, this.upperBound(this.markerTops, ref)),
      );
      activeId = this.markers[idx].id;
    } else {
      const containerRect = this.scrollContainer.getBoundingClientRect();
      for (let i = 0; i < this.markers.length; i++) {
        const m = this.markers[i];
        const top = m.element.getBoundingClientRect().top - containerRect.top + scrollTop;
        if (top <= ref) activeId = m.id;
        else break;
      }
    }
    if (this.activeTurnId !== activeId) {
      const now =
        typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now();
      const since = now - this.lastActiveChangeTime;
      if (since < this.minActiveChangeInterval) {
        this.pendingActiveId = activeId;
        if (!this.activeChangeTimer) {
          const delay = Math.max(this.minActiveChangeInterval - since, 0);
          this.activeChangeTimer = window.setTimeout(() => {
            this.activeChangeTimer = null;
            if (this.pendingActiveId && this.pendingActiveId !== this.activeTurnId) {
              this.activeTurnId = this.pendingActiveId;
              this.updateActiveDotUI();
              this.lastActiveChangeTime =
                typeof performance !== 'undefined' && performance.now
                  ? performance.now()
                  : Date.now();
            }
            this.pendingActiveId = null;
          }, delay);
        }
      } else {
        this.activeTurnId = activeId;
        this.updateActiveDotUI();
        this.lastActiveChangeTime = now;
      }
    }
  }

  private syncTimelineTrackToMain(): void {
    if (this.sliderDragging) return;
    if (!this.ui.track || !this.scrollContainer || !this.contentHeight) return;
    const scrollTop = this.scrollContainer.scrollTop;
    const ref = scrollTop + this.scrollContainer.clientHeight * 0.45;
    const span = Math.max(1, this.contentSpanPx || 1);
    const r = Math.max(0, Math.min(1, (ref - (this.firstUserTurnOffset || 0)) / span));
    const maxScroll = Math.max(0, this.contentHeight - (this.ui.track.clientHeight || 0));
    const target = Math.round(r * maxScroll);
    if (Math.abs((this.ui.track.scrollTop || 0) - target) > 1) this.ui.track.scrollTop = target;
  }

  private lowerBound(arr: number[], x: number): number {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  private upperBound(arr: number[], x: number): number {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (arr[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo - 1;
  }

  private updateVirtualRangeAndRender(): void {
    const localVersion = this.markersVersion;
    if (!this.ui.track || !this.ui.trackContent || this.markers.length === 0) return;
    const st = this.ui.track.scrollTop || 0;
    const vh = this.ui.track.clientHeight || 0;
    const buffer = Math.max(100, vh);
    const minY = st - buffer;
    const maxY = st + vh + buffer;
    const start = this.lowerBound(this.yPositions, minY);
    const end = Math.max(start - 1, this.upperBound(this.yPositions, maxY));

    const hiddenIndices = this.getHiddenMarkerIndices();

    let prevStart = this.visibleRange.start;
    let prevEnd = this.visibleRange.end;
    const len = this.markers.length;
    if (len > 0) {
      prevStart = Math.max(0, Math.min(prevStart, len - 1));
      prevEnd = Math.max(-1, Math.min(prevEnd, len - 1));
    }
    if (prevEnd >= prevStart) {
      for (let i = prevStart; i < Math.min(start, prevEnd + 1); i++) {
        const m = this.markers[i];
        if (m && m.dotElement) {
          m.dotElement.remove();
          m.dotElement = null;
        }
      }
      for (let i = Math.max(end + 1, prevStart); i <= prevEnd; i++) {
        const m = this.markers[i];
        if (m && m.dotElement) {
          m.dotElement.remove();
          m.dotElement = null;
        }
      }
    } else {
      // Clear all dots and reset references
      (this.ui.trackContent || this.ui.timelineBar)!
        .querySelectorAll('.timeline-dot')
        .forEach((n) => n.remove());
      this.markers.forEach((m) => {
        m.dotElement = null;
      });
    }

    const frag = document.createDocumentFragment();
    for (let i = start; i <= end; i++) {
      const marker = this.markers[i];
      if (!marker) continue;

      if (hiddenIndices.has(i)) {
        if (marker.dotElement) {
          marker.dotElement.remove();
          marker.dotElement = null;
        }
        continue;
      }

      const isCollapsed = this.isMarkerCollapsed(marker.id);

      if (!marker.dotElement) {
        const dot = document.createElement('button') as DotElement;
        dot.className = 'timeline-dot';
        dot.dataset.targetTurnId = marker.id;
        dot.dataset.markerIndex = String(i);
        dot.setAttribute('aria-label', marker.summary);
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('aria-describedby', 'gemini-timeline-tooltip');
        dot.style.setProperty('--n', String(marker.n || 0));
        if (this.usePixelTop) dot.style.top = `${Math.round(this.yPositions[i])}px`;
        dot.classList.toggle('active', marker.id === this.activeTurnId);
        dot.classList.toggle('starred', !!marker.starred);
        dot.classList.toggle('collapsed', isCollapsed);
        dot.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
        dot.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        // Apply marker level
        const level = this.getMarkerLevel(marker.id);
        dot.setAttribute('data-level', String(level));
        marker.dotElement = dot;
        frag.appendChild(dot);
      } else {
        marker.dotElement.dataset.markerIndex = String(i);
        marker.dotElement.style.setProperty('--n', String(marker.n || 0));
        if (this.usePixelTop) marker.dotElement.style.top = `${Math.round(this.yPositions[i])}px`;
        marker.dotElement.classList.toggle('starred', !!marker.starred);
        marker.dotElement.classList.toggle('collapsed', isCollapsed);
        marker.dotElement.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
        marker.dotElement.setAttribute('aria-expanded', isCollapsed ? 'false' : 'true');
        // Apply marker level
        const level = this.getMarkerLevel(marker.id);
        marker.dotElement.setAttribute('data-level', String(level));
      }
    }
    if (localVersion !== this.markersVersion) return;
    if (frag.childNodes.length) this.ui.trackContent.appendChild(frag);
    this.visibleRange = { start, end };
    this.updateSlider();
  }

  private updateSlider(): void {
    if (!this.ui.slider || !this.ui.sliderHandle) return;
    if (!this.contentHeight || !this.ui.timelineBar || !this.ui.track) return;
    const barRect = this.ui.timelineBar.getBoundingClientRect();
    const barH = barRect.height || 0;
    const pad = this.getTrackPadding();
    const innerH = Math.max(0, barH - 2 * pad);
    if (this.contentHeight <= barH + 1 || innerH <= 0) {
      this.sliderAlwaysVisible = false;
      this.ui.slider.classList.remove('visible');
      this.ui.slider.style.opacity = '';
      return;
    }
    this.sliderAlwaysVisible = true;
    const railLen = Math.max(120, Math.min(240, Math.floor(barH * 0.45)));
    const railTop = Math.round(barRect.top + pad + (innerH - railLen) / 2);
    const railLeftGap = 8;
    const sliderWidth = 12;
    const left = Math.round(barRect.left - railLeftGap - sliderWidth);
    this.ui.slider.style.left = `${left}px`;
    this.ui.slider.style.top = `${railTop}px`;
    this.ui.slider.style.height = `${railLen}px`;
    const handleH = 22;
    const maxTop = Math.max(0, railLen - handleH);
    const range = Math.max(1, this.contentHeight - barH);
    const st = this.ui.track.scrollTop || 0;
    const r = Math.max(0, Math.min(1, st / range));
    const top = Math.round(r * maxTop);
    this.ui.sliderHandle.style.height = `${handleH}px`;
    this.ui.sliderHandle.style.top = `${top}px`;
    this.ui.slider.classList.add('visible');
    this.ui.slider.style.opacity = '';
  }

  private showSlider(): void {
    if (!this.ui.slider) return;
    this.ui.slider.classList.add('visible');
    if (this.sliderFadeTimer) {
      clearTimeout(this.sliderFadeTimer);
      this.sliderFadeTimer = null;
    }
    this.updateSlider();
  }

  private hideSliderDeferred(): void {
    if (this.sliderDragging || this.sliderAlwaysVisible) return;
    if (this.sliderFadeTimer) clearTimeout(this.sliderFadeTimer);
    this.sliderFadeTimer = window.setTimeout(() => {
      this.sliderFadeTimer = null;
      this.ui.slider?.classList.remove('visible');
    }, this.sliderFadeDelay);
  }

  private handleSliderDrag(e: PointerEvent): void {
    if (!this.sliderDragging || !this.ui.timelineBar || !this.ui.track) return;
    const barRect = this.ui.timelineBar.getBoundingClientRect();
    const barH = barRect.height || 0;
    const railLen =
      parseFloat(this.ui.slider!.style.height || '0') ||
      Math.max(120, Math.min(240, Math.floor(barH * 0.45)));
    const handleH = this.ui.sliderHandle!.getBoundingClientRect().height || 22;
    const maxTop = Math.max(0, railLen - handleH);
    const delta = e.clientY - this.sliderStartClientY;
    let top = Math.max(
      0,
      Math.min(maxTop, this.sliderStartTop + delta - (parseFloat(this.ui.slider!.style.top) || 0)),
    );
    const r = maxTop > 0 ? top / maxTop : 0;
    const range = Math.max(1, this.contentHeight - barH);
    this.ui.track.scrollTop = Math.round(r * range);
    this.updateVirtualRangeAndRender();
    this.showSlider();
    this.updateSlider();
  }

  private endSliderDrag(_e: PointerEvent): void {
    this.sliderDragging = false;
    try {
      window.removeEventListener('pointermove', this.onSliderMove!);
    } catch {}
    this.onSliderMove = null;
    this.onSliderUp = null;
    this.hideSliderDeferred();
  }

  private toggleDraggable(enabled: boolean): void {
    this.draggable = enabled;
    // Guard against null timelineBar or onBarPointerDown (can happen if storage listener fires before UI init or after cleanup)
    if (!this.ui.timelineBar || !this.onBarPointerDown) return;
    if (this.draggable) {
      this.ui.timelineBar.addEventListener('pointerdown', this.onBarPointerDown);
      this.ui.timelineBar.style.cursor = 'move';
    } else {
      this.ui.timelineBar.removeEventListener('pointerdown', this.onBarPointerDown);
      this.ui.timelineBar.style.cursor = 'default';
    }
  }

  private toggleMarkerLevel(enabled: boolean): void {
    this.markerLevelEnabled = enabled;
    // Hide context menu when feature is disabled
    if (!enabled) {
      this.hideContextMenu();
    }
    // Trigger re-layout to show/hide collapsed states
    this.updateTimelineGeometry();
    this.updateVirtualRangeAndRender();
  }

  private handleBarDrag(e: PointerEvent): void {
    if (!this.barDragging) return;
    const dx = e.clientX - this.barStartPos.x;
    const dy = e.clientY - this.barStartPos.y;
    this.ui.timelineBar!.style.left = `${this.barStartOffset.x + dx}px`;
    this.ui.timelineBar!.style.top = `${this.barStartOffset.y + dy}px`;
  }

  private endBarDrag(_e: PointerEvent): void {
    this.barDragging = false;
    this.savePosition();
    window.removeEventListener('pointermove', this.onBarPointerMove!);
  }

  private savePosition(): void {
    if (!this.ui.timelineBar) return;
    const rect = this.ui.timelineBar.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Save position as percentage of viewport for responsive design
    const position = {
      version: 2,
      topPercent: (rect.top / viewportHeight) * 100,
      leftPercent: (rect.left / viewportWidth) * 100,
    };

    const g = globalThis as ExtGlobal;
    if (g.chrome?.storage?.sync?.set) {
      g.chrome.storage.sync.set({ geminiTimelinePosition: position });
    } else if (g.browser?.storage?.sync?.set) {
      g.browser.storage.sync.set({ geminiTimelinePosition: position });
    }
  }

  /**
   * Apply position with boundary checks to keep timeline visible
   */
  private applyPosition(top: number, left: number): void {
    if (!this.ui.timelineBar) return;

    const barWidth = this.ui.timelineBar.offsetWidth || 24; // fallback to default width
    const barHeight = this.ui.timelineBar.offsetHeight || 100;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // Clamp to viewport bounds (with small padding)
    const padding = 10;
    const clampedTop = Math.max(padding, Math.min(top, viewportHeight - barHeight - padding));
    const clampedLeft = Math.max(padding, Math.min(left, viewportWidth - barWidth - padding));

    this.ui.timelineBar.style.top = `${clampedTop}px`;
    this.ui.timelineBar.style.left = `${clampedLeft}px`;
  }

  /**
   * Reapply position from storage (for window resize)
   */
  private async reapplyPosition(): Promise<void> {
    if (!this.ui.timelineBar) return;

    const g = globalThis as ExtGlobal;
    if (!g.chrome?.storage?.sync && !g.browser?.storage?.sync) return;

    let res: Record<string, unknown> | null = null;
    try {
      res = await new Promise((resolve) => {
        if (g.chrome?.storage?.sync?.get) {
          g.chrome.storage.sync.get(
            { geminiTimelinePosition: null },
            (items: Record<string, unknown>) => {
              if (g.chrome.runtime?.lastError) {
                console.error(
                  `[Timeline] chrome.storage.get failed: ${g.chrome.runtime.lastError.message}`,
                );
                resolve(null);
              } else {
                resolve(items);
              }
            },
          );
        } else {
          g.browser?.storage?.sync
            ?.get({ geminiTimelinePosition: null })
            .then(resolve)
            .catch((error: Error) => {
              console.error(`[Timeline] browser.storage.get failed: ${error.message}`);
              resolve(null);
            });
        }
      });
    } catch (error) {
      console.error('[Timeline] reapplyPosition storage access failed:', error);
      return;
    }

    const position = res?.geminiTimelinePosition as
      | { version?: number; topPercent?: number; leftPercent?: number; top?: number; left?: number }
      | undefined;
    if (!position) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    // v2 format: use percentage (responsive)
    if (
      position.version === 2 &&
      position.topPercent !== undefined &&
      position.leftPercent !== undefined
    ) {
      const top = (position.topPercent / 100) * viewportHeight;
      const left = (position.leftPercent / 100) * viewportWidth;
      this.applyPosition(top, left);
    }
    // v1 format: keep absolute position (no resize adjustment for legacy)
    else if (position.top !== undefined && position.left !== undefined) {
      this.applyPosition(position.top, position.left);
    }
  }

  private hideTooltip(immediate = false): void {
    if (!this.ui.tooltip) return;
    const doHide = () => {
      this.ui.tooltip!.classList.remove('visible');
      this.ui.tooltip!.setAttribute('aria-hidden', 'true');
      this.tooltipHideTimer = null;
    };
    if (immediate) return doHide();
    if (this.tooltipHideTimer) clearTimeout(this.tooltipHideTimer);
    this.tooltipHideTimer = window.setTimeout(doHide, this.tooltipHideDelay);
  }

  private async toggleStar(turnId: string): Promise<void> {
    const id = String(turnId || '');
    if (!id) return;

    const wasStarred = this.starred.has(id);

    if (wasStarred) {
      this.starred.delete(id);
    } else {
      this.starred.add(id);
    }

    this.saveStars();

    // Update global starred messages service
    if (wasStarred) {
      // Remove from global storage
      await StarredMessagesService.removeStarredMessage(this.conversationId!, id);
    } else {
      // Add to global storage with full message info
      const m = this.markerMap.get(id);
      if (m) {
        const conversationTitle = this.getConversationTitle();
        const message: StarredMessage = {
          turnId: id,
          content: m.summary,
          conversationId: this.conversationId!,
          conversationUrl: window.location.href,
          conversationTitle,
          starredAt: Date.now(),
        };
        await StarredMessagesService.addStarredMessage(message);
      }
    }

    // Update UI for ALL markers with this ID (handle duplicates)
    const isStarredNow = this.starred.has(id);
    this.markers.forEach((m) => {
      if (m.id === id) {
        m.starred = isStarredNow;
        if (m.dotElement) {
          m.dotElement.classList.toggle('starred', isStarredNow);
          m.dotElement.setAttribute('aria-pressed', isStarredNow ? 'true' : 'false');
          // Only refresh tooltip if this specific dot is actively hovered/focused
          // (checked internally by refreshTooltipForDot)
          this.refreshTooltipForDot(m.dotElement);
        }
      }
    });
  }

  /**
   * Save starred messages to localStorage using DRY helper
   */
  private saveStars(): void {
    const key = this.getStarsStorageKey();
    if (!key) return;
    this.safeLocalStorageSet(key, JSON.stringify(Array.from(this.starred)));
  }

  /**
   * Load starred messages from localStorage using DRY helper
   */
  private async loadStars(): Promise<void> {
    this.starred.clear();
    const key = this.getStarsStorageKey();
    if (!key) return;

    const raw = this.safeLocalStorageGet(key);
    if (!raw) return;

    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((id: unknown) => this.starred.add(String(id)));
      }
    } catch (error) {
      console.warn('[Timeline] Failed to parse starred messages:', error);
    }
  }

  // ===== Marker Level Methods =====

  private getLevelsStorageKey(): string | null {
    return this.conversationId ? `geminiTimelineLevels:${this.conversationId}` : null;
  }

  /* Load marker levels from localStorage */
  private loadMarkerLevels(): void {
    this.markerLevels.clear();
    const key = this.getLevelsStorageKey();
    if (!key) return;

    const raw = this.safeLocalStorageGet(key);
    if (!raw) return;

    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj === 'object') {
        Object.entries(obj).forEach(([turnId, level]) => {
          if (typeof level === 'number' && level >= 1 && level <= 4) {
            this.markerLevels.set(turnId, level as MarkerLevel);
          }
        });
      }
    } catch (error) {
      console.warn('[Timeline] Failed to parse marker levels:', error);
    }
  }

  /* Save marker levels to localStorage */
  private saveMarkerLevels(): void {
    const key = this.getLevelsStorageKey();
    if (!key) return;

    const obj: Record<string, MarkerLevel> = {};
    this.markerLevels.forEach((level, turnId) => {
      obj[turnId] = level;
    });

    this.safeLocalStorageSet(key, JSON.stringify(obj));
  }

  // ===== Collapsed Markers Methods =====

  private getCollapsedStorageKey(): string | null {
    return this.conversationId ? `geminiTimelineCollapsed:${this.conversationId}` : null;
  }

  private loadCollapsedMarkers(): void {
    this.collapsedMarkers.clear();
    const key = this.getCollapsedStorageKey();
    if (!key) return;

    const raw = this.safeLocalStorageGet(key);
    if (!raw) return;

    try {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) {
        arr.forEach((id: unknown) => this.collapsedMarkers.add(String(id)));
      }
    } catch (error) {
      console.warn('[Timeline] Failed to parse collapsed markers:', error);
    }
  }

  private saveCollapsedMarkers(): void {
    const key = this.getCollapsedStorageKey();
    if (!key) return;
    this.safeLocalStorageSet(key, JSON.stringify(Array.from(this.collapsedMarkers)));
  }

  private isMarkerCollapsed(turnId: string): boolean {
    return this.collapsedMarkers.has(turnId);
  }

  private toggleCollapse(turnId: string): void {
    if (this.collapsedMarkers.has(turnId)) {
      this.collapsedMarkers.delete(turnId);
    } else {
      this.collapsedMarkers.add(turnId);
    }
    this.saveCollapsedMarkers();
    this.updateTimelineGeometry();
    this.updateVirtualRangeAndRender();
  }

  private getHiddenMarkerIndices(): Set<number> {
    const hidden = new Set<number>();

    // If marker level feature is disabled, no markers are hidden
    if (!this.markerLevelEnabled) {
      return hidden;
    }

    for (let i = 0; i < this.markers.length; i++) {
      // Skip markers that are already hidden by a parent collapse
      if (hidden.has(i)) continue;

      const marker = this.markers[i];
      const level = this.getMarkerLevel(marker.id);

      // If this marker is collapsed, hide all subsequent lower-level markers
      if (this.collapsedMarkers.has(marker.id)) {
        for (let j = i + 1; j < this.markers.length; j++) {
          const nextMarker = this.markers[j];
          const nextLevel = this.getMarkerLevel(nextMarker.id);

          // Stop when we reach a marker of same or higher level (lower number)
          if (nextLevel <= level) {
            break;
          }

          // Hide this marker (only direct descendants of this collapsed parent)
          hidden.add(j);
        }
      }
    }

    return hidden;
  }

  private calculateEffectiveBaseN(markerIndex: number, _hiddenIndices: Set<number>): number {
    const marker = this.markers[markerIndex];
    if (!marker) return 0;

    const baseN = marker.baseN ?? marker.n ?? 0;

    // If this marker is not collapsed, just return its baseN
    if (!this.collapsedMarkers.has(marker.id)) {
      return baseN;
    }

    // Find the range of hidden children
    const level = this.getMarkerLevel(marker.id);
    let childContribution = 0;

    for (let j = markerIndex + 1; j < this.markers.length; j++) {
      const nextMarker = this.markers[j];
      const nextLevel = this.getMarkerLevel(nextMarker.id);

      // Stop when we reach a marker of same or higher level
      if (nextLevel <= level) {
        break;
      }

      // Add half of child's contribution based on level difference
      const childBaseN = nextMarker.baseN ?? nextMarker.n ?? 0;
      const prevBaseN = j > 0 ? (this.markers[j - 1].baseN ?? this.markers[j - 1].n ?? 0) : 0;
      const childLength = childBaseN - prevBaseN;
      const levelDiff = nextLevel - level;
      childContribution += childLength * Math.pow(0.5, levelDiff);
    }

    return baseN + childContribution;
  }

  private calculateCollapsedPositions(
    hiddenIndices: Set<number>,
    pad: number,
    usableC: number,
  ): { desiredY: number[]; effectiveBaseNs: number[] } {
    const N = this.markers.length;
    const desiredY: number[] = new Array(N).fill(-1);
    const effectiveBaseNs: number[] = new Array(N).fill(0);

    // First pass: calculate effective baseN for all visible markers
    const visibleMarkers: { index: number; effectiveN: number }[] = [];

    for (let i = 0; i < N; i++) {
      if (hiddenIndices.has(i)) continue;

      const effectiveN = this.calculateEffectiveBaseN(i, hiddenIndices);
      effectiveBaseNs[i] = effectiveN;
      visibleMarkers.push({ index: i, effectiveN });
    }

    // Sort visible markers by their effective baseN (maintains relative order based on length)
    visibleMarkers.sort((a, b) => a.effectiveN - b.effectiveN);

    // Calculate total effective range
    if (visibleMarkers.length === 0) {
      return { desiredY, effectiveBaseNs };
    }

    const minEffectiveN = visibleMarkers[0].effectiveN;
    const maxEffectiveN = visibleMarkers[visibleMarkers.length - 1].effectiveN;
    const effectiveRange = maxEffectiveN - minEffectiveN;

    // Distribute positions proportionally
    for (const vm of visibleMarkers) {
      let normalizedN: number;
      if (effectiveRange > 0) {
        normalizedN = (vm.effectiveN - minEffectiveN) / effectiveRange;
      } else {
        normalizedN = visibleMarkers.indexOf(vm) / Math.max(1, visibleMarkers.length - 1);
      }

      desiredY[vm.index] = pad + normalizedN * usableC;
    }

    return { desiredY, effectiveBaseNs };
  }

  /**
   * Check if a marker can be collapsed (has lower-level children)
   */
  private canCollapseMarker(turnId: string): boolean {
    const markerIndex = this.markers.findIndex((m) => m.id === turnId);
    if (markerIndex < 0 || markerIndex >= this.markers.length - 1) return false;

    const level = this.getMarkerLevel(turnId);

    const nextMarker = this.markers[markerIndex + 1];
    if (!nextMarker) return false;

    const nextLevel = this.getMarkerLevel(nextMarker.id);
    return nextLevel > level;
  }

  private getMarkerLevel(turnId: string): MarkerLevel {
    return this.markerLevels.get(turnId) || 1;
  }

  private setMarkerLevel(turnId: string, level: MarkerLevel): void {
    if (level === 1) {
      // Level 1 is default, remove from storage to save space
      this.markerLevels.delete(turnId);
    } else {
      this.markerLevels.set(turnId, level);
    }
    this.saveMarkerLevels();

    // Update all dots with this turnId
    this.markers.forEach((marker) => {
      if (marker.id === turnId && marker.dotElement) {
        marker.dotElement.setAttribute('data-level', String(level));
      }
    });
  }

  private showContextMenu(dot: DotElement, x: number, y: number): void {
    this.hideContextMenu();

    const turnId = dot.dataset.targetTurnId;
    if (!turnId) return;

    const currentLevel = this.getMarkerLevel(turnId);
    const isCollapsed = this.isMarkerCollapsed(turnId);
    const canCollapse = this.canCollapseMarker(turnId);

    const menu = document.createElement('div');
    menu.className = 'timeline-context-menu';

    const title = document.createElement('div');
    title.className = 'timeline-context-menu-title';
    title.textContent = getTranslationSync('timelineLevelTitle');
    menu.appendChild(title);

    const levels: { level: MarkerLevel; label: string }[] = [
      { level: 1, label: getTranslationSync('timelineLevel1') },
      { level: 2, label: getTranslationSync('timelineLevel2') },
      { level: 3, label: getTranslationSync('timelineLevel3') },
    ];

    levels.forEach(({ level, label }) => {
      const item = document.createElement('button');
      item.className = 'timeline-context-menu-item';
      if (level === currentLevel) {
        item.classList.add('active');
      }
      item.setAttribute('data-level', String(level));

      const indicator = document.createElement('span');
      indicator.className = 'level-indicator';
      const dotEl = document.createElement('span');
      dotEl.className = 'level-dot';
      indicator.appendChild(dotEl);
      item.appendChild(indicator);

      const labelSpan = document.createElement('span');
      labelSpan.textContent = label;
      item.appendChild(labelSpan);

      if (level === currentLevel) {
        const check = document.createElement('span');
        check.className = 'check-icon';
        check.textContent = '✓';
        item.appendChild(check);
      }

      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.setMarkerLevel(turnId, level);
        this.hideContextMenu();
      });

      menu.appendChild(item);
    });

    if (canCollapse || isCollapsed) {
      // Add separator
      const separator = document.createElement('div');
      separator.className = 'timeline-context-menu-separator';
      menu.appendChild(separator);

      const collapseItem = document.createElement('button');
      collapseItem.className = 'timeline-context-menu-item collapse-item';

      const icon = document.createElement('span');
      icon.className = 'collapse-icon';
      icon.textContent = isCollapsed ? '▶' : '▼';
      collapseItem.appendChild(icon);

      const collapseLabel = document.createElement('span');
      collapseLabel.textContent = isCollapsed
        ? getTranslationSync('timelineExpand')
        : getTranslationSync('timelineCollapse');
      collapseItem.appendChild(collapseLabel);

      collapseItem.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.toggleCollapse(turnId);
        this.hideContextMenu();
      });

      menu.appendChild(collapseItem);
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    document.body.appendChild(menu);
    this.contextMenu = menu;
    const menuWidth = menu.offsetWidth;
    const menuHeight = menu.offsetHeight;

    let left = x;
    let top = y;

    if (left + menuWidth > vw - 10) {
      left = vw - menuWidth - 10;
    }
    if (top + menuHeight > vh - 10) {
      top = vh - menuHeight - 10;
    }

    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    document.body.appendChild(menu);
    this.contextMenu = menu;
  }

  private hideContextMenu(): void {
    if (this.contextMenu) {
      this.contextMenu.remove();
      this.contextMenu = null;
    }
  }

  private cancelLongPress(): void {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    if (this.pressTargetDot) {
      this.pressTargetDot.classList.remove('holding');
    }
    this.pressTargetDot = null;
    this.pressStartPos = null;
    this.longPressTriggered = false;
  }

  /**
   * Initialize keyboard shortcuts for timeline navigation
   */
  private async initKeyboardShortcuts(): Promise<void> {
    try {
      await keyboardShortcutService.init();

      // Register shortcut handler with queue support
      this.shortcutUnsubscribe = keyboardShortcutService.on((action, event) => {
        if (action === 'timeline:previous') {
          this.enqueueNavigation('previous', event.repeat);
        } else if (action === 'timeline:next') {
          this.enqueueNavigation('next', event.repeat);
        }
      });
    } catch (error) {
      console.warn('[Timeline] Failed to initialize keyboard shortcuts:', error);
    }
  }

  /**
   * Enqueue navigation action (supports rapid key presses)
   */
  private enqueueNavigation(direction: 'previous' | 'next', isRepeat: boolean = false): void {
    // Prevent accumulation during long presses
    if (isRepeat && this.navigationQueue.length > 0) {
      return;
    }
    // Limit queue size for rapid tapping as well
    if (this.navigationQueue.length >= 3) {
      return;
    }

    if (!this.canEnqueueNavigation(direction)) {
      return;
    }

    this.navigationQueue.push(direction);
    this.processNavigationQueue();
  }

  private canEnqueueNavigation(direction: 'previous' | 'next'): boolean {
    if (this.markers.length === 0) return false;

    const currentIndex = this.getActiveIndex();
    if (currentIndex < 0) return true;

    const isAtStart = currentIndex === 0;
    const isAtEnd = currentIndex === this.markers.length - 1;

    const isBoundaryBlocked =
      (direction === 'previous' && isAtStart) || (direction === 'next' && isAtEnd);
    if (!isBoundaryBlocked) return true;

    return this.shouldAttemptRefreshForNavigation();
  }

  private shouldAttemptRefreshForNavigation(): boolean {
    if (!this.userTurnSelector) return false;

    const documentCount = document.querySelectorAll(this.userTurnSelector).length;
    const containersDisconnected =
      (this.conversationContainer ? !this.conversationContainer.isConnected : true) ||
      (this.scrollContainer ? !this.scrollContainer.isConnected : true);

    return containersDisconnected || documentCount > this.markers.length;
  }

  private getScrollContainerForElement(element: HTMLElement): HTMLElement {
    let p: HTMLElement | null = element;
    while (p && p !== document.body) {
      const st = getComputedStyle(p);
      if (st.overflowY === 'auto' || st.overflowY === 'scroll') {
        return p;
      }
      p = p.parentElement;
    }

    return (
      (document.scrollingElement as HTMLElement | null) ||
      (document.documentElement as HTMLElement | null) ||
      (document.body as unknown as HTMLElement)
    );
  }

  private shouldRefreshForInteraction(targetElement: HTMLElement | null): boolean {
    if (this.shouldAttemptRefreshForNavigation()) return true;

    if (targetElement && !targetElement.isConnected) return true;

    if (
      targetElement &&
      this.conversationContainer &&
      !this.conversationContainer.contains(targetElement)
    ) {
      return true;
    }

    if (!targetElement || !this.scrollContainer) return false;

    const expectedScrollContainer = this.getScrollContainerForElement(targetElement);
    return expectedScrollContainer !== this.scrollContainer;
  }

  private maybeRefreshMarkersForInteraction(targetElement: HTMLElement | null): boolean {
    if (!this.userTurnSelector) return false;
    if (!this.shouldRefreshForInteraction(targetElement)) return false;

    const refreshed = this.refreshCriticalElementsFromDocument();
    if (!refreshed) return false;

    this.recalculateAndRenderMarkers();
    return true;
  }

  /**
   * Process navigation queue (one at a time)
   */
  private async processNavigationQueue(): Promise<void> {
    if (this.isNavigating || this.navigationQueue.length === 0) return;

    this.isNavigating = true;
    const direction = this.navigationQueue.shift()!;

    if (direction === 'previous') {
      await this.navigateToPreviousNode();
    } else {
      await this.navigateToNextNode();
    }

    this.isNavigating = false;

    // Process next item in queue
    if (this.navigationQueue.length > 0) {
      this.processNavigationQueue();
    }
  }

  /**
   * Perform navigation to a target node
   * Shared logic for previous/next navigation
   */
  private async performNodeNavigation(targetIndex: number, currentIndex: number): Promise<void> {
    const markerBeforeRefresh = this.markers[targetIndex];
    this.maybeRefreshMarkersForInteraction(markerBeforeRefresh?.element || null);

    if (targetIndex < 0 || targetIndex >= this.markers.length) return;

    // Clear any pending scroll updates to prevent interference
    if (this.activeChangeTimer) {
      clearTimeout(this.activeChangeTimer);
      this.activeChangeTimer = null;
      this.pendingActiveId = null;
    }

    const targetMarker = this.markers[targetIndex];
    if (!targetMarker?.element) return;

    if (this.scrollMode === 'flow' && currentIndex >= 0) {
      // Flow mode: animate with queue support
      const duration = this.computeFlowDuration(currentIndex, targetIndex);
      this.startRunner(currentIndex, targetIndex, duration);
      this.smoothScrollTo(targetMarker.element, duration);
      await new Promise<void>((resolve) => setTimeout(resolve, duration));
    } else {
      // Jump mode: instant, no wait
      this.smoothScrollTo(targetMarker.element, 0);
    }

    this.activeTurnId = targetMarker.id;
    this.updateActiveDotUI();
  }

  /**
   * Navigate to previous timeline node (k or custom shortcut)
   */
  private async navigateToPreviousNode(): Promise<void> {
    if (this.markers.length === 0) return;

    this.maybeRefreshMarkersForNavigation('previous');
    const currentIndex = this.getActiveIndex();
    const targetIndex = currentIndex <= 0 ? 0 : currentIndex - 1;

    await this.performNodeNavigation(targetIndex, currentIndex);
  }

  /**
   * Navigate to next timeline node (j or custom shortcut)
   */
  private async navigateToNextNode(): Promise<void> {
    if (this.markers.length === 0) return;

    this.maybeRefreshMarkersForNavigation('next');
    const currentIndex = this.getActiveIndex();
    const targetIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, this.markers.length - 1);

    await this.performNodeNavigation(targetIndex, currentIndex);
  }

  private maybeRefreshMarkersForNavigation(direction: 'previous' | 'next'): void {
    if (!this.userTurnSelector) return;

    const currentIndex = this.getActiveIndex();
    const isAtStart = currentIndex === 0;
    const isAtEnd = currentIndex >= 0 && currentIndex === this.markers.length - 1;

    const shouldAttemptRefresh =
      (direction === 'previous' && isAtStart) || (direction === 'next' && isAtEnd);
    if (!shouldAttemptRefresh) return;

    if (!this.shouldAttemptRefreshForNavigation()) return;

    const refreshed = this.refreshCriticalElementsFromDocument();
    if (!refreshed) return;

    this.recalculateAndRenderMarkers();
  }

  private refreshCriticalElementsFromDocument(): boolean {
    if (!this.userTurnSelector) return false;

    const firstTurn = document.querySelector(this.userTurnSelector) as HTMLElement | null;
    if (!firstTurn) return false;

    const nextConversationContainer =
      (document.querySelector('main') as HTMLElement | null) || (document.body as HTMLElement);
    this.conversationContainer = nextConversationContainer;

    const nextScrollContainer = this.getScrollContainerForElement(firstTurn);

    const scrollContainerChanged = this.scrollContainer !== nextScrollContainer;
    if (scrollContainerChanged) {
      if (this.scrollContainer && this.onScroll) {
        try {
          this.scrollContainer.removeEventListener('scroll', this.onScroll);
        } catch {}
      }
      this.scrollContainer = nextScrollContainer;
      if (this.scrollContainer && this.onScroll) {
        this.scrollContainer.addEventListener('scroll', this.onScroll, { passive: true });
      }
    }

    if (this.mutationObserver && this.conversationContainer) {
      try {
        this.mutationObserver.disconnect();
        this.mutationObserver.observe(this.conversationContainer, {
          childList: true,
          subtree: true,
        });
      } catch {}
    }

    if (this.intersectionObserver && this.scrollContainer) {
      try {
        this.intersectionObserver.disconnect();
        this.intersectionObserver = new IntersectionObserver(
          () => {
            this.scheduleScrollSync();
          },
          { root: this.scrollContainer, threshold: 0.1, rootMargin: '-40% 0px -59% 0px' },
        );
      } catch {}
    }

    return true;
  }

  /**
   * Handle starred message navigation with optimized performance
   * Strategy: Quick check if markers ready, otherwise retry with exponential backoff
   */
  private handleStarredMessageNavigation(): void {
    try {
      const hash = window.location.hash;
      if (!hash.startsWith('#gv-turn-')) return;

      const turnId = hash.replace('#gv-turn-', '');
      if (!turnId) return;

      console.log('[Timeline] Handling starred message navigation, turnId:', turnId);

      let attempts = 0;
      const maxAttempts = 20;

      const checkAndScroll = (): boolean => {
        if (this.markers.length === 0) return false;

        const marker = this.markerMap.get(turnId);
        if (marker && marker.element) {
          console.log('[Timeline] Found target marker, scrolling');

          // Minimal delay for DOM readiness
          setTimeout(() => {
            this.smoothScrollTo(marker.element, 800);

            // Clear hash after scroll completes
            setTimeout(() => {
              window.history.replaceState(
                null,
                '',
                window.location.pathname + window.location.search,
              );
            }, 900);
          }, 100);
          return true;
        }
        return false;
      };

      // Optimized retry logic with exponential backoff
      const retry = () => {
        if (checkAndScroll()) return;

        attempts++;
        if (attempts >= maxAttempts) {
          console.warn('[Timeline] Failed to find starred message');
          window.history.replaceState(null, '', window.location.pathname + window.location.search);
          return;
        }

        // Exponential backoff: 100ms, 200ms, 300ms, 300ms, 300ms...
        const delay = Math.min(attempts * 100, 300);
        setTimeout(retry, delay);
      };

      // Quick first attempt if markers might be ready
      if (this.markers.length > 0) {
        if (checkAndScroll()) return;
      }

      // Start retry sequence with minimal initial delay
      setTimeout(retry, 200);
    } catch (error) {
      console.error('[Timeline] Failed to handle starred message navigation:', error);
    }
  }

  destroy(): void {
    // Cleanup keyboard shortcuts
    if (this.shortcutUnsubscribe) {
      try {
        this.shortcutUnsubscribe();
        this.shortcutUnsubscribe = null;
      } catch (error) {
        console.error('[Timeline] Failed to unsubscribe from keyboard shortcuts:', error);
      }
    }

    // Clear navigation queue
    this.navigationQueue = [];
    this.isNavigating = false;

    // Cleanup EventBus subscriptions (Observer pattern cleanup)
    this.eventBusUnsubscribers.forEach((unsubscribe) => {
      try {
        unsubscribe();
      } catch (error) {
        console.error('[Timeline] Failed to unsubscribe from EventBus:', error);
      }
    });
    this.eventBusUnsubscribers = [];

    // Ensure draggable listeners are removed
    try {
      this.toggleDraggable(false);
    } catch {}
    // Also remove any in-flight drag listeners
    try {
      if (this.onBarPointerMove) window.removeEventListener('pointermove', this.onBarPointerMove);
    } catch {}
    try {
      if (this.onBarPointerUp) window.removeEventListener('pointerup', this.onBarPointerUp);
    } catch {}
    try {
      this.mutationObserver?.disconnect();
    } catch {}
    try {
      this.resizeObserver?.disconnect();
    } catch {}
    try {
      this.intersectionObserver?.disconnect();
    } catch {}
    this.visibleUserTurns.clear();
    if (this.ui.timelineBar && this.onTimelineBarClick) {
      try {
        this.ui.timelineBar.removeEventListener('click', this.onTimelineBarClick);
      } catch {}
    }
    try {
      window.removeEventListener('storage', this.onStorage!);
    } catch {}
    if (this.onChromeStorageChanged && typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
      try {
        chrome.storage.onChanged.removeListener(this.onChromeStorageChanged);
      } catch {}
      this.onChromeStorageChanged = null;
    }
    // Cleanup context menu
    this.hideContextMenu();
    try {
      this.ui.timelineBar?.removeEventListener('contextmenu', this.onContextMenu!);
    } catch {}
    try {
      document.removeEventListener('click', this.onDocumentClick!);
    } catch {}
    try {
      this.ui.timelineBar?.removeEventListener('pointerdown', this.onPointerDown!);
    } catch {}
    try {
      window.removeEventListener('pointermove', this.onPointerMove!);
    } catch {}
    try {
      window.removeEventListener('pointerup', this.onPointerUp!);
    } catch {}
    try {
      window.removeEventListener('pointercancel', this.onPointerCancel!);
    } catch {}
    try {
      this.ui.timelineBar?.removeEventListener('pointerleave', this.onPointerLeave!);
    } catch {}
    if (this.scrollContainer && this.onScroll) {
      try {
        this.scrollContainer.removeEventListener('scroll', this.onScroll);
      } catch {}
    }
    if (this.ui.timelineBar) {
      try {
        this.ui.timelineBar.removeEventListener('wheel', this.onTimelineWheel!);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('pointerenter', this.onBarEnter!);
      } catch {}
      try {
        this.ui.timelineBar.removeEventListener('pointerleave', this.onBarLeave!);
      } catch {}
      try {
        this.ui.slider?.removeEventListener('pointerenter', this.onSliderEnter!);
      } catch {}
      try {
        this.ui.slider?.removeEventListener('pointerleave', this.onSliderLeave!);
      } catch {}
    }
    try {
      this.ui.sliderHandle?.removeEventListener('pointerdown', this.onSliderDown!);
    } catch {}
    try {
      window.removeEventListener('resize', this.onWindowResize!);
    } catch {}
    if (this.onVisualViewportResize && window.visualViewport) {
      try {
        window.visualViewport.removeEventListener('resize', this.onVisualViewportResize);
      } catch {}
      this.onVisualViewportResize = null;
    }
    if (this.scrollRafId !== null) {
      try {
        cancelAnimationFrame(this.scrollRafId);
      } catch {}
      this.scrollRafId = null;
    }
    try {
      this.ui.timelineBar?.remove();
    } catch {}
    try {
      this.ui.tooltip?.remove();
    } catch {}
    try {
      this.measureEl?.remove();
    } catch {}
    try {
      if (this.ui.slider) {
        this.ui.slider.style.pointerEvents = 'none';
        this.ui.slider.remove();
      }
      const stray = document.querySelector('.timeline-left-slider');
      if (stray) {
        (stray as HTMLElement).style.pointerEvents = 'none';
        stray.remove();
      }
    } catch {}
    this.ui.slider = null;
    this.ui.sliderHandle = null;
    this.clearSearchHighlights();
    this.previewPanel?.destroy();
    this.previewPanel = null;
    this.ui = { timelineBar: null, tooltip: null };
    this.markers = [];
    this.markerTops = [];
    this.activeTurnId = null;
    this.scrollContainer = null;
    this.conversationContainer = null;
    if (this.activeChangeTimer) {
      clearTimeout(this.activeChangeTimer);
      this.activeChangeTimer = null;
    }
    if (this.tooltipHideTimer) {
      clearTimeout(this.tooltipHideTimer);
      this.tooltipHideTimer = null;
    }
    if (this.resizeIdleTimer) {
      clearTimeout(this.resizeIdleTimer);
      this.resizeIdleTimer = null;
    }
    try {
      if (this.resizeIdleRICId && 'cancelIdleCallback' in window) {
        (window as Window & { cancelIdleCallback: (id: number) => void }).cancelIdleCallback(
          this.resizeIdleRICId,
        );
        this.resizeIdleRICId = null;
      }
    } catch {}
    if (this.sliderFadeTimer) {
      clearTimeout(this.sliderFadeTimer);
      this.sliderFadeTimer = null;
    }
    this.pendingActiveId = null;
  }
}
