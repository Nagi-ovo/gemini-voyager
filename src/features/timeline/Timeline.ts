/**
 * Timeline - Main Facade Class
 * Coordinates all timeline managers using Facade pattern
 * Replaces the 1647-line monolithic TimelineManager
 */

import { TimelineGeometryManager } from './managers/TimelineGeometryManager';
import { TimelineMarkerManager } from './managers/TimelineMarkerManager';
import { TimelineScrollManager } from './managers/TimelineScrollManager';
import { TimelineStateManager } from './managers/TimelineStateManager';
import { TimelineUIManager } from './managers/TimelineUIManager';

import type { Result, IDisposable, TimelineConfig } from '@/core';
import { logger, domService, storageService, StorageKeys, ErrorHandler, ErrorCode } from '@/core';


/**
 * Main Timeline class - Clean, organized, testable
 * Down from 1647 lines to ~300 lines with delegation
 */
export class Timeline implements IDisposable {
  private readonly logger = logger.createChild('Timeline');

  // Managers (Single Responsibility Principle)
  private readonly state: TimelineStateManager;
  private readonly ui: TimelineUIManager;
  private readonly geometry: TimelineGeometryManager;
  private readonly scroll: TimelineScrollManager;
  private readonly markers: TimelineMarkerManager;

  // DOM references
  private scrollContainer: HTMLElement | null = null;
  private conversationContainer: HTMLElement | null = null;

  // Observers
  private mutationObserver: MutationObserver | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private intersectionObserver: IntersectionObserver | null = null;

  constructor(config?: Partial<TimelineConfig>) {
    this.state = new TimelineStateManager(config);
    this.ui = new TimelineUIManager();
    this.geometry = new TimelineGeometryManager();
    this.scroll = new TimelineScrollManager();
    this.markers = new TimelineMarkerManager();
  }

  /**
   * Initialize timeline
   */
  async init(): Promise<Result<void>> {
    try {
      this.logger.info('Initializing timeline');

      // 1. Find critical DOM elements
      const elementsResult = await this.findCriticalElements();

      if (!elementsResult.success) {
        return elementsResult;
      }

      // 2. Load configuration from storage
      await this.loadConfiguration();

      // 3. Initialize UI
      this.ui.initializeUI();

      // 4. Setup event listeners
      this.setupEventListeners();

      // 5. Setup observers
      this.setupObservers();

      // 6. Initialize conversation ID
      const conversationId = this.markers.computeConversationId();
      this.state.setConversationId(conversationId);

      // 7. Load starred conversations
      await this.loadStarredConversations();

      // 8. Initial render
      await this.recalculateAndRender();

      this.logger.info('Timeline initialized successfully');

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to initialize timeline', { error });

      return {
        success: false,
        error: ErrorHandler.handle(error, { phase: 'initialization' }),
      };
    }
  }

  /**
   * Find critical DOM elements
   */
  private async findCriticalElements(): Promise<Result<void>> {
    try {
      // Find conversation container
      const mainResult = await domService.waitForElement('main', { timeout: 5000 });

      this.conversationContainer = mainResult.success
        ? mainResult.data
        : document.body as HTMLElement;

      // Find scroll container
      let element: HTMLElement | null = this.conversationContainer;

      while (element && element !== document.body) {
        const style = getComputedStyle(element);

        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
          this.scrollContainer = element;
          break;
        }

        element = element.parentElement;
      }

      if (!this.scrollContainer) {
        this.scrollContainer = (document.scrollingElement as HTMLElement) ||
          document.documentElement ||
          document.body;
      }

      this.logger.debug('Critical elements found', {
        hasConversationContainer: !!this.conversationContainer,
        hasScrollContainer: !!this.scrollContainer,
      });

      return { success: true, data: undefined };
    } catch (error) {
      this.logger.error('Failed to find critical elements', { error });

      return {
        success: false,
        error: ErrorHandler.handle(error, { phase: 'findElements' }),
      };
    }
  }

  /**
   * Load configuration from storage
   */
  private async loadConfiguration(): Promise<void> {
    try {
      // Load scroll mode
      const scrollModeResult = await storageService.get<'jump' | 'flow'>(
        StorageKeys.TIMELINE_SCROLL_MODE
      );

      if (scrollModeResult.success) {
        this.state.updateConfig({ scrollMode: scrollModeResult.data });
      }

      // Load hide container setting
      const hideContainerResult = await storageService.get<boolean>(
        StorageKeys.TIMELINE_HIDE_CONTAINER
      );

      if (hideContainerResult.success) {
        this.state.updateConfig({ hideContainer: hideContainerResult.data });
        this.ui.applyContainerVisibility(hideContainerResult.data);
      }

      // Load draggable setting
      const draggableResult = await storageService.get<boolean>(
        StorageKeys.TIMELINE_DRAGGABLE
      );

      if (draggableResult.success) {
        this.state.updateConfig({ draggable: draggableResult.data });
      }

      // Load position
      const positionResult = await storageService.get<{ top: number; left: number }>(
        StorageKeys.TIMELINE_POSITION
      );

      if (positionResult.success) {
        this.state.updateConfig({ position: positionResult.data });
        const elements = this.ui.getElements();

        if (elements.timelineBar) {
          elements.timelineBar.style.top = `${positionResult.data.top}px`;
          elements.timelineBar.style.left = `${positionResult.data.left}px`;
        }
      }

      this.logger.debug('Configuration loaded', {
        config: this.state.getConfig(),
      });
    } catch (error) {
      this.logger.warn('Failed to load some configuration', { error });
    }
  }

  /**
   * Load starred conversations
   */
  private async loadStarredConversations(): Promise<void> {
    const conversationId = this.state.getConversationId();

    if (!conversationId) {
      return;
    }

    try {
      const key = `geminiTimelineStars:${conversationId}`;
      const raw = localStorage.getItem(key);

      if (raw) {
        const arr = JSON.parse(raw);

        if (Array.isArray(arr)) {
          this.state.setStarred(arr);
          this.logger.debug('Loaded starred conversations', { count: arr.length });
        }
      }
    } catch (error) {
      this.logger.warn('Failed to load starred conversations', { error });
    }
  }

  /**
   * Recalculate and render markers
   */
  private async recalculateAndRender(): Promise<void> {
    if (!this.conversationContainer) {
      return;
    }

    const userTurnSelector = this.markers.getUserTurnSelectorString();
    const elements = this.markers.collectUserTurns(
      this.conversationContainer,
      userTurnSelector
    );

    if (elements.length === 0) {
      this.logger.debug('No user turns found');
      return;
    }

    const starredSet = new Set(this.state.getStarredTurnIds());
    const newMarkers = this.markers.createMarkers(elements, starredSet);

    this.state.setMarkers(newMarkers);

    this.logger.debug('Markers recalculated', { count: newMarkers.length });

    // Update geometry and render
    this.updateGeometry();
    this.renderVisibleMarkers();
  }

  /**
   * Update geometry calculations
   */
  private updateGeometry(): void {
    const elements = this.ui.getElements();

    if (!elements.timelineBar || !elements.trackContent) {
      return;
    }

    const config = this.state.getConfig();
    const markers = this.state.getMarkers();
    const trackHeight = elements.timelineBar.clientHeight;

    // Calculate content height
    const contentHeight = this.geometry.calculateRequiredContentHeight(
      markers.length,
      trackHeight,
      { trackPadding: config.trackPadding, minGap: config.minGap }
    );

    this.state.setContentHeight(contentHeight);
    elements.trackContent.style.height = `${contentHeight}px`;

    // Calculate scale
    const scale = this.geometry.calculateScale(contentHeight, trackHeight);
    this.state.setScale(scale);

    // Calculate positions
    const usableHeight = Math.max(1, contentHeight - 2 * config.trackPadding);
    const desiredPositions = markers.map(
      (m) => config.trackPadding + m.baseN * usableHeight
    );

    const adjustedPositions = this.geometry.applyMinGapConstraint(
      desiredPositions,
      config.trackPadding,
      config.trackPadding + usableHeight,
      config.minGap
    );

    this.state.setYPositions(adjustedPositions);

    // Update marker normalized positions
    markers.forEach((marker, i) => {
      const top = adjustedPositions[i];
      marker.n = (top - config.trackPadding) / usableHeight;
    });

    this.logger.debug('Geometry updated', {
      contentHeight,
      scale,
      markerCount: markers.length,
    });
  }

  /**
   * Render visible markers
   */
  private renderVisibleMarkers(): void {
    const elements = this.ui.getElements();

    if (!elements.track || !elements.trackContent) {
      return;
    }

    const markers = this.state.getMarkers();
    const yPositions = this.state.getYPositions();
    const scrollTop = elements.track.scrollTop;
    const viewportHeight = elements.track.clientHeight;

    const visibleRange = this.geometry.calculateVisibleRange(
      Array.from(yPositions),
      scrollTop,
      viewportHeight
    );

    const oldRange = this.state.getVisibleRange();

    // Remove invisible dots
    this.ui.removeInvisibleDots(
      Array.from(markers),
      oldRange.start,
      oldRange.end,
      visibleRange.start,
      visibleRange.end
    );

    // Render visible dots
    const fragment = this.ui.renderVisibleDots(
      Array.from(markers),
      visibleRange.start,
      visibleRange.end,
      Array.from(yPositions),
      this.state.shouldUsePixelTop()
    );

    if (fragment.childNodes.length > 0) {
      elements.trackContent.appendChild(fragment);
    }

    this.state.setVisibleRange(visibleRange);

    this.logger.debug('Visible markers rendered', { visibleRange });
  }

  /**
   * Setup event listeners (simplified - full implementation would include all events)
   */
  private setupEventListeners(): void {
    // Scroll event
    if (this.scrollContainer) {
      this.scrollContainer.addEventListener('scroll', () => {
        this.handleScroll();
      }, { passive: true });
    }

    // Window resize
    window.addEventListener('resize', () => {
      this.updateGeometry();
      this.renderVisibleMarkers();
    });

    this.logger.debug('Event listeners setup');
  }

  /**
   * Setup observers
   */
  private setupObservers(): void {
    if (!this.conversationContainer) {
      return;
    }

    // Mutation observer for DOM changes
    this.mutationObserver = new MutationObserver(() => {
      this.recalculateAndRender();
    });

    this.mutationObserver.observe(this.conversationContainer, {
      childList: true,
      subtree: true,
    });

    // Resize observer for timeline bar
    const elements = this.ui.getElements();

    if (elements.timelineBar) {
      this.resizeObserver = new ResizeObserver(() => {
        this.updateGeometry();
        this.renderVisibleMarkers();
      });

      this.resizeObserver.observe(elements.timelineBar);
    }

    this.logger.debug('Observers setup');
  }

  /**
   * Handle scroll event
   */
  private handleScroll(): void {
    if (!this.scrollContainer) {
      return;
    }

    const syncState = this.state.getScrollSyncState();

    if (syncState.rafId !== null) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      this.state.updateScrollSyncState({ rafId: null });
      this.renderVisibleMarkers();

      // Update active marker
      const markers = this.state.getMarkers();
      const activeId = this.markers.computeActiveMarkerByScroll(
        Array.from(markers),
        this.scrollContainer!
      );

      if (activeId && activeId !== this.state.getActiveTurnId()) {
        this.state.setActiveTurnId(activeId);
      }
    });

    this.state.updateScrollSyncState({ rafId });
  }

  /**
   * Dispose and cleanup
   */
  dispose(): void {
    this.logger.info('Disposing timeline');

    // Disconnect observers
    this.mutationObserver?.disconnect();
    this.resizeObserver?.disconnect();
    this.intersectionObserver?.disconnect();

    // Cleanup managers
    this.state.cleanup();
    this.ui.cleanup();

    // Clear references
    this.scrollContainer = null;
    this.conversationContainer = null;

    this.logger.info('Timeline disposed');
  }
}
