/**
 * Timeline-specific types
 * Extracted from the monolithic TimelineManager
 */
import type { TurnId } from './common';

export type ScrollMode = 'jump' | 'flow';

export type SpringProfile = 'ios' | 'snappy' | 'gentle';

export interface TimelineMarker {
  readonly id: TurnId;
  element: HTMLElement;
  summary: string;
  n: number; // Normalized position [0, 1]
  baseN: number; // Original normalized position
  dotElement: DotElement | null;
  starred: boolean;
  cachedOffsetTop?: number; // Cached position to avoid layout thrashing
}

export interface DotElement extends HTMLButtonElement {
  dataset: DOMStringMap & {
    targetTurnId?: string;
  };
}

export interface TimelineConfig {
  scrollMode: ScrollMode;
  hideContainer: boolean;
  draggable: boolean;
  position: { top: number; left: number } | null;
  flowDuration: number;
  springProfile: SpringProfile;
  minGap: number;
  trackPadding: number;
}

export interface TimelineUIElements {
  timelineBar: HTMLElement | null;
  tooltip: HTMLElement | null;
  track: HTMLElement | null;
  trackContent: HTMLElement | null;
  slider: HTMLElement | null;
  sliderHandle: HTMLElement | null;
}

export interface VisibleRange {
  start: number;
  end: number;
}

export interface ScrollSyncState {
  isScrolling: boolean;
  rafId: number | null;
  lastActiveChangeTime: number;
  minActiveChangeInterval: number;
  pendingActiveId: TurnId | null;
  activeChangeTimer: number | null;
}

export interface TooltipState {
  element: HTMLElement | null;
  hideTimer: number | null;
  showRafId: number | null;
  hideDelay: number;
}

export interface SliderState {
  dragging: boolean;
  fadeTimer: number | null;
  fadeDelay: number;
  alwaysVisible: boolean;
  startClientY: number;
  startTop: number;
}
