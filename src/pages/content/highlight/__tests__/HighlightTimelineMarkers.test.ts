import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HighlightTimelineMarkers } from '../HighlightTimelineMarkers';
import { installConversation, makeRecord } from './fixtures';

const FIRST_TURN = 's-1111111111111111';
const SECOND_TURN = 's-2222222222222222';

function rect(element: Element, top: number, height: number): void {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, top, 24, height));
}

describe('HighlightTimelineMarkers', () => {
  let markers: HighlightTimelineMarkers;
  let bar: HTMLElement;
  let track: HTMLElement;
  let scrollContainer: HTMLElement;
  let firstTurn: HTMLElement;
  let mark: HTMLElement;
  const navigate = vi.fn<(id: string) => void>();

  /** Adds a rendered timeline marker whose centre sits at `center` in viewport coordinates. */
  function addDot(turnId: string, index: number, center: number): HTMLElement {
    const dot = document.createElement('button');
    dot.className = 'timeline-dot';
    dot.dataset.targetTurnId = turnId;
    dot.dataset.markerIndex = String(index);
    rect(dot, center - 4, 8);
    track.appendChild(dot);
    return dot;
  }

  function tick(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('.gv-highlight-timeline-tick');
  }

  beforeEach(() => {
    vi.useFakeTimers();
    navigate.mockReset();
    const response = installConversation();
    response.innerHTML = '<mark class="gv-highlight-mark">target</mark>';
    mark = response.querySelector<HTMLElement>('mark')!;
    firstTurn = document.querySelector<HTMLElement>('.conversation-container')!;
    const secondTurn = document.createElement('div');
    secondTurn.className = 'conversation-container';
    secondTurn.id = '2222222222222222';
    firstTurn.after(secondTurn);

    scrollContainer = document.querySelector<HTMLElement>('main')!;
    scrollContainer.style.overflowY = 'auto';
    scrollContainer.scrollTop = 250;
    Object.defineProperty(scrollContainer, 'scrollHeight', { value: 2000 });
    rect(scrollContainer, 100, 500);
    rect(mark, 350, 20);
    rect(firstTurn, 150, 400);
    rect(secondTurn, 550, 100);
    bar = document.querySelector<HTMLElement>('.gemini-timeline-bar')!;
    track = document.querySelector<HTMLElement>('.timeline-track-content')!;
    Object.defineProperty(track, 'scrollHeight', { value: 800 });
    Object.defineProperty(bar, 'clientHeight', { value: 200 });
    rect(bar, 50, 600);
    rect(track, 60, 580);

    const record = makeRecord({
      quote: { exact: 'target', prefix: '', suffix: '' },
      position: { start: 0, end: 6 },
      sourceTextHash: 'source',
    });
    markers = new HighlightTimelineMarkers(
      new Map([[record.id, record]]),
      new Map([[record.id, [mark]]]),
      navigate,
    );
    markers.start();
  });

  afterEach(() => {
    markers.destroy();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it("a highlight in a ruler timeline sits beside its turn's marker", () => {
    bar.classList.add('gv-timeline-style-ruler');
    addDot(FIRST_TURN, 0, 340);
    markers.render();

    expect(tick()?.parentElement).toBe(track);
    expect(tick()?.style.top).toBe('280px');
    tick()!.click();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('highlight-1');
  });

  it("a highlight midway through a turn sits midway between its turn's marker and the next", () => {
    addDot(FIRST_TURN, 0, 100);
    addDot(SECOND_TURN, 1, 140);
    markers.render();

    // The mark starts 200px into a 400px turn.
    expect(tick()?.parentElement).toBe(track);
    expect(tick()?.style.top).toBe('60px');
  });

  it("a compact highlight follows its turn's marker on the bar and keeps navigating", async () => {
    addDot(FIRST_TURN, 0, 300);
    markers.render();
    bar.classList.add('timeline-style-compact');
    await vi.advanceTimersByTimeAsync(0);

    expect(tick()?.parentElement).toBe(bar);
    expect(tick()?.style.top).toBe('250px');
    tick()!.click();
    expect(navigate).toHaveBeenCalledExactlyOnceWith('highlight-1');
  });

  it('a highlight whose turn has no rendered marker keeps its proportional place in the classic timeline', () => {
    markers.render();
    expect(tick()?.parentElement).toBe(track);
    expect(tick()?.style.top).toBe('200px');
  });

  it('a highlight in a turn the ruler leaves unmarked sits between the markers around it', () => {
    bar.classList.add('gv-timeline-style-ruler');
    const earlierTurn = document.createElement('div');
    earlierTurn.className = 'conversation-container';
    earlierTurn.id = '0000000000000000';
    firstTurn.before(earlierTurn);
    rect(earlierTurn, 50, 100);
    addDot('s-0000000000000000', 0, 100);
    addDot(SECOND_TURN, 1, 200);
    markers.render();

    // The mark is 300px into the 500px from the earlier marked turn to the next one.
    expect(tick()?.style.top).toBe('100px');
  });

  it('cancels a scheduled position update and releases viewport listeners on destruction', async () => {
    markers.render();
    window.dispatchEvent(new Event('resize'));
    markers.destroy();
    await vi.advanceTimersByTimeAsync(20);
    expect(tick()).toBeNull();

    const requestFrame = vi.spyOn(window, 'requestAnimationFrame');
    window.dispatchEvent(new Event('resize'));
    scrollContainer.dispatchEvent(new Event('scroll'));
    bar.classList.add('timeline-style-compact');
    await vi.advanceTimersByTimeAsync(20);

    expect(requestFrame).not.toHaveBeenCalled();
    expect(tick()).toBeNull();
  });
});
