import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineRailPlacement } from '../TimelineRailPlacement';

const placements: TimelineRailPlacement[] = [];

function fixture() {
  const bar = document.createElement('div');
  document.body.appendChild(bar);
  Object.defineProperty(bar, 'setPointerCapture', { value: vi.fn() });
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue(new DOMRect(100, 50, 24, 400));
  const onWidthChange = vi.fn();
  const onPositionRestore = vi.fn();
  const owner = new TimelineRailPlacement({
    getStyle: () => 'dots',
    onWidthChange,
    onPositionRestore,
  });
  placements.push(owner);
  owner.mount(bar);
  owner.toggleDraggable(true);
  return { owner, bar, onWidthChange, onPositionRestore };
}

function pointer(type: string, clientX = 0, clientY = 0) {
  return new MouseEvent(type, { bubbles: true, clientX, clientY });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  placements.splice(0).forEach((placement) => placement.destroy());
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('TimelineRailPlacement teardown', () => {
  it.each([
    { gesture: 'resize', startX: 110 },
    { gesture: 'position drag', startX: 101 },
  ])('abandons an active $gesture without saving or handling late pointer events', ({ startX }) => {
    const { owner, bar, onWidthChange } = fixture();
    bar.dispatchEvent(pointer('pointerdown', startX, 50));
    window.dispatchEvent(pointer('pointermove', 122, 80));
    if (startX === 110) expect(onWidthChange).toHaveBeenCalledOnce();
    else expect(bar.style.left).toBe('121px');
    const width = owner.barWidth;
    const style = bar.style.cssText;
    const widthChanges = onWidthChange.mock.calls.length;

    owner.destroy();
    window.dispatchEvent(pointer('pointermove', 200, 150));
    window.dispatchEvent(pointer('pointerup'));
    window.dispatchEvent(pointer('pointercancel'));
    bar.dispatchEvent(pointer('pointerdown', startX, 50));
    window.dispatchEvent(pointer('pointermove', 300, 180));
    window.dispatchEvent(pointer('pointerup'));

    expect(owner.barWidth).toBe(width);
    expect(bar.style.cssText).toBe(style);
    expect(onWidthChange).toHaveBeenCalledTimes(widthChanges);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    expect(bar.isConnected).toBe(true);
  });
});

describe('TimelineRailPlacement persisted restoration', () => {
  it('keeps the current width when a stored value is outside its valid range', () => {
    const { owner } = fixture();
    owner.restoreWidth(20);
    for (const value of [NaN, 3, 25, '12', null]) owner.restoreWidth(value);
    expect(owner.barWidth).toBe(20);
  });

  it('clamps a legacy position on screen while migrating its original coordinates', () => {
    const { owner, bar, onPositionRestore } = fixture();
    owner.restorePosition({ top: -20, left: 2000 });

    expect(bar.style.top).toBe('10px');
    expect(bar.style.left).toBe(`${window.innerWidth - 24 - 10}px`);
    const migrated = {
      version: 2,
      topPercent: (-20 / window.innerHeight) * 100,
      leftPercent: (2000 / window.innerWidth) * 100,
    };
    expect(owner.savedPosition).toEqual(migrated);
    expect(chrome.storage.sync.set).toHaveBeenCalledWith({ geminiTimelinePosition: migrated });
    expect(onPositionRestore).toHaveBeenCalledOnce();

    vi.mocked(chrome.storage.sync.set).mockClear();
    owner.restorePosition({ version: 2, topPercent: 25, leftPercent: 50 });
    expect(bar.style.top).toBe(`${window.innerHeight * 0.25}px`);
    expect(bar.style.left).toBe(`${window.innerWidth * 0.5}px`);
    expect(chrome.storage.sync.set).not.toHaveBeenCalled();
    owner.updateSavedPosition(null);
    expect(owner.savedPosition).toBeNull();
    expect(bar.style.top).toBe('');
    expect(bar.style.left).toBe('');
  });
});
