/**
 * Timeline State Manager
 * Single Responsibility: Manage all timeline state
 * Replaces 137 scattered private fields with organized state
 */

import type {
  TimelineConfig,
  TimelineMarker,
  VisibleRange,
  ScrollSyncState,
  SliderState,
  TooltipState,
  TurnId,
  ConversationId,
} from '@/core';

export interface TimelineState {
  // Configuration
  config: TimelineConfig;

  // Markers and active state
  markers: TimelineMarker[];
  activeTurnId: TurnId | null;
  markersVersion: number;

  // Geometry
  scale: number;
  contentHeight: number;
  yPositions: number[];
  firstUserTurnOffset: number;
  contentSpanPx: number;
  visibleRange: VisibleRange;

  // Scroll sync
  scrollSync: ScrollSyncState;

  // Slider
  slider: SliderState;

  // Tooltip
  tooltip: TooltipState;

  // Starred conversations
  starred: Set<TurnId>;
  conversationId: ConversationId | null;

  // Feature flags
  usePixelTop: boolean;
  cssVarTopSupported: boolean | null;
  flowAnimating: boolean;
  suppressClickUntil: number;

  // Long press state
  longPress: {
    timer: number | null;
    triggered: boolean;
    targetDot: HTMLElement | null;
    startPos: { x: number; y: number } | null;
    duration: number;
    moveTolerance: number;
  };

  // Drag state
  drag: {
    enabled: boolean;
    dragging: boolean;
    startPos: { x: number; y: number };
    startOffset: { x: number; y: number };
  };
}

export class TimelineStateManager {
  private state: TimelineState;

  constructor(initialConfig?: Partial<TimelineConfig>) {
    this.state = this.createInitialState(initialConfig);
  }

  private createInitialState(config?: Partial<TimelineConfig>): TimelineState {
    return {
      config: {
        scrollMode: config?.scrollMode ?? 'flow',
        hideContainer: config?.hideContainer ?? false,
        draggable: config?.draggable ?? false,
        position: config?.position ?? null,
        flowDuration: config?.flowDuration ?? 650,
        springProfile: config?.springProfile ?? 'ios',
        minGap: config?.minGap ?? 12,
        trackPadding: config?.trackPadding ?? 12,
      },

      markers: [],
      activeTurnId: null,
      markersVersion: 0,

      scale: 1,
      contentHeight: 0,
      yPositions: [],
      firstUserTurnOffset: 0,
      contentSpanPx: 1,
      visibleRange: { start: 0, end: -1 },

      scrollSync: {
        isScrolling: false,
        rafId: null,
        lastActiveChangeTime: 0,
        minActiveChangeInterval: 120,
        pendingActiveId: null,
        activeChangeTimer: null,
      },

      slider: {
        dragging: false,
        fadeTimer: null,
        fadeDelay: 1000,
        alwaysVisible: false,
        startClientY: 0,
        startTop: 0,
      },

      tooltip: {
        element: null,
        hideTimer: null,
        showRafId: null,
        hideDelay: 100,
      },

      starred: new Set(),
      conversationId: null,

      usePixelTop: false,
      cssVarTopSupported: null,
      flowAnimating: false,
      suppressClickUntil: 0,

      longPress: {
        timer: null,
        triggered: false,
        targetDot: null,
        startPos: null,
        duration: 550,
        moveTolerance: 6,
      },

      drag: {
        enabled: false,
        dragging: false,
        startPos: { x: 0, y: 0 },
        startOffset: { x: 0, y: 0 },
      },
    };
  }

  // Configuration getters/setters
  getConfig(): Readonly<TimelineConfig> {
    return { ...this.state.config };
  }

  updateConfig(updates: Partial<TimelineConfig>): void {
    this.state.config = { ...this.state.config, ...updates };
  }

  // Markers
  getMarkers(): readonly TimelineMarker[] {
    return this.state.markers;
  }

  setMarkers(markers: TimelineMarker[]): void {
    this.state.markers = markers;
    this.state.markersVersion++;
  }

  getMarkerCount(): number {
    return this.state.markers.length;
  }

  // Active turn
  getActiveTurnId(): TurnId | null {
    return this.state.activeTurnId;
  }

  setActiveTurnId(id: TurnId | null): void {
    this.state.activeTurnId = id;
    this.state.scrollSync.lastActiveChangeTime = performance.now();
  }

  // Geometry
  getScale(): number {
    return this.state.scale;
  }

  setScale(scale: number): void {
    this.state.scale = scale;
  }

  getContentHeight(): number {
    return this.state.contentHeight;
  }

  setContentHeight(height: number): void {
    this.state.contentHeight = height;
  }

  getYPositions(): readonly number[] {
    return this.state.yPositions;
  }

  setYPositions(positions: number[]): void {
    this.state.yPositions = positions;
  }

  // Visible range
  getVisibleRange(): Readonly<VisibleRange> {
    return { ...this.state.visibleRange };
  }

  setVisibleRange(range: VisibleRange): void {
    this.state.visibleRange = range;
  }

  // Scroll sync state
  getScrollSyncState(): Readonly<ScrollSyncState> {
    return { ...this.state.scrollSync };
  }

  updateScrollSyncState(updates: Partial<ScrollSyncState>): void {
    this.state.scrollSync = { ...this.state.scrollSync, ...updates };
  }

  // Slider state
  getSliderState(): Readonly<SliderState> {
    return { ...this.state.slider };
  }

  updateSliderState(updates: Partial<SliderState>): void {
    this.state.slider = { ...this.state.slider, ...updates };
  }

  // Tooltip state
  getTooltipState(): Readonly<TooltipState> {
    return { ...this.state.tooltip };
  }

  updateTooltipState(updates: Partial<TooltipState>): void {
    this.state.tooltip = { ...this.state.tooltip, ...updates };
  }

  // Starred
  isStarred(turnId: TurnId): boolean {
    return this.state.starred.has(turnId);
  }

  toggleStar(turnId: TurnId): boolean {
    if (this.state.starred.has(turnId)) {
      this.state.starred.delete(turnId);
      return false;
    } else {
      this.state.starred.add(turnId);
      return true;
    }
  }

  setStarred(turnIds: TurnId[]): void {
    this.state.starred = new Set(turnIds);
  }

  getStarredTurnIds(): TurnId[] {
    return Array.from(this.state.starred);
  }

  // Conversation ID
  getConversationId(): ConversationId | null {
    return this.state.conversationId;
  }

  setConversationId(id: ConversationId | null): void {
    this.state.conversationId = id;
  }

  // Feature flags
  shouldUsePixelTop(): boolean {
    return this.state.usePixelTop;
  }

  setUsePixelTop(value: boolean): void {
    this.state.usePixelTop = value;
  }

  getCssVarTopSupported(): boolean | null {
    return this.state.cssVarTopSupported;
  }

  setCssVarTopSupported(value: boolean): void {
    this.state.cssVarTopSupported = value;
  }

  // Animation flags
  isFlowAnimating(): boolean {
    return this.state.flowAnimating;
  }

  setFlowAnimating(value: boolean): void {
    this.state.flowAnimating = value;
  }

  // Click suppression
  getSuppressClickUntil(): number {
    return this.state.suppressClickUntil;
  }

  setSuppressClickUntil(timestamp: number): void {
    this.state.suppressClickUntil = timestamp;
  }

  shouldSuppressClick(): boolean {
    return Date.now() < this.state.suppressClickUntil;
  }

  // Long press
  getLongPressState() {
    return { ...this.state.longPress };
  }

  updateLongPressState(updates: Partial<typeof this.state.longPress>): void {
    this.state.longPress = { ...this.state.longPress, ...updates };
  }

  // Drag
  getDragState() {
    return { ...this.state.drag };
  }

  updateDragState(updates: Partial<typeof this.state.drag>): void {
    this.state.drag = { ...this.state.drag, ...updates };
  }

  // Cleanup
  cleanup(): void {
    // Clear all timers
    if (this.state.scrollSync.rafId !== null) {
      cancelAnimationFrame(this.state.scrollSync.rafId);
    }

    if (this.state.scrollSync.activeChangeTimer !== null) {
      clearTimeout(this.state.scrollSync.activeChangeTimer);
    }

    if (this.state.slider.fadeTimer !== null) {
      clearTimeout(this.state.slider.fadeTimer);
    }

    if (this.state.tooltip.hideTimer !== null) {
      clearTimeout(this.state.tooltip.hideTimer);
    }

    if (this.state.tooltip.showRafId !== null) {
      cancelAnimationFrame(this.state.tooltip.showRafId);
    }

    if (this.state.longPress.timer !== null) {
      clearTimeout(this.state.longPress.timer);
    }

    // Reset state
    this.state = this.createInitialState();
  }
}
