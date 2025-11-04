/**
 * Timeline UI Manager
 * Single Responsibility: Create and manage UI elements
 */

import type { TimelineUIElements, TimelineMarker, DotElement } from '@/core';
import { domService, logger } from '@/core';

export class TimelineUIManager {
  private readonly logger = logger.createChild('TimelineUI');
  private elements: TimelineUIElements = {
    timelineBar: null,
    tooltip: null,
    track: null,
    trackContent: null,
    slider: null,
    sliderHandle: null,
  };

  /**
   * Initialize all UI elements
   */
  initializeUI(): TimelineUIElements {
    this.createTimelineBar();
    this.createSlider();
    this.createTooltip();

    return this.getElements();
  }

  /**
   * Get UI elements
   */
  getElements(): TimelineUIElements {
    return { ...this.elements };
  }

  /**
   * Create main timeline bar
   */
  private createTimelineBar(): void {
    // Check if already exists
    let bar = document.querySelector('.gemini-timeline-bar') as HTMLElement | null;

    if (!bar) {
      bar = domService.createElement('div', {
        class: 'gemini-timeline-bar',
      });
      document.body.appendChild(bar);
    }

    this.elements.timelineBar = bar;

    // Create track
    let track = bar.querySelector('.timeline-track') as HTMLElement | null;

    if (!track) {
      track = domService.createElement('div', {
        class: 'timeline-track',
      });
      bar.appendChild(track);
    }

    this.elements.track = track;

    // Create track content
    let content = track.querySelector('.timeline-track-content') as HTMLElement | null;

    if (!content) {
      content = domService.createElement('div', {
        class: 'timeline-track-content',
      });
      track.appendChild(content);
    }

    this.elements.trackContent = content;

    this.logger.debug('Timeline bar created');
  }

  /**
   * Create slider element
   */
  private createSlider(): void {
    let slider = document.querySelector('.timeline-left-slider') as HTMLElement | null;

    if (!slider) {
      slider = domService.createElement('div', {
        class: 'timeline-left-slider',
      });

      const handle = domService.createElement('div', {
        class: 'timeline-left-handle',
      });

      slider.appendChild(handle);
      document.body.appendChild(slider);
    }

    this.elements.slider = slider;
    this.elements.sliderHandle = slider.querySelector('.timeline-left-handle');

    this.logger.debug('Slider created');
  }

  /**
   * Create tooltip element
   */
  private createTooltip(): void {
    let tooltip = document.getElementById('gemini-timeline-tooltip');

    if (!tooltip) {
      tooltip = domService.createElement('div', {
        class: 'timeline-tooltip',
        id: 'gemini-timeline-tooltip',
        'aria-hidden': 'true',
      });

      document.body.appendChild(tooltip);
    }

    this.elements.tooltip = tooltip as HTMLElement;

    this.logger.debug('Tooltip created');
  }

  /**
   * Create a dot element for a marker
   */
  createDotElement(marker: TimelineMarker): DotElement {
    const dot = domService.createElement('button', {
      class: 'timeline-dot',
      'data-target-turn-id': String(marker.id),
      'aria-label': marker.summary,
      tabindex: '0',
      'aria-describedby': 'gemini-timeline-tooltip',
      'aria-pressed': marker.starred ? 'true' : 'false',
    }) as DotElement;

    // Set CSS variable for position
    dot.style.setProperty('--n', String(marker.n || 0));

    // Add active class if this is the active marker
    if (marker.starred) {
      dot.classList.add('starred');
    }

    return dot;
  }

  /**
   * Update dot element
   */
  updateDotElement(
    dot: DotElement,
    marker: TimelineMarker,
    usePixelTop: boolean,
    pixelTop?: number
  ): void {
    dot.style.setProperty('--n', String(marker.n || 0));

    if (usePixelTop && pixelTop !== undefined) {
      dot.style.top = `${Math.round(pixelTop)}px`;
    }

    dot.classList.toggle('starred', marker.starred);
    dot.setAttribute('aria-pressed', marker.starred ? 'true' : 'false');
  }

  /**
   * Render dots for visible markers
   */
  renderVisibleDots(
    markers: TimelineMarker[],
    visibleStart: number,
    visibleEnd: number,
    yPositions: number[],
    usePixelTop: boolean
  ): DocumentFragment {
    const fragment = document.createDocumentFragment();

    for (let i = visibleStart; i <= visibleEnd; i++) {
      const marker = markers[i];

      if (!marker || marker.dotElement) {
        continue;
      }

      const dot = this.createDotElement(marker);

      if (usePixelTop) {
        dot.style.top = `${Math.round(yPositions[i])}px`;
      }

      marker.dotElement = dot;
      fragment.appendChild(dot);
    }

    return fragment;
  }

  /**
   * Remove dots outside visible range
   */
  removeInvisibleDots(
    markers: TimelineMarker[],
    oldVisibleStart: number,
    oldVisibleEnd: number,
    newVisibleStart: number,
    newVisibleEnd: number
  ): void {
    // Remove dots before new visible range
    for (let i = oldVisibleStart; i < Math.min(newVisibleStart, oldVisibleEnd + 1); i++) {
      const marker = markers[i];

      if (marker?.dotElement) {
        marker.dotElement.remove();
        marker.dotElement = null;
      }
    }

    // Remove dots after new visible range
    for (let i = Math.max(newVisibleEnd + 1, oldVisibleStart); i <= oldVisibleEnd; i++) {
      const marker = markers[i];

      if (marker?.dotElement) {
        marker.dotElement.remove();
        marker.dotElement = null;
      }
    }
  }

  /**
   * Update slider position
   */
  updateSliderPosition(
    barRect: DOMRect,
    railLength: number,
    railTop: number,
    handleHeight: number,
    scrollRatio: number
  ): void {
    if (!this.elements.slider || !this.elements.sliderHandle) {
      return;
    }

    const railLeftGap = 8;
    const sliderWidth = 12;
    const left = Math.round(barRect.left - railLeftGap - sliderWidth);

    this.elements.slider.style.left = `${left}px`;
    this.elements.slider.style.top = `${railTop}px`;
    this.elements.slider.style.height = `${railLength}px`;

    const maxTop = Math.max(0, railLength - handleHeight);
    const handleTop = Math.round(scrollRatio * maxTop);

    this.elements.sliderHandle.style.height = `${handleHeight}px`;
    this.elements.sliderHandle.style.top = `${handleTop}px`;

    this.elements.slider.classList.add('visible');
  }

  /**
   * Show slider
   */
  showSlider(): void {
    this.elements.slider?.classList.add('visible');
  }

  /**
   * Hide slider
   */
  hideSlider(): void {
    this.elements.slider?.classList.remove('visible');
  }

  /**
   * Show tooltip
   */
  showTooltip(text: string, x: number, y: number, width: number): void {
    if (!this.elements.tooltip) {
      return;
    }

    this.elements.tooltip.textContent = text;
    this.elements.tooltip.style.left = `${x}px`;
    this.elements.tooltip.style.top = `${y}px`;
    this.elements.tooltip.style.width = `${width}px`;
    this.elements.tooltip.setAttribute('aria-hidden', 'false');

    // Trigger reflow for animation
    void this.elements.tooltip.offsetHeight;

    this.elements.tooltip.classList.add('visible');
  }

  /**
   * Hide tooltip
   */
  hideTooltip(): void {
    if (!this.elements.tooltip) {
      return;
    }

    this.elements.tooltip.classList.remove('visible');
    this.elements.tooltip.setAttribute('aria-hidden', 'true');
  }

  /**
   * Apply container visibility
   */
  applyContainerVisibility(hide: boolean): void {
    if (!this.elements.timelineBar) {
      return;
    }

    this.elements.timelineBar.classList.toggle('timeline-no-container', hide);
  }

  /**
   * Cleanup all UI elements
   */
  cleanup(): void {
    this.elements.timelineBar?.remove();
    this.elements.tooltip?.remove();
    this.elements.slider?.remove();

    // Remove any stray sliders
    document.querySelectorAll('.timeline-left-slider').forEach((el) => {
      (el as HTMLElement).style.pointerEvents = 'none';
      el.remove();
    });

    this.elements = {
      timelineBar: null,
      tooltip: null,
      track: null,
      trackContent: null,
      slider: null,
      sliderHandle: null,
    };

    this.logger.debug('UI elements cleaned up');
  }
}
