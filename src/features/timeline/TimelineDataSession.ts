import { TimelineState } from './TimelineState';
import type { TimelineStoragePolicy } from './TimelineStoragePolicy';
import type { MarkerLevel, TimelineMarker } from './types';

/** A rail's access to its conversation data, independent of the host's UI and selectors. */
export interface TimelineDataSession {
  readonly conversationId: string;
  readonly markers: TimelineMarker[];
  readonly markerMap: ReadonlyMap<string, TimelineMarker>;
  readonly hierarchy: {
    getMarkerLevel(id: string): MarkerLevel;
    isMarkerCollapsed(id: string): boolean;
    setMarkerLevel(id: string, level: MarkerLevel): void | Promise<void>;
    toggleCollapse(id: string): void | Promise<void>;
  };
  init(): Promise<void>;
  destroy(): void;
  replaceMarkers(markers: TimelineMarker[]): void;
  isMarkerStarred(id: string): boolean;
  toggleStar(id: string): Promise<void>;
  refreshStars(): void;
  resolveMarkerIdForStorageId(id: string): string | null;
  getStoredTurnIdAliases(id: string): string[];
}

/** Each route keeps one owner, using the existing hydration, storage listeners and write queues. */
export function createTimelineDataSession({
  policy,
  onChange,
}: {
  readonly policy: TimelineStoragePolicy;
  readonly onChange: () => void;
}): TimelineDataSession {
  return new TimelineState(onChange, policy);
}
