import { describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

describe('TimelineManager active marker', () => {
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
});
