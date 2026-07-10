import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

type PreviewPanelLike = {
  reposition: () => void;
  setCompactMode: (compact: boolean) => void;
  destroy: () => void;
};

type TimelineManagerInternal = {
  ui: {
    timelineBar: HTMLElement | null;
    tooltip?: HTMLElement | null;
    track?: HTMLElement | null;
    slider?: HTMLElement | null;
  };
  previewPanel: PreviewPanelLike | null;
  markers: Array<Record<string, unknown>>;
  timelineStyle: 'dots' | 'compact';
  applyPosition: (top: number, left: number) => void;
  applyTimelineStyle: () => void;
  buildCompactMarkerOffsets: (hiddenIndices: ReadonlySet<number>) => Map<number, number>;
};

describe('TimelineManager preview panel reposition', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('repositions preview toggle when timeline position is applied', () => {
    const manager = new TimelineManager();
    const internal = manager as unknown as TimelineManagerInternal;

    const timelineBar = document.createElement('div');
    Object.defineProperty(timelineBar, 'offsetWidth', { value: 24, configurable: true });
    Object.defineProperty(timelineBar, 'offsetHeight', { value: 100, configurable: true });
    document.body.appendChild(timelineBar);
    internal.ui.timelineBar = timelineBar;

    const reposition = vi.fn();
    internal.previewPanel = { reposition, setCompactMode: vi.fn(), destroy: vi.fn() };

    internal.applyPosition(120, 260);

    expect(timelineBar.style.top).toBe('120px');
    expect(timelineBar.style.left).toBe('260px');
    expect(reposition).toHaveBeenCalledTimes(1);

    manager.destroy();
  });

  it('applies compact rail semantics and preview interaction mode', () => {
    const manager = new TimelineManager();
    const internal = manager as unknown as TimelineManagerInternal;
    const timelineBar = document.createElement('div');
    const track = document.createElement('div');
    const slider = document.createElement('div');
    timelineBar.appendChild(track);
    document.body.append(timelineBar, slider);

    const setCompactMode = vi.fn();
    internal.ui.timelineBar = timelineBar;
    internal.ui.track = track;
    internal.ui.slider = slider;
    internal.previewPanel = { reposition: vi.fn(), setCompactMode, destroy: vi.fn() };
    internal.timelineStyle = 'compact';

    internal.applyTimelineStyle();

    expect(timelineBar.classList.contains('timeline-style-compact')).toBe(true);
    expect(slider.classList.contains('timeline-style-compact')).toBe(true);
    expect(track.getAttribute('aria-hidden')).toBe('true');
    expect(setCompactMode).toHaveBeenCalledWith(true);

    internal.timelineStyle = 'dots';
    internal.applyTimelineStyle();
    expect(timelineBar.classList.contains('timeline-style-compact')).toBe(false);
    expect(track.hasAttribute('aria-hidden')).toBe(false);
    expect(setCompactMode).toHaveBeenLastCalledWith(false);

    manager.destroy();
  });

  it('clusters sparse markers around the center at a fixed compact gap', () => {
    const manager = new TimelineManager();
    const internal = manager as unknown as TimelineManagerInternal;
    internal.markers = [{}, {}, {}];

    const offsets = internal.buildCompactMarkerOffsets(new Set());

    expect(offsets.get(0)).toBe(-10);
    expect(offsets.get(1)).toBe(0);
    expect(offsets.get(2)).toBe(10);

    manager.destroy();
  });
});
