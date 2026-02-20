import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';
import type { DotElement } from '../types';

type TimelineMarker = {
  id: string;
  element: HTMLElement;
  summary: string;
  n: number;
  baseN: number;
  dotElement: DotElement | null;
  starred: boolean;
};

describe('TimelineManager flow click highlight behavior', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('clears previous active highlight immediately when clicking another node in flow mode', () => {
    const manager = new TimelineManager();
    const timelineBar = document.createElement('div');
    document.body.appendChild(timelineBar);

    const scrollContainer = document.createElement('div');
    document.body.appendChild(scrollContainer);

    const firstTarget = document.createElement('div');
    const secondTarget = document.createElement('div');

    const firstDot = document.createElement('button') as DotElement;
    firstDot.className = 'timeline-dot';
    firstDot.dataset.targetTurnId = 'm0';
    firstDot.dataset.markerIndex = '0';

    const secondDot = document.createElement('button') as DotElement;
    secondDot.className = 'timeline-dot';
    secondDot.dataset.targetTurnId = 'm1';
    secondDot.dataset.markerIndex = '1';
    timelineBar.appendChild(secondDot);

    const markers: TimelineMarker[] = [
      {
        id: 'm0',
        element: firstTarget,
        summary: 'first',
        n: 0,
        baseN: 0,
        dotElement: firstDot,
        starred: false,
      },
      {
        id: 'm1',
        element: secondTarget,
        summary: 'second',
        n: 1,
        baseN: 1,
        dotElement: secondDot,
        starred: false,
      },
    ];

    const internal = manager as unknown as {
      ui: {
        timelineBar: HTMLElement | null;
        tooltip: HTMLElement | null;
        trackContent?: HTMLElement | null;
        slider: HTMLElement | null;
        sliderHandle: HTMLElement | null;
      };
      scrollContainer: HTMLElement | null;
      conversationContainer: HTMLElement | null;
      scrollMode: 'flow' | 'jump';
      markers: TimelineMarker[];
      activeTurnId: string | null;
      setupEventListeners: () => void;
      updateActiveDotUI: () => void;
      startRunner: (fromIdx: number, toIdx: number, duration: number) => void;
      smoothScrollTo: (targetElement: HTMLElement, duration: number) => void;
      computeFlowDuration: (fromIdx: number, toIdx: number) => number;
      userTurnSelector: string;
      recalculateAndRenderMarkers: () => void;
    };

    internal.ui.timelineBar = timelineBar;
    internal.ui.tooltip = null;
    internal.ui.slider = null;
    internal.ui.sliderHandle = null;
    internal.scrollContainer = scrollContainer;
    internal.conversationContainer = document.body;
    internal.scrollMode = 'flow';
    internal.markers = markers;
    internal.activeTurnId = 'm0';
    internal.updateActiveDotUI();

    expect(firstDot.classList.contains('active')).toBe(true);

    const startRunnerSpy = vi.fn();
    const smoothScrollSpy = vi.fn();
    const flowDurationSpy = vi.fn(() => 520);
    internal.startRunner = startRunnerSpy;
    internal.smoothScrollTo = smoothScrollSpy;
    internal.computeFlowDuration = flowDurationSpy;

    internal.setupEventListeners();
    secondDot.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(internal.activeTurnId).toBeNull();
    expect(firstDot.classList.contains('active')).toBe(false);
    expect(startRunnerSpy).toHaveBeenCalledWith(0, 1, 520);
    expect(smoothScrollSpy).toHaveBeenCalledWith(secondTarget, 520);

    manager.destroy();
  });

  it('refreshes stale markers before click navigation when target element is detached', () => {
    const manager = new TimelineManager();

    const timelineBar = document.createElement('div');
    const trackContent = document.createElement('div');
    timelineBar.appendChild(trackContent);
    document.body.appendChild(timelineBar);

    const staleScrollContainer = document.createElement('div');
    const staleConversationContainer = document.createElement('div');

    const main = document.createElement('main');
    const freshScrollContainer = document.createElement('div');
    freshScrollContainer.style.overflowY = 'auto';
    main.appendChild(freshScrollContainer);

    const freshTarget = document.createElement('div');
    freshTarget.className = 'user';
    freshTarget.dataset.turnId = 'm1';
    freshTarget.textContent = 'fresh target';
    freshScrollContainer.appendChild(freshTarget);
    document.body.appendChild(main);

    const staleTarget = document.createElement('div');
    staleTarget.dataset.turnId = 'm1';

    const dot = document.createElement('button') as DotElement;
    dot.className = 'timeline-dot';
    dot.dataset.targetTurnId = 'm1';
    dot.dataset.markerIndex = '0';
    timelineBar.appendChild(dot);

    const internal = manager as unknown as {
      ui: {
        timelineBar: HTMLElement | null;
        tooltip: HTMLElement | null;
        trackContent?: HTMLElement | null;
        slider: HTMLElement | null;
        sliderHandle: HTMLElement | null;
      };
      scrollContainer: HTMLElement | null;
      conversationContainer: HTMLElement | null;
      scrollMode: 'flow' | 'jump';
      markers: TimelineMarker[];
      activeTurnId: string | null;
      setupEventListeners: () => void;
      updateActiveDotUI: () => void;
      smoothScrollTo: (targetElement: HTMLElement, duration: number) => void;
      computeFlowDuration: (fromIdx: number, toIdx: number) => number;
      userTurnSelector: string;
      recalculateAndRenderMarkers: () => void;
    };

    internal.ui.timelineBar = timelineBar;
    internal.ui.tooltip = null;
    internal.ui.trackContent = trackContent;
    internal.ui.slider = null;
    internal.ui.sliderHandle = null;
    internal.scrollContainer = staleScrollContainer;
    internal.conversationContainer = staleConversationContainer;
    internal.scrollMode = 'jump';
    internal.userTurnSelector = '.user';
    internal.markers = [
      {
        id: 'm1',
        element: staleTarget,
        summary: 'stale',
        n: 0,
        baseN: 0,
        dotElement: dot,
        starred: false,
      },
    ];
    internal.activeTurnId = 'm1';
    internal.updateActiveDotUI();

    const smoothScrollSpy = vi.fn();
    const flowDurationSpy = vi.fn(() => 0);
    internal.smoothScrollTo = smoothScrollSpy;
    internal.computeFlowDuration = flowDurationSpy;

    const recalcSpy = vi.fn(() => {
      internal.markers = [
        {
          id: 'm1',
          element: freshTarget,
          summary: 'fresh',
          n: 0,
          baseN: 0,
          dotElement: dot,
          starred: false,
        },
      ];
    });
    internal.recalculateAndRenderMarkers = recalcSpy;

    internal.setupEventListeners();
    dot.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(recalcSpy).toHaveBeenCalledTimes(1);
    expect(smoothScrollSpy).toHaveBeenCalledWith(freshTarget, 0);

    manager.destroy();
  });
});
