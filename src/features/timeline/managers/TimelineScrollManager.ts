/**
 * Timeline Scroll Manager
 * Single Responsibility: Handle scroll synchronization and animation
 */

import type { ScrollMode, SpringProfile } from '@/core';
import { logger } from '@/core';

export class TimelineScrollManager {
  private readonly logger = logger.createChild('TimelineScroll');

  /**
   * Smooth scroll to target position
   */
  smoothScrollTo(
    scrollContainer: HTMLElement,
    targetPosition: number,
    duration: number,
    scrollMode: ScrollMode,
    springProfile: SpringProfile,
    onComplete?: () => void
  ): void {
    if (scrollMode === 'jump') {
      scrollContainer.scrollTop = targetPosition;
      onComplete?.();
      return;
    }

    const startPosition = scrollContainer.scrollTop;
    const distance = targetPosition - startPosition;
    let startTime: number | null = null;

    const animate = (currentTime: number) => {
      if (startTime === null) {
        startTime = currentTime;
      }

      const timeElapsed = currentTime - startTime;
      const progress = Math.min(timeElapsed / duration, 1);

      const easedProgress = this.applyEasing(progress, springProfile);
      const currentPosition = startPosition + distance * easedProgress;

      scrollContainer.scrollTop = currentPosition;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        scrollContainer.scrollTop = targetPosition;
        onComplete?.();
      }
    };

    requestAnimationFrame(animate);
  }

  /**
   * Apply easing function based on spring profile
   */
  private applyEasing(t: number, profile: SpringProfile): number {
    const clamped = Math.max(0, Math.min(1, t));

    switch (profile) {
      case 'snappy': {
        // Ease out back with overshoot
        const s = 1.15;
        const x = clamped < 0.6 ? clamped / 0.6 : 1 + (0.6 - clamped) * 0.15;
        return Math.max(0, Math.min(1, x * s - (s - 1)));
      }

      case 'gentle': {
        // Smooth cubic ease-in-out
        return clamped < 0.5
          ? 4 * clamped * clamped * clamped
          : 1 - Math.pow(-2 * clamped + 2, 3) / 2;
      }

      case 'ios':
      default: {
        // iOS-like spring with smooth step
        const smoothStep = clamped * clamped * (3 - 2 * clamped);
        const powerMix = (Math.pow(clamped, 0.42) + Math.pow(clamped, 0.58)) / 2;

        return powerMix * 0.15 + smoothStep * 0.85;
      }
    }
  }

  /**
   * Calculate scroll ratio
   */
  calculateScrollRatio(
    scrollTop: number,
    scrollHeight: number,
    clientHeight: number
  ): number {
    const maxScroll = Math.max(0, scrollHeight - clientHeight);

    return maxScroll > 0 ? scrollTop / maxScroll : 0;
  }

  /**
   * Sync timeline track scroll to main scroll
   */
  syncTrackScroll(
    scrollContainer: HTMLElement,
    track: HTMLElement,
    firstUserTurnOffset: number,
    contentSpanPx: number,
    contentHeight: number
  ): void {
    const scrollTop = scrollContainer.scrollTop;
    const ref = scrollTop + scrollContainer.clientHeight * 0.45;

    const normalized = Math.max(
      0,
      Math.min(1, (ref - firstUserTurnOffset) / Math.max(1, contentSpanPx))
    );

    const maxScroll = Math.max(0, contentHeight - track.clientHeight);
    const targetScroll = Math.round(normalized * maxScroll);

    if (Math.abs(track.scrollTop - targetScroll) > 1) {
      track.scrollTop = targetScroll;
    }
  }

  /**
   * Calculate target scroll position for element
   */
  calculateScrollToElement(
    element: HTMLElement,
    scrollContainer: HTMLElement
  ): number {
    const containerRect = scrollContainer.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    return (
      elementRect.top - containerRect.top + scrollContainer.scrollTop
    );
  }

  /**
   * Check if element is in viewport
   */
  isInViewport(
    element: HTMLElement,
    container: HTMLElement,
    margin: number = 0
  ): boolean {
    const containerRect = container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();

    return (
      elementRect.top >= containerRect.top - margin &&
      elementRect.bottom <= containerRect.bottom + margin
    );
  }
}
