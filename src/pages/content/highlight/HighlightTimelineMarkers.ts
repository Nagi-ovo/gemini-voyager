import {
  HIGHLIGHT_COLORS,
  type HighlightRecordV1,
  getHighlightColorHex,
  isHighlightPresetColor,
} from '@/core/types/highlight';

import { readServerTurnId } from '../fork/turnId';
import { findScrollableAncestor, isVisibleHighlightMark } from './dom';
import { translateWith } from './messages';

/** The Gemini turn element whose id `readServerTurnId` turns into the timeline marker id. */
const TURN_CONTAINER_SELECTOR = '.conversation-container';

interface RenderedTurnDot {
  turnId: string;
  index: number;
  element: HTMLElement;
}

function centerOf(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  return rect.top + rect.height / 2;
}

/** Rendered rail markers in turn order; collapsed and virtualized turns have none. */
function collectRenderedTurnDots(trackContent: HTMLElement): RenderedTurnDot[] {
  const dots: RenderedTurnDot[] = [];
  trackContent.querySelectorAll<HTMLElement>('.timeline-dot').forEach((element) => {
    const turnId = element.dataset.targetTurnId;
    const index = Number(element.dataset.markerIndex);
    if (turnId && Number.isFinite(index)) dots.push({ turnId, index, element });
  });
  return dots.sort((left, right) => left.index - right.index);
}

/**
 * The marked turn whose rail marker stands for `turn`: its own, or on a dense rail the
 * nearest earlier one, since a dense rail leaves out only turns folded under that marker.
 */
function findAnchorTurn(
  turn: HTMLElement,
  turns: readonly HTMLElement[],
  dots: readonly RenderedTurnDot[],
  dense: boolean,
): { position: number; turn: HTMLElement } | null {
  const positions = new Map(dots.map((dot, position) => [dot.turnId, position]));
  for (let index = turns.indexOf(turn); index >= 0; index -= 1) {
    const id = readServerTurnId(turns[index]);
    const position = id ? positions.get(id) : undefined;
    if (position !== undefined) return { position, turn: turns[index] };
    if (!dense) return null;
  }
  return null;
}

export class HighlightTimelineMarkers {
  private readonly ticks = new Map<string, HTMLButtonElement>();
  private timelineStyleObserver: MutationObserver | null = null;
  private observedTimelineBar: HTMLElement | null = null;
  private timelineRaf: number | null = null;
  private enabled = true;
  private destroyed = false;
  private readonly onViewportChange = (): void => this.scheduleTimelineSync();

  constructor(
    private readonly records: ReadonlyMap<string, HighlightRecordV1>,
    private readonly marks: ReadonlyMap<string, readonly HTMLElement[]>,
    private readonly onNavigate: (id: string) => void,
  ) {}

  start(): void {
    window.addEventListener('resize', this.onViewportChange, { passive: true });
    document.addEventListener('scroll', this.onViewportChange, { capture: true, passive: true });
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.render();
  }

  clear(): void {
    this.ticks.forEach((tick) => tick.remove());
    this.ticks.clear();
  }

  render(): void {
    if (this.destroyed) return;
    if (!this.enabled) {
      this.clear();
      return;
    }
    const bar = document.querySelector<HTMLElement>('.gemini-timeline-bar');
    const trackContent = bar?.querySelector<HTMLElement>('.timeline-track-content');
    if (!bar || !trackContent) {
      this.timelineStyleObserver?.disconnect();
      this.observedTimelineBar = null;
      this.clear();
      return;
    }
    this.observeTimelineStyle(bar);
    const compact = bar.classList.contains('timeline-style-compact');
    const dense = compact || bar.classList.contains('gv-timeline-style-ruler');
    // Compact hides its track from assistive technology, so its ticks stay focusable on the bar.
    const parent = compact ? bar : trackContent;
    const dots = collectRenderedTurnDots(trackContent);
    const turns = Array.from(document.querySelectorAll<HTMLElement>(TURN_CONTAINER_SELECTOR));

    for (const [id, record] of this.records) {
      const mark = this.marks.get(id)?.find(isVisibleHighlightMark);
      const top = mark ? this.resolveTickTop(mark, parent, trackContent, turns, dots, dense) : null;
      if (!mark || top === null) {
        this.ticks.get(id)?.remove();
        this.ticks.delete(id);
        continue;
      }

      let tick = this.ticks.get(id);
      if (!tick || !tick.isConnected || tick.parentElement !== parent) {
        tick?.remove();
        tick = document.createElement('button');
        tick.type = 'button';
        tick.className = 'gv-highlight-timeline-tick';
        tick.dataset.gvHighlightId = id;
        tick.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          this.onNavigate(id);
        });
        parent.appendChild(tick);
        this.ticks.set(id, tick);
      }
      HIGHLIGHT_COLORS.forEach((color) =>
        tick!.classList.remove(`gv-highlight-timeline-tick-${color}`),
      );
      tick.style.removeProperty('background-color');
      if (isHighlightPresetColor(record.color)) {
        tick.classList.add(`gv-highlight-timeline-tick-${record.color}`);
      } else {
        tick.style.backgroundColor = getHighlightColorHex(record.color);
      }
      tick.setAttribute(
        'aria-label',
        translateWith('highlightTimelineAriaLabel', 'Go to highlight: {text}', {
          text: record.anchor.quote.exact.slice(0, 120),
        }),
      );
      tick.title = record.anchor.quote.exact.replace(/\s+/g, ' ').trim().slice(0, 160);
      tick.style.top = `${Math.round(top)}px`;
    }

    for (const [id, tick] of this.ticks) {
      if (this.records.has(id) && this.marks.has(id)) continue;
      tick.remove();
      this.ticks.delete(id);
    }
  }

  private observeTimelineStyle(bar: HTMLElement): void {
    if (this.observedTimelineBar === bar) return;
    this.timelineStyleObserver?.disconnect();
    this.observedTimelineBar = bar;
    this.timelineStyleObserver = new MutationObserver(() => this.render());
    this.timelineStyleObserver.observe(bar, { attributes: true, attributeFilter: ['class'] });
  }

  /** The tick's top in `parent` coordinates, or null when the rail has no place for it. */
  private resolveTickTop(
    mark: HTMLElement,
    parent: HTMLElement,
    trackContent: HTMLElement,
    turns: readonly HTMLElement[],
    dots: readonly RenderedTurnDot[],
    dense: boolean,
  ): number | null {
    const turn = mark.closest<HTMLElement>(TURN_CONTAINER_SELECTOR);
    const anchor = turn ? findAnchorTurn(turn, turns, dots, dense) : null;
    if (anchor) {
      // Compact and ruler stack their markers around the rail's middle, unrelated to scroll
      // distance, so a tick must read its turn's rendered marker rather than a page ratio.
      const parentTop = parent.getBoundingClientRect().top;
      const anchorTop = centerOf(dots[anchor.position].element) - parentTop;
      const next = dots[anchor.position + 1];
      if (!next) return anchorTop;
      const start = anchor.turn.getBoundingClientRect();
      const nextTurn = turns.find((candidate) => readServerTurnId(candidate) === next.turnId);
      const end = nextTurn ? nextTurn.getBoundingClientRect().top : start.bottom;
      const progress = (mark.getBoundingClientRect().top - start.top) / (end - start.top);
      const clamped = Number.isFinite(progress) ? Math.max(0, Math.min(1, progress)) : 0;
      return anchorTop + clamped * (centerOf(next.element) - parentTop - anchorTop);
    }
    // Only a highlight above every marker is left; a dense rail has no place for it.
    if (dense) return null;
    // The classic rail virtualizes far markers; its proportional layout keeps the tick near
    // where the marker will render, outside the visible part of the track.
    const scrollContainer = findScrollableAncestor(mark);
    const containerRect = scrollContainer.getBoundingClientRect();
    const absoluteTop =
      scrollContainer.scrollTop + mark.getBoundingClientRect().top - containerRect.top;
    const ratio = Math.max(0, Math.min(1, absoluteTop / Math.max(1, scrollContainer.scrollHeight)));
    return ratio * Math.max(1, trackContent.scrollHeight || trackContent.clientHeight);
  }

  private scheduleTimelineSync(): void {
    if (this.timelineRaf !== null || this.destroyed) return;
    this.timelineRaf = requestAnimationFrame(() => {
      this.timelineRaf = null;
      this.render();
    });
  }

  destroy(): void {
    this.destroyed = true;
    window.removeEventListener('resize', this.onViewportChange);
    document.removeEventListener('scroll', this.onViewportChange, true);
    this.timelineStyleObserver?.disconnect();
    this.timelineStyleObserver = null;
    this.observedTimelineBar = null;
    if (this.timelineRaf !== null) cancelAnimationFrame(this.timelineRaf);
    this.timelineRaf = null;
    this.clear();
  }
}
