/**
 * Timeline Marker Manager
 * Single Responsibility: Manage marker data and operations
 */

import type { TimelineMarker, TurnId, ConversationId } from '@/core';
import {
  logger,
  hashString,
  normalizeText,
  filterTopLevel,
  deduplicateBy,
  getUserTurnSelectors,
  combineSelectors,
} from '@/core';

export class TimelineMarkerManager {
  private readonly logger = logger.createChild('TimelineMarker');

  /**
   * Collect user turn elements from DOM
   */
  collectUserTurns(
    conversationContainer: HTMLElement,
    userTurnSelector: string
  ): HTMLElement[] {
    const nodeList = conversationContainer.querySelectorAll(userTurnSelector);
    let elements = Array.from(nodeList) as HTMLElement[];

    // Filter to top-level only (remove nested duplicates)
    elements = filterTopLevel(elements);

    if (elements.length === 0) {
      return [];
    }

    // Deduplicate by text and offset
    const firstOffset = elements[0].offsetTop;
    elements = this.deduplicateByTextAndOffset(elements, firstOffset);

    return elements;
  }

  /**
   * Create markers from elements
   */
  createMarkers(
    elements: HTMLElement[],
    starredSet: Set<TurnId>
  ): TimelineMarker[] {
    if (elements.length === 0) {
      return [];
    }

    const firstOffset = elements[0].offsetTop;
    const lastOffset = elements[elements.length - 1].offsetTop;
    const contentSpan = Math.max(1, lastOffset - firstOffset);

    return elements.map((element, index) => {
      const offsetFromStart = element.offsetTop - firstOffset;
      const normalized = Math.max(0, Math.min(1, offsetFromStart / contentSpan));
      const id = this.ensureTurnId(element, index);

      return {
        id,
        element,
        summary: normalizeText(element.textContent),
        n: normalized,
        baseN: normalized,
        dotElement: null,
        starred: starredSet.has(id),
      };
    });
  }

  /**
   * Find marker by ID
   */
  findMarkerById(markers: TimelineMarker[], id: TurnId): TimelineMarker | null {
    return markers.find((m) => m.id === id) ?? null;
  }

  /**
   * Find marker index by ID
   */
  findMarkerIndex(markers: TimelineMarker[], id: TurnId): number {
    return markers.findIndex((m) => m.id === id);
  }

  /**
   * Update marker starred status
   */
  updateMarkerStarred(marker: TimelineMarker, starred: boolean): void {
    marker.starred = starred;

    if (marker.dotElement) {
      marker.dotElement.classList.toggle('starred', starred);
      marker.dotElement.setAttribute('aria-pressed', starred ? 'true' : 'false');
    }
  }

  /**
   * Compute active marker by scroll position
   */
  computeActiveMarkerByScroll(
    markers: TimelineMarker[],
    scrollContainer: HTMLElement
  ): TurnId | null {
    if (markers.length === 0) {
      return null;
    }

    const containerRect = scrollContainer.getBoundingClientRect();
    const scrollTop = scrollContainer.scrollTop;
    const referencePoint = scrollTop + scrollContainer.clientHeight * 0.45;

    let activeId = markers[0].id;

    for (const marker of markers) {
      const elementTop =
        marker.element.getBoundingClientRect().top -
        containerRect.top +
        scrollTop;

      if (elementTop <= referencePoint) {
        activeId = marker.id;
      } else {
        break;
      }
    }

    return activeId;
  }

  /**
   * Ensure element has a turn ID
   */
  private ensureTurnId(element: HTMLElement, index: number): TurnId {
    const dataset = element.dataset as any;
    let id = dataset.turnId as TurnId | undefined;

    if (!id) {
      const basis = normalizeText(element.textContent) || `user-${index}`;
      id = `u-${index}-${hashString(basis)}` as TurnId;

      try {
        dataset.turnId = id;
      } catch (error) {
        this.logger.warn('Failed to set turn ID on element', { error });
      }
    }

    return id;
  }

  /**
   * Deduplicate elements by text content and offset
   */
  private deduplicateByTextAndOffset(
    elements: HTMLElement[],
    firstOffset: number
  ): HTMLElement[] {
    return deduplicateBy(elements, (el) => {
      const offsetFromStart = Math.round(el.offsetTop - firstOffset);
      const text = normalizeText(el.textContent);

      return `${text}|${offsetFromStart}`;
    });
  }

  /**
   * Get user turn selector string
   */
  getUserTurnSelectorString(): string {
    return combineSelectors(getUserTurnSelectors());
  }

  /**
   * Compute conversation ID from URL
   */
  computeConversationId(): ConversationId {
    const raw = `${location.host}${location.pathname}${location.search}`;
    return `gemini:${hashString(raw)}` as ConversationId;
  }
}
