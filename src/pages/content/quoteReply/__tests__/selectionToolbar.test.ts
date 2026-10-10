import { expect, it, vi } from 'vitest';

import { createHighlightColorPicker } from '../highlightColorPicker';
import { createSelectionToolbar } from '../selectionToolbar';

it('tracks the first selected line, hides offscreen and cancels geometry work on teardown', () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<p>Hello</p>';
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('p')!);
  const rect = { top: 200, bottom: 400, left: 100, width: 100, height: 200 };
  const measureRange = vi.fn(() => rect as DOMRect);
  range.getBoundingClientRect = measureRange;
  range.getClientRects = () =>
    [{ ...rect, top: 210, bottom: 220, height: 10 }] as unknown as DOMRectList;
  const picker = createHighlightColorPicker(
    {},
    {
      onInternalClick: vi.fn(),
      restoreSelection: vi.fn(),
      onPaletteChange: vi.fn(),
    },
  );
  const toolbar = createSelectionToolbar(true, picker, {
    onInternalClick: vi.fn(),
    onQuote: vi.fn(),
    onHighlight: vi.fn(async () => {}),
  });
  try {
    toolbar.show(range, false);
    const element = document.querySelector<HTMLElement>('.gv-selection-toolbar')!;
    const measureToolbar = vi
      .spyOn(element, 'getBoundingClientRect')
      .mockReturnValue({ width: 80, height: 30 } as DOMRect);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
    expect(element.style.top).toBe('164px');
    expect(element.style.left).toBe('110px');
    rect.top = window.innerHeight + 1;
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(element.classList.contains('gv-hidden')).toBe(true);
    rect.top = 200;
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(20);
    expect(element.classList.contains('gv-hidden')).toBe(false);
    window.dispatchEvent(new Event('scroll'));
    toolbar.destroy();
    measureRange.mockClear();
    measureToolbar.mockClear();
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(20);
    expect(measureRange).not.toHaveBeenCalled();
    expect(measureToolbar).not.toHaveBeenCalled();
    expect(document.querySelector('.gv-selection-toolbar')).toBeNull();
    expect(document.getElementById('gemini-voyager-quote-reply-style')).toBeNull();
  } finally {
    toolbar.destroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
    document.body.replaceChildren();
  }
});
