import { describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

describe('TimelineManager active marker', () => {
  it('starts with the thinnest visual bar width for users without a saved width', () => {
    const manager = new TimelineManager();
    const bar = document.createElement('div');
    const internal = manager as unknown as {
      barWidth: number;
      barWidthMin: number;
      ui: { timelineBar: HTMLElement | null };
      applyContainerVisibility: () => void;
    };

    internal.ui.timelineBar = bar;
    internal.applyContainerVisibility();

    expect(internal.barWidth).toBe(internal.barWidthMin);
    expect(bar.style.getPropertyValue('--timeline-bar-width')).toBe('4px');
  });

  it('uses cached marker tops when available', () => {
    const manager = new TimelineManager();

    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    scrollContainer.scrollTop = 0;

    const elements = [
      document.createElement('div'),
      document.createElement('div'),
      document.createElement('div'),
    ];
    const rectSpies = elements.map((el) => vi.spyOn(el, 'getBoundingClientRect'));

    const markers = elements.map((element, index) => ({
      id: `m${index}`,
      element,
      summary: '',
      n: 0,
      baseN: 0,
      dotElement: null,
      starred: false,
    }));

    const internal = manager as unknown as {
      scrollContainer: HTMLElement | null;
      markers: typeof markers;
      markerTops: number[];
      activeTurnId: string | null;
      computeActiveByScroll: () => void;
    };

    internal.scrollContainer = scrollContainer;
    internal.markers = markers;
    internal.markerTops = [0, 100, 200];
    internal.activeTurnId = null;

    internal.computeActiveByScroll();

    expect(internal.activeTurnId).toBe('m1');
    rectSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it('keeps the navigated marker active during the post-scroll lock', () => {
    const manager = new TimelineManager();

    const scrollContainer = document.createElement('div');
    Object.defineProperty(scrollContainer, 'clientHeight', { value: 400, configurable: true });
    scrollContainer.scrollTop = 0;

    const markers = ['m0', 'm1', 'm2'].map((id) => ({
      id,
      element: document.createElement('div'),
      summary: '',
      n: 0,
      baseN: 0,
      dotElement: null,
      starred: false,
    }));

    const internal = manager as unknown as {
      scrollContainer: HTMLElement | null;
      markers: typeof markers;
      markerTops: number[];
      activeTurnId: string | null;
      navigationActiveLockUntil: number;
      computeActiveByScroll: () => void;
    };

    internal.scrollContainer = scrollContainer;
    internal.markers = markers;
    internal.markerTops = [0, 100, 200];
    internal.activeTurnId = 'm0';
    internal.navigationActiveLockUntil = Date.now() + 900;

    internal.computeActiveByScroll();

    expect(internal.activeTurnId).toBe('m0');
  });
});
