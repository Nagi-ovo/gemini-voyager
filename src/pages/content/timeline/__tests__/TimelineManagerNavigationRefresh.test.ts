import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

function setElementTop(el: HTMLElement, top: number): void {
  Object.defineProperty(el, 'offsetTop', { value: top, configurable: true });
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: top,
    top,
    left: 0,
    right: 0,
    bottom: top,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  } as DOMRect);
}

describe('TimelineManager navigation refresh', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('refreshes markers when at end and document has more turns', async () => {
    const main = document.createElement('main');
    document.body.appendChild(main);

    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    scrollContainer.scrollTop = 0;
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect);
    main.appendChild(scrollContainer);

    const oldContainer = document.createElement('div');
    scrollContainer.appendChild(oldContainer);

    const a = document.createElement('div');
    a.className = 'user';
    a.textContent = 'A';
    setElementTop(a, 0);
    oldContainer.appendChild(a);

    const b = document.createElement('div');
    b.className = 'user';
    b.textContent = 'B';
    setElementTop(b, 100);
    oldContainer.appendChild(b);

    const timelineBar = document.createElement('div');
    const trackContent = document.createElement('div');
    timelineBar.appendChild(trackContent);
    document.body.appendChild(timelineBar);

    const manager = new TimelineManager();
    const internal = manager as unknown as {
      conversationContainer: HTMLElement | null;
      scrollContainer: HTMLElement | null;
      userTurnSelector: string | null;
      ui: { timelineBar: HTMLElement | null; trackContent: HTMLElement | null };
      scrollMode: 'flow' | 'jump';
      activeTurnId: string | null;
      markers: Array<{ id: string }>;
      recalculateAndRenderMarkers: () => void;
      navigateToNextNode: () => Promise<void>;
      navigationQueue: Array<'previous' | 'next'>;
      enqueueNavigation: (direction: 'previous' | 'next', isRepeat?: boolean) => void;
      smoothScrollTo: (target: HTMLElement, duration: number) => void;
      updateTimelineGeometry: () => void;
      updateIntersectionObserverTargetsFromMarkers: () => void;
      syncTimelineTrackToMain: () => void;
      updateVirtualRangeAndRender: () => void;
      updateActiveDotUI: () => void;
      scheduleScrollSync: () => void;
    };

    internal.conversationContainer = oldContainer;
    internal.scrollContainer = scrollContainer;
    internal.userTurnSelector = '.user';
    internal.ui.timelineBar = timelineBar;
    internal.ui.trackContent = trackContent;
    internal.scrollMode = 'jump';

    internal.updateTimelineGeometry = vi.fn();
    internal.updateIntersectionObserverTargetsFromMarkers = vi.fn();
    internal.syncTimelineTrackToMain = vi.fn();
    internal.updateVirtualRangeAndRender = vi.fn();
    internal.updateActiveDotUI = vi.fn();
    internal.scheduleScrollSync = vi.fn();
    internal.smoothScrollTo = vi.fn();

    internal.activeTurnId = null;
    internal.recalculateAndRenderMarkers();

    expect(internal.markers).toHaveLength(2);
    expect(internal.activeTurnId).toBe(internal.markers[1]!.id);

    const c = document.createElement('div');
    c.className = 'user';
    c.textContent = 'C';
    setElementTop(c, 200);
    main.appendChild(c);

    await internal.navigateToNextNode();

    expect(internal.markers).toHaveLength(3);
    expect(internal.activeTurnId).toBe(internal.markers[2]!.id);
  });

  it('does not enqueue navigation beyond boundaries when no refresh is needed', () => {
    const main = document.createElement('main');
    document.body.appendChild(main);

    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    scrollContainer.scrollTop = 0;
    vi.spyOn(scrollContainer, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    } as DOMRect);
    main.appendChild(scrollContainer);

    const container = document.createElement('div');
    scrollContainer.appendChild(container);

    const a = document.createElement('div');
    a.className = 'user';
    a.textContent = 'A';
    setElementTop(a, 0);
    container.appendChild(a);

    const b = document.createElement('div');
    b.className = 'user';
    b.textContent = 'B';
    setElementTop(b, 100);
    container.appendChild(b);

    const timelineBar = document.createElement('div');
    const trackContent = document.createElement('div');
    timelineBar.appendChild(trackContent);
    document.body.appendChild(timelineBar);

    const manager = new TimelineManager();
    const internal = manager as unknown as {
      conversationContainer: HTMLElement | null;
      scrollContainer: HTMLElement | null;
      userTurnSelector: string | null;
      ui: { timelineBar: HTMLElement | null; trackContent: HTMLElement | null };
      scrollMode: 'flow' | 'jump';
      activeTurnId: string | null;
      markers: Array<{ id: string }>;
      navigationQueue: Array<'previous' | 'next'>;
      enqueueNavigation: (direction: 'previous' | 'next', isRepeat?: boolean) => void;
      recalculateAndRenderMarkers: () => void;
      smoothScrollTo: (target: HTMLElement, duration: number) => void;
      updateTimelineGeometry: () => void;
      updateIntersectionObserverTargetsFromMarkers: () => void;
      syncTimelineTrackToMain: () => void;
      updateVirtualRangeAndRender: () => void;
      updateActiveDotUI: () => void;
      scheduleScrollSync: () => void;
    };

    internal.conversationContainer = container;
    internal.scrollContainer = scrollContainer;
    internal.userTurnSelector = '.user';
    internal.ui.timelineBar = timelineBar;
    internal.ui.trackContent = trackContent;
    internal.scrollMode = 'jump';

    internal.updateTimelineGeometry = vi.fn();
    internal.updateIntersectionObserverTargetsFromMarkers = vi.fn();
    internal.syncTimelineTrackToMain = vi.fn();
    internal.updateVirtualRangeAndRender = vi.fn();
    internal.updateActiveDotUI = vi.fn();
    internal.scheduleScrollSync = vi.fn();
    internal.smoothScrollTo = vi.fn();

    internal.activeTurnId = null;
    internal.recalculateAndRenderMarkers();
    expect(internal.markers).toHaveLength(2);
    expect(internal.activeTurnId).toBe(internal.markers[1]!.id);

    internal.enqueueNavigation('next');
    expect(internal.navigationQueue).toHaveLength(0);
    expect(internal.smoothScrollTo).not.toHaveBeenCalled();

    internal.activeTurnId = internal.markers[0]!.id;
    internal.enqueueNavigation('previous');
    expect(internal.navigationQueue).toHaveLength(0);
    expect(internal.smoothScrollTo).not.toHaveBeenCalled();
  });
});
