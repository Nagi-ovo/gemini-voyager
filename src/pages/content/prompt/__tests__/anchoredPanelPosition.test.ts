import { afterEach, describe, expect, it, vi } from 'vitest';

import { computeAnchoredPosition } from '../anchoredPanelPosition';

const originalWidth = window.innerWidth;
const originalHeight = window.innerHeight;

function setViewport(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}

function boxWithRect(rect: DOMRect): HTMLElement {
  const element = document.createElement('div');
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(rect);
  return element;
}

/** The ball at its default spot, 18px in from the bottom-right corner. */
function cornerTrigger(): HTMLElement {
  return boxWithRect(
    new DOMRect(window.innerWidth - 18 - 46, window.innerHeight - 18 - 46, 46, 46),
  );
}

describe('anchored Prompt Manager panel position', () => {
  afterEach(() => {
    setViewport(originalWidth, originalHeight);
    vi.restoreAllMocks();
  });

  it('keeps a 440px panel inside a 967px window when the ball sits in the corner', () => {
    setViewport(967, 900);
    // 440px of CSS width plus a 1px border on each side.
    const panel = boxWithRect(new DOMRect(0, 0, 442, 600));

    const { left, top } = computeAnchoredPosition(cornerTrigger(), panel);

    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 442).toBeLessThanOrEqual(967 - 8);
    // Still opens above the ball rather than over it.
    expect(top + 600).toBeLessThanOrEqual(900 - 18 - 46);
  });

  it('keeps a panel that fills a narrow window inside its left edge', () => {
    setViewport(400, 700);
    // `max-width: calc(100vw - 20px)` leaves the panel 380px wide.
    const panel = boxWithRect(new DOMRect(0, 0, 380, 500));

    const { left } = computeAnchoredPosition(cornerTrigger(), panel);

    expect(left).toBeGreaterThanOrEqual(8);
    expect(left + 380).toBeLessThanOrEqual(400);
  });

  it('aligns the right edges when there is room', () => {
    setViewport(1440, 900);
    const trigger = boxWithRect(new DOMRect(1000, 800, 46, 46));
    const panel = boxWithRect(new DOMRect(0, 0, 442, 600));

    const { left } = computeAnchoredPosition(trigger, panel);

    expect(left + 442).toBe(1046);
  });
});
