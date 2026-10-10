import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineSlider } from '../TimelineSlider';

const sliders: TimelineSlider[] = [];

function fixture(contentHeight = 1000) {
  const bar = document.createElement('div');
  const track = bar.appendChild(document.createElement('div'));
  const slider = document.createElement('div');
  const handle = slider.appendChild(document.createElement('div'));
  document.body.append(bar, slider);
  Object.defineProperty(bar, 'clientHeight', { value: 400 });
  Object.defineProperty(handle, 'setPointerCapture', { value: vi.fn() });
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 24, 400));
  vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(new DOMRect(80, 160, 12, 22));
  const onScroll = vi.fn();
  const owner = new TimelineSlider(bar, track, slider, handle, {
    getLayout: () => ({ contentHeight, padding: 12, rtl: false }),
    onScroll,
  });
  sliders.push(owner);
  return { owner, bar, track, slider, handle, onScroll };
}

function pointer(type: string, clientY = 0) {
  return new MouseEvent(type, { bubbles: true, clientY });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  sliders.splice(0).forEach((slider) => slider.destroy());
  document.body.innerHTML = '';
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('TimelineSlider teardown', () => {
  it('stops an active drag without removing surfaces or responding to late pointer events', () => {
    const { owner, bar, track, slider, handle, onScroll } = fixture();
    owner.updateGeometry();
    handle.dispatchEvent(pointer('pointerdown', 160));
    window.dispatchEvent(pointer('pointermove', 239));
    expect(onScroll).toHaveBeenCalledOnce();
    expect(track.scrollTop).toBeGreaterThan(0);
    const scrollTop = track.scrollTop;
    const sliderStyle = slider.style.cssText;

    owner.destroy();
    handle.dispatchEvent(pointer('pointerdown', 160));
    window.dispatchEvent(pointer('pointermove', 310));
    window.dispatchEvent(pointer('pointerup'));
    window.dispatchEvent(pointer('pointercancel'));
    bar.dispatchEvent(pointer('pointerenter'));
    slider.dispatchEvent(pointer('pointerleave'));

    expect(track.scrollTop).toBe(scrollTop);
    expect(slider.style.cssText).toBe(sliderStyle);
    expect(onScroll).toHaveBeenCalledOnce();
    expect(bar.isConnected && slider.isConnected).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels a pending fade so destroy leaves the retained surface untouched', () => {
    const { owner, slider } = fixture(0);
    slider.dispatchEvent(pointer('pointerenter'));
    slider.dispatchEvent(pointer('pointerleave'));
    expect(slider.classList.contains('visible')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    owner.destroy();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(slider.classList.contains('visible')).toBe(true);
    expect(slider.isConnected).toBe(true);
  });
});
