import { DotElement } from './types';

function hashString(input: string): string {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

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

  async init(): Promise<void> {
    const ok = await this.findCriticalElements();
    if (!ok) return;
    this.injectTimelineUI();
    this.setupEventListeners();
    this.setupObservers();
    this.conversationId = this.computeConversationId();
    this.loadStars();
    try {
      // prefer chrome.storage if available to sync with popup
      if ((window as any).chrome?.storage?.sync) {
        (window as any).chrome.storage.sync.get(
          { geminiTimelineScrollMode: 'flow', geminiTimelineHideContainer: false },
          (res: any) => {
            const m = res?.geminiTimelineScrollMode;
            if (m === 'flow' || m === 'jump') this.scrollMode = m;
            this.hideContainer = !!res?.geminiTimelineHideContainer;
            this.applyContainerVisibility();
          }
        );
        // listen for changes from popup and update mode live
        try {
          (window as any).chrome.storage.onChanged.addListener((changes: any, area: string) => {
            if (area !== 'sync') return;
            if (changes?.geminiTimelineScrollMode) {
              const n = changes.geminiTimelineScrollMode.newValue;
              if (n === 'flow' || n === 'jump') this.scrollMode = n;
            }
            if (changes?.geminiTimelineHideContainer) {
              this.hideContainer = !!changes.geminiTimelineHideContainer.newValue;
              this.applyContainerVisibility();
            }
          });
        } catch {}
      } else {
        const saved = localStorage.getItem('geminiTimelineScrollMode');
        if (saved === 'flow' || saved === 'jump') this.scrollMode = saved;
      }
    } catch {}
  }

  private applyContainerVisibility(): void {
    if (!this.ui.timelineBar) return;
    this.ui.timelineBar.classList.toggle('timeline-no-container', !!this.hideContainer);
  }

  private computeConversationId(): string {
    const raw = `${location.host}${location.pathname}${location.search}`;
    return `gemini:${hashString(raw)}`;
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

  private async findCriticalElements(): Promise<boolean> {
    const configured = this.getConfiguredUserTurnSelector();
    let userOverride = '';
    try {
      userOverride = localStorage.getItem('geminiTimelineUserTurnSelector') || '';
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
    const candidates = configured.length
      ? [configured, ...defaultCandidates.filter((s) => s !== configured)]
      : defaultCandidates;
    let firstTurn: Element | null = null;
    let matchedSelector = '';
    for (const sel of candidates) {
      firstTurn = await this.waitForElement(sel, 4000);
      if (firstTurn) {
        this.userTurnSelector = sel;
        matchedSelector = sel;
        break;
      }
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
    let bar = document.querySelector('.chatgpt-timeline-bar') as HTMLElement | null;
    if (!bar) {
      bar = document.createElement('div');
      bar.className = 'chatgpt-timeline-bar';
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
      tip.id = 'chatgpt-timeline-tooltip';
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
      return String(text || '')
        .replace(/\s+/g, ' ')
        .trim();
    } catch {
      return '';
    }
  }

  private filterTopLevel(elements: Element[]): HTMLElement[] {
    const arr = elements.map((e) => e as HTMLElement);
    const out: HTMLElement[] = [];
    for (let i = 0; i < arr.length; i++) {
      const el = arr[i];
      let isDescendant = false;
      for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const other = arr[j];
        if (other.contains(el)) {
          isDescendant = true;
          break;
        }
      }
      if (!isDescendant) out.push(el);
    }
    return out;
  }

  private dedupeByTextAndOffset(elements: HTMLElement[], firstTurnOffset: number): HTMLElement[] {
    const seen = new Set<string>();
    const out: HTMLElement[] = [];
    for (const el of elements) {
      const offsetFromStart = (el.offsetTop || 0) - firstTurnOffset;
      const key = `${this.normalizeText(el.textContent || '')}|${Math.round(offsetFromStart)}`;
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
    let id = (asEl.dataset && (asEl.dataset as any).turnId) || '';
    if (!id) {
      const basis = this.normalizeText(asEl.textContent || '') || `user-${index}`;
      id = `u-${index}-${hashString(basis)}`;
      try {
        (asEl.dataset as any).turnId = id;
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
    const desired = Math.max(H, N > 0 ? 2 * pad + Math.max(0, N - 1) * minGap : H);
    this.contentHeight = Math.ceil(desired);
    this.scale = H > 0 ? this.contentHeight / H : 1;
    this.ui.trackContent.style.height = `${this.contentHeight}px`;

    const usableC = Math.max(1, this.contentHeight - 2 * pad);
    const desiredY = this.markers.map(
      (m) => pad + Math.max(0, Math.min(1, m.baseN ?? m.n ?? 0)) * usableC
    );
    const adjusted = this.applyMinGap(desiredY, pad, pad + usableC, minGap);
    this.yPositions = adjusted;
    for (let i = 0; i < N; i++) {
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
        this.zeroTurnsTimer = window.setTimeout(() => {
          this.zeroTurnsTimer = null;
          this.recalculateAndRenderMarkers();
        }, 350);
      }
      return;
    }
    if (this.zeroTurnsTimer) {
      clearTimeout(this.zeroTurnsTimer);
      this.zeroTurnsTimer = null;
    }
    (this.ui.trackContent || this.ui.timelineBar)!
      .querySelectorAll('.timeline-dot')
      .forEach((n) => n.remove());

    // Filter to top-level matches first to avoid nested duplicates, then dedupe by text+offset
    let allEls = Array.from(userTurnNodeList) as HTMLElement[];
    allEls = this.filterTopLevel(allEls);
    if (allEls.length === 0) return;

    const firstTurnOffset = (allEls[0] as HTMLElement).offsetTop;
    allEls = this.dedupeByTextAndOffset(allEls, firstTurnOffset);

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
        summary: this.normalizeText(element.textContent || ''),
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
    this.syncTimelineTrackToMain();
    this.updateVirtualRangeAndRender();
    this.updateActiveDotUI();
    this.scheduleScrollSync();
  };

  private setupObservers(): void {
    this.mutationObserver = new MutationObserver(() => {
      this.debouncedRecalc();
      this.updateIntersectionObserverTargets();
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
      { root: this.scrollContainer, threshold: 0.1, rootMargin: '-40% 0px -59% 0px' }
    );
    this.updateIntersectionObserverTargets();
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
      const targetId = dot.dataset.targetTurnId!;
      const targetElement =
        (this.conversationContainer!.querySelector(
          `[data-turn-id="${targetId}"]`
        ) as HTMLElement | null) ||
        this.markers.find((m) => m.id === targetId)?.element ||
        null;
      if (targetElement) {
        const fromIdx = this.getActiveIndex();
        const toIdx = this.markers.findIndex((m) => m.id === targetId);
        const dur = this.computeFlowDuration(fromIdx, toIdx);
        if (this.scrollMode === 'flow' && fromIdx >= 0 && toIdx >= 0 && fromIdx !== toIdx) {
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
          '.timeline-dot:hover, .timeline-dot:focus'
        ) as DotElement | null;
        if (activeDot) this.refreshTooltipForDot(activeDot);
      }
      this.updateTimelineGeometry();
      this.syncTimelineTrackToMain();
      this.updateVirtualRangeAndRender();
    };
    window.addEventListener('resize', this.onWindowResize);
    if (window.visualViewport) {
      this.onVisualViewportResize = () => {
        this.updateTimelineGeometry();
        this.syncTimelineTrackToMain();
        this.updateVirtualRangeAndRender();
      };
      window.visualViewport.addEventListener('resize', this.onVisualViewportResize);
    }

    this.onSliderDown = (ev: PointerEvent) => {
      if (!this.ui.sliderHandle) return;
      try {
        (this.ui.sliderHandle as any).setPointerCapture(ev.pointerId);
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

    this.onStorage = (e: StorageEvent) => {
      if (!e || e.storageArea !== localStorage) return;
      const expectedKey = `chatgptTimelineStars:${this.conversationId}`;
      if (e.key !== expectedKey) return;
      let nextArr: string[] = [];
      try {
        nextArr = JSON.parse(e.newValue || '[]') || [];
      } catch {
        nextArr = [];
      }
      const nextSet = new Set(nextArr.map(String));
      if (nextSet.size === this.starred.size) {
        let same = true;
        for (const id of this.starred) {
          if (!nextSet.has(id)) {
            same = false;
            break;
          }
        }
        if (same) return;
      }
      this.starred = nextSet;
      for (const m of this.markers) {
        const want = this.starred.has(m.id);
        if (m.starred !== want) {
          m.starred = want;
          if (m.dotElement) {
            m.dotElement.classList.toggle('starred', m.starred);
            m.dotElement.setAttribute('aria-pressed', m.starred ? 'true' : 'false');
          }
        }
      }
      if (this.ui.tooltip?.classList.contains('visible')) {
        const currentDot = this.ui.timelineBar!.querySelector(
          '.timeline-dot:hover, .timeline-dot:focus'
        ) as DotElement | null;
        if (currentDot) this.refreshTooltipForDot(currentDot);
      }
    };
    window.addEventListener('storage', this.onStorage);
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
  }

  private debouncedRecalc = this.debounce(() => this.recalculateAndRenderMarkers(), 350);

  private debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
    let timeout: number | null = null;
    return ((...args: any[]) => {
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
    targetWidth: number
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
    height: number
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
    if (!this.scrollContainer || this.markers.length === 0) return;
    const containerRect = this.scrollContainer.getBoundingClientRect();
    const scrollTop = this.scrollContainer.scrollTop;
    const ref = scrollTop + this.scrollContainer.clientHeight * 0.45;
    let activeId = this.markers[0].id;
    for (let i = 0; i < this.markers.length; i++) {
      const m = this.markers[i];
      const top = m.element.getBoundingClientRect().top - containerRect.top + scrollTop;
      if (top <= ref) activeId = m.id;
      else break;
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
      if (!marker.dotElement) {
        const dot = document.createElement('button') as DotElement;
        dot.className = 'timeline-dot';
        dot.dataset.targetTurnId = marker.id;
        dot.setAttribute('aria-label', marker.summary);
        dot.setAttribute('tabindex', '0');
        dot.setAttribute('aria-describedby', 'chatgpt-timeline-tooltip');
        dot.style.setProperty('--n', String(marker.n || 0));
        if (this.usePixelTop) dot.style.top = `${Math.round(this.yPositions[i])}px`;
        dot.classList.toggle('active', marker.id === this.activeTurnId);
        dot.classList.toggle('starred', !!marker.starred);
        dot.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
        marker.dotElement = dot;
        frag.appendChild(dot);
      } else {
        marker.dotElement.style.setProperty('--n', String(marker.n || 0));
        if (this.usePixelTop) marker.dotElement.style.top = `${Math.round(this.yPositions[i])}px`;
        marker.dotElement.classList.toggle('starred', !!marker.starred);
        marker.dotElement.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
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
      Math.min(maxTop, this.sliderStartTop + delta - (parseFloat(this.ui.slider!.style.top) || 0))
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

  private toggleStar(turnId: string): void {
    const id = String(turnId || '');
    if (!id) return;
    if (this.starred.has(id)) this.starred.delete(id);
    else this.starred.add(id);
    this.saveStars();
    const m = this.markerMap.get(id);
    if (m && m.dotElement) {
      const isStarredNow = this.starred.has(id);
      m.starred = isStarredNow;
      m.dotElement.classList.toggle('starred', isStarredNow);
      m.dotElement.setAttribute('aria-pressed', isStarredNow ? 'true' : 'false');
      this.refreshTooltipForDot(m.dotElement);
    }
  }

  private saveStars(): void {
    const cid = this.conversationId;
    if (!cid) return;
    try {
      localStorage.setItem(`chatgptTimelineStars:${cid}`, JSON.stringify(Array.from(this.starred)));
    } catch {}
  }

  private loadStars(): void {
    this.starred.clear();
    const cid = this.conversationId;
    if (!cid) return;
    try {
      const raw = localStorage.getItem(`chatgptTimelineStars:${cid}`);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) arr.forEach((id: any) => this.starred.add(String(id)));
    } catch {}
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

  destroy(): void {
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
    this.ui = { timelineBar: null, tooltip: null } as any;
    this.markers = [];
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
      if (this.resizeIdleRICId && (window as any).cancelIdleCallback) {
        (window as any).cancelIdleCallback(this.resizeIdleRICId);
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
