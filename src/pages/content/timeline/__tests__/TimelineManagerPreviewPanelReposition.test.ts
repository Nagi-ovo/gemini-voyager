import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

type PreviewPanelLike = {
  reposition: () => void;
  destroy: () => void;
};

type TimelineManagerInternal = {
  ui: { timelineBar: HTMLElement | null };
  previewPanel: PreviewPanelLike | null;
  applyPosition: (top: number, left: number) => void;
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
    internal.previewPanel = { reposition, destroy: vi.fn() };

    internal.applyPosition(120, 260);

    expect(timelineBar.style.top).toBe('120px');
    expect(timelineBar.style.left).toBe('260px');
    expect(reposition).toHaveBeenCalledTimes(1);

    manager.destroy();
  });
});
