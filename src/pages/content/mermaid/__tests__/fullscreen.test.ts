import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openFullscreen } from '../fullscreen';

describe('Mermaid fullscreen interactions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
  });
  afterEach(() => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.runAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fits, zooms, pans, resets and ignores document drags after close', () => {
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(2000);
    vi.spyOn(Element.prototype, 'scrollHeight', 'get').mockReturnValue(1000);
    openFullscreen('<svg><text>Diagram</text></svg>');
    const modal = document.querySelector<HTMLElement>('.gv-mermaid-modal')!;
    const content = modal.querySelector<HTMLElement>('.gv-mermaid-modal-content')!;
    const fit = Math.min((window.innerWidth - 160) / 2000, (window.innerHeight - 160) / 1000);
    expect(content.style.transform).toBe(`translate(0px, 0px) scale(${fit})`);
    modal.querySelector<HTMLButtonElement>('[title="Zoom In"]')!.click();
    expect(content.style.transform).toBe(`translate(0px, 0px) scale(${fit * 1.2})`);
    modal.querySelector<HTMLButtonElement>('[title="Zoom Out"]')!.click();
    expect(content.style.transform).toBe(`translate(0px, 0px) scale(${fit})`);
    const wheel = new WheelEvent('wheel', { deltaY: -1, cancelable: true });
    modal.dispatchEvent(wheel);
    expect(wheel.defaultPrevented).toBe(true);
    expect(content.style.transform).toBe(`translate(0px, 0px) scale(${fit * 1.1})`);

    content.dispatchEvent(new MouseEvent('mousedown', { clientX: 10, clientY: 20 }));
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 50, clientY: 70 }));
    expect(content.style.transform).toBe(`translate(40px, 50px) scale(${fit * 1.1})`);
    expect(content.classList.contains('dragging')).toBe(true);
    document.dispatchEvent(new MouseEvent('mouseup'));
    expect(content.classList.contains('dragging')).toBe(false);
    modal.querySelector<HTMLButtonElement>('[title="Reset"]')!.click();
    expect(content.style.transform).toBe(`translate(0px, 0px) scale(${fit})`);

    content.dispatchEvent(new MouseEvent('mousedown', { clientX: 0, clientY: 0 }));
    modal.click();
    document.dispatchEvent(new MouseEvent('mousemove', { clientX: 90, clientY: 90 }));
    expect(content.style.transform).toBe(`translate(0px, 0px) scale(${fit})`);
    expect(content.classList.contains('dragging')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(document.querySelector('.gv-mermaid-modal')).toBeNull();
  });

  it('bounds wheel zoom and allows one viewer until the close animation finishes', () => {
    openFullscreen('<svg/>');
    openFullscreen('<svg/>');
    expect(document.querySelectorAll('.gv-mermaid-modal')).toHaveLength(1);
    const modal = document.querySelector<HTMLElement>('.gv-mermaid-modal')!;
    const content = modal.querySelector<HTMLElement>('.gv-mermaid-modal-content')!;
    for (let i = 0; i < 100; i++) modal.dispatchEvent(new WheelEvent('wheel', { deltaY: -1 }));
    expect(content.style.transform).toBe('translate(0px, 0px) scale(10)');
    for (let i = 0; i < 100; i++) modal.dispatchEvent(new WheelEvent('wheel', { deltaY: 1 }));
    expect(content.style.transform).toBe('translate(0px, 0px) scale(0.1)');
    vi.advanceTimersToNextFrame();
    expect(modal.classList.contains('visible')).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(modal.classList.contains('visible')).toBe(false);
    openFullscreen('<svg/>');
    expect(document.querySelectorAll('.gv-mermaid-modal')).toHaveLength(1);
    vi.advanceTimersByTime(300);
    openFullscreen('<svg><text>New</text></svg>');
    expect(document.querySelector('.gv-mermaid-modal-content')?.textContent).toBe('New');
  });
});
