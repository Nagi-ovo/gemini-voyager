import type { TimelineState } from './TimelineState';
import type { TimelineStoragePolicy } from './TimelineStoragePolicy';
import type { TimelineMarker } from './types';

export interface TimelineTurnSnapshot {
  readonly markers: TimelineMarker[];
  readonly mountedCount: number;
}

/** A source owns selectors, discovery and its host's observation rules. */
export interface TimelineTurnSource {
  readonly root: HTMLElement | null;
  readonly anchor: HTMLElement | null;
  // Virtualized hosts need remembered geometry and homing when a turn leaves the DOM.
  readonly navigation: 'mounted' | 'virtualized';
  initialize(signal: AbortSignal): Promise<boolean>;
  read(previous: TimelineMarker[]): TimelineTurnSnapshot;
  count(): number;
  refresh(): boolean;
  observe(callback: MutationCallback): MutationObserver;
  stop(): void;
}

export interface TimelineTimestampOwner {
  init(): Promise<void>;
  update(previous: TimelineMarker[], next: TimelineMarker[]): void;
  formatTooltipTimestamp(id: string): string | null;
  destroy(): void;
}

/** Host facts for one route; the engine owns state, geometry and UI lifetime. */
export interface TimelineAdapter {
  readonly route: { readonly siteId: string; readonly url: string };
  readonly mount: { anchor(): HTMLElement; readonly position: 'auto' | 'left' | 'right' };
  readonly storage: TimelineStoragePolicy;
  readonly turns: TimelineTurnSource;
  viewport(element: HTMLElement): HTMLElement;
  // Gemini's timestamp bridge subscribes to a page-lifetime history store independently of state.
  timestamps(state: TimelineState): TimelineTimestampOwner | null;
}
