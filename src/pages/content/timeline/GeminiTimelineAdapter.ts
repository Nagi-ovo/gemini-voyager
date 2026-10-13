import type { TimelineAdapter } from '@/features/timeline/TimelineAdapter';
import type { TimelineDataSession } from '@/features/timeline/TimelineDataSession';

import { createGeminiTimelineStoragePolicy } from './GeminiTimelineStorage';
import { GeminiTimelineTurnSource } from './GeminiTimelineTurnSource';
import { TimelineTimestamps } from './TimelineTimestamps';

export interface GeminiTimelineOptions {
  previousUrl?: string | null;
  position?: 'left' | 'right';
  scrollContainer?: string;
}

export class GeminiTimelineAdapter implements TimelineAdapter {
  readonly route = { siteId: 'gemini', url: window.location.href };
  readonly storage = createGeminiTimelineStoragePolicy(this.route.url);
  readonly mount: TimelineAdapter['mount'];
  readonly turns = new GeminiTimelineTurnSource();
  constructor(private readonly options: GeminiTimelineOptions = {}) {
    this.mount = { anchor: () => document.body, position: options.position ?? 'auto' };
  }
  viewport = (element: HTMLElement): HTMLElement => {
    if (this.options.scrollContainer) {
      try {
        const viewport = document.querySelector<HTMLElement>(this.options.scrollContainer);
        if (viewport?.contains(element)) return viewport;
      } catch {
        // An optional layout selector never replaces the native identity or discovery policy.
      }
    }
    return geminiViewport(element);
  };
  timestamps(state: TimelineDataSession): TimelineTimestamps {
    return new TimelineTimestamps({
      getMarkers: () => state.markers,
      getTurnText: (element) => this.turns.text.getTurnTextCached(element),
      getTurnAliases: (id) => state.getStoredTurnIdAliases(id),
      onIdentityChange: () => state.refreshStars(),
    });
  }
}

function geminiViewport(element: HTMLElement): HTMLElement {
  let p: HTMLElement | null = element;
  while (p && p !== document.body) {
    const st = getComputedStyle(p);
    if (st.overflowY === 'auto' || st.overflowY === 'scroll') {
      return p;
    }
    p = p.parentElement;
  }

  return (
    (document.scrollingElement as HTMLElement | null) ||
    (document.documentElement as HTMLElement | null) ||
    (document.body as unknown as HTMLElement)
  );
}
