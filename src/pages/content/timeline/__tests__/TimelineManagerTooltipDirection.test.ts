import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';
import type { DotElement } from '../types';

type TimelineManagerInternal = {
  ui: { tooltip: HTMLElement | null };
  previewPanel: { isOpen: boolean } | null;
  starred: Set<string>;
  computePlacementInfo: (dot: HTMLElement) => { placement: 'left' | 'right'; width: number };
  truncateToThreeLines: (text: string, targetWidth: number) => { text: string; height: number };
  placeTooltipAt: (
    dot: HTMLElement,
    placement: 'left' | 'right',
    width: number,
    height: number,
  ) => void;
  showTooltipForDot: (dot: DotElement) => void;
};

describe('TimelineManager tooltip direction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('sets tooltip dir to auto when showing preview text', () => {
    const manager = new TimelineManager();
    const internal = manager as unknown as TimelineManagerInternal;

    const tooltip = document.createElement('div');
    tooltip.className = 'timeline-tooltip';
    document.body.appendChild(tooltip);
    internal.ui.tooltip = tooltip;
    internal.previewPanel = null;
    internal.starred = new Set<string>();
    internal.computePlacementInfo = vi.fn(() => ({ placement: 'left' as const, width: 240 }));
    internal.truncateToThreeLines = vi.fn((text: string) => ({ text, height: 36 }));
    internal.placeTooltipAt = vi.fn();

    const dot = document.createElement('button') as DotElement;
    dot.className = 'timeline-dot';
    dot.setAttribute('aria-label', 'مرحبا بالعالم');
    dot.dataset.targetTurnId = 'turn-1';
    document.body.appendChild(dot);

    internal.showTooltipForDot(dot);

    expect(tooltip.getAttribute('dir')).toBe('auto');
    manager.destroy();
  });
});
