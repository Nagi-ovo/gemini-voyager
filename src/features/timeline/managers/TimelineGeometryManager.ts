/**
 * Timeline Geometry Manager
 * Single Responsibility: Handle all position calculations and layout
 */

import type { TimelineMarker } from '@/core';
import { logger } from '@/core';

export interface GeometryConfig {
  trackPadding: number;
  minGap: number;
}

export class TimelineGeometryManager {
  private readonly logger = logger.createChild('TimelineGeometry');

  /**
   * Apply minimum gap constraint to positions
   * Uses two-pass algorithm: forward pass then backward pass
   */
  applyMinGapConstraint(
    positions: number[],
    minTop: number,
    maxTop: number,
    minGap: number
  ): number[] {
    const count = positions.length;

    if (count === 0) {
      return positions;
    }

    const result = positions.slice();

    // Clamp first position
    result[0] = Math.max(minTop, Math.min(positions[0], maxTop));

    // Forward pass: ensure each position is at least minGap away from previous
    for (let i = 1; i < count; i++) {
      const minAllowed = result[i - 1] + minGap;
      result[i] = Math.max(positions[i], minAllowed);
    }

    // Check if last position exceeds maxTop
    if (result[count - 1] > maxTop) {
      // Backward pass: compress from the end
      result[count - 1] = maxTop;

      for (let i = count - 2; i >= 0; i--) {
        const maxAllowed = result[i + 1] - minGap;
        result[i] = Math.min(result[i], maxAllowed);
      }

      // If first position is now below minTop, do one more forward pass
      if (result[0] < minTop) {
        result[0] = minTop;

        for (let i = 1; i < count; i++) {
          const minAllowed = result[i - 1] + minGap;
          result[i] = Math.max(result[i], minAllowed);
        }
      }
    }

    // Final clamp to bounds
    for (let i = 0; i < count; i++) {
      result[i] = Math.max(minTop, Math.min(result[i], maxTop));
    }

    return result;
  }

  /**
   * Calculate normalized positions for markers
   */
  calculateNormalizedPositions(
    markers: TimelineMarker[],
    firstTurnOffset: number,
    contentSpan: number
  ): number[] {
    return markers.map((marker) => {
      const offsetFromStart = marker.element.offsetTop - firstTurnOffset;
      const normalized = contentSpan > 0 ? offsetFromStart / contentSpan : 0;

      return Math.max(0, Math.min(1, normalized));
    });
  }

  /**
   * Calculate pixel positions from normalized positions
   */
  calculatePixelPositions(
    normalizedPositions: number[],
    trackHeight: number,
    config: GeometryConfig
  ): number[] {
    const { trackPadding } = config;
    const usableHeight = Math.max(1, trackHeight - 2 * trackPadding);

    return normalizedPositions.map((n) => trackPadding + n * usableHeight);
  }

  /**
   * Calculate content height needed to accommodate all markers
   */
  calculateRequiredContentHeight(
    markerCount: number,
    trackHeight: number,
    config: GeometryConfig
  ): number {
    const { trackPadding, minGap } = config;

    if (markerCount === 0) {
      return trackHeight;
    }

    const minHeight = 2 * trackPadding + Math.max(0, markerCount - 1) * minGap;

    return Math.max(trackHeight, Math.ceil(minHeight));
  }

  /**
   * Calculate scale factor
   */
  calculateScale(contentHeight: number, trackHeight: number): number {
    return trackHeight > 0 ? contentHeight / trackHeight : 1;
  }

  /**
   * Detect if CSS var top positioning is supported
   */
  detectCssVarTopSupport(
    testElement: HTMLElement,
    trackContent: HTMLElement,
    padding: number,
    usableHeight: number
  ): boolean {
    try {
      // Create test dot
      const test = document.createElement('button');
      test.className = 'timeline-dot';
      test.style.visibility = 'hidden';
      test.setAttribute('aria-hidden', 'true');
      test.style.setProperty('--n', '0.5');

      trackContent.appendChild(test);

      const computedStyle = getComputedStyle(test);
      const topPx = parseFloat(computedStyle.top || '');

      test.remove();

      const expected = padding + 0.5 * usableHeight;
      const supported = Number.isFinite(topPx) && Math.abs(topPx - expected) <= 2;

      this.logger.debug('CSS var top support', { supported, topPx, expected });

      return supported;
    } catch (error) {
      this.logger.warn('Failed to detect CSS var support', { error });
      return false;
    }
  }

  /**
   * Get CSS variable as number
   */
  getCSSVarNumber(element: Element, varName: string, fallback: number): number {
    const value = getComputedStyle(element).getPropertyValue(varName).trim();
    const parsed = parseFloat(value);

    return Number.isFinite(parsed) ? parsed : fallback;
  }

  /**
   * Calculate visible range of markers based on scroll position
   */
  calculateVisibleRange(
    yPositions: number[],
    scrollTop: number,
    viewportHeight: number,
    buffer: number = 100
  ): { start: number; end: number } {
    const minY = scrollTop - buffer;
    const maxY = scrollTop + viewportHeight + buffer;

    const start = this.lowerBound(yPositions, minY);
    const end = Math.max(start - 1, this.upperBound(yPositions, maxY));

    return { start, end };
  }

  /**
   * Binary search for lower bound
   */
  private lowerBound(arr: number[], target: number): number {
    let left = 0;
    let right = arr.length;

    while (left < right) {
      const mid = (left + right) >> 1;

      if (arr[mid] < target) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left;
  }

  /**
   * Binary search for upper bound
   */
  private upperBound(arr: number[], target: number): number {
    let left = 0;
    let right = arr.length;

    while (left < right) {
      const mid = (left + right) >> 1;

      if (arr[mid] <= target) {
        left = mid + 1;
      } else {
        right = mid;
      }
    }

    return left - 1;
  }

  /**
   * Calculate element bounds
   */
  getBounds(element: Element): DOMRect {
    return element.getBoundingClientRect();
  }

  /**
   * Check if two rectangles intersect
   */
  intersects(rect1: DOMRect, rect2: DOMRect): boolean {
    return !(
      rect1.right < rect2.left ||
      rect1.left > rect2.right ||
      rect1.bottom < rect2.top ||
      rect1.top > rect2.bottom
    );
  }
}
