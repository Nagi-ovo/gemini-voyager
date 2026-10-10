import { describe, expect, it, vi } from 'vitest';

import { createSlashPreview } from '../slashPreview';
import {
  createPreviewTargets,
  setRect,
  prompts,
  useSlashTestHarness,
} from './slashPromptTestHarness';

describe('slashPreview', () => {
  const track = useSlashTestHarness();

  it('keeps result previews above the completion list instead of flipping sides', () => {
    const { root, option } = createPreviewTargets();
    const preview = track(
      createSlashPreview({ scheme: () => 'light', resultList: root, onValuesEdited: () => {} }),
    );
    preview.bind(option, prompts[0].text);
    setRect(root, {
      left: 220,
      top: 500,
      right: 600,
      bottom: 650,
      width: 380,
      height: 150,
    });

    // The first hover creates the shared tooltip; the second uses its measured
    // size and verifies the stable above-list placement.
    option.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.getElementById('gv-pm-slash-tooltip')!;
    setRect(tooltip, { width: 320, height: 220 });
    option.dispatchEvent(new MouseEvent('mouseenter'));

    expect(tooltip.style.left).toBe('220px');
    expect(tooltip.style.top).toBe('274px');
  });

  it('hangs a composer token preview from the token, above it', () => {
    // The card is up to 420px wide and the token is a short name. Aligning the
    // card's right edge to the token's put the whole card off to the left with
    // only its bottom-right corner near the thing it described, reading as
    // loose over the sidebar rather than as belonging to the token.
    const { root, token } = createPreviewTargets();
    const preview = track(
      createSlashPreview({ scheme: () => 'light', resultList: root, onValuesEdited: () => {} }),
    );
    preview.bind(token, prompts[0].text);

    // The first hover creates the shared tooltip; the second uses its size.
    token.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.getElementById('gv-pm-slash-tooltip')!;
    setRect(tooltip, { width: 420, height: 320 });
    // A token sitting in the composer, near the bottom of the viewport.
    setRect(token, { left: 200, right: 280, top: 700, bottom: 730, width: 80, height: 30 });
    token.dispatchEvent(new MouseEvent('mouseenter'));

    // Centred over the token, and above it rather than below: the composer is
    // pinned to the bottom of the viewport, so below never fits.
    expect(tooltip.style.left).toBe('30px');
    expect(tooltip.style.top).toBe('374px');
  });

  it('keeps a composer token preview inside the viewport', () => {
    const { root, token } = createPreviewTargets();
    const preview = track(
      createSlashPreview({ scheme: () => 'light', resultList: root, onValuesEdited: () => {} }),
    );
    preview.bind(token, prompts[0].text);

    token.dispatchEvent(new MouseEvent('mouseenter'));
    const tooltip = document.getElementById('gv-pm-slash-tooltip')!;
    setRect(tooltip, { width: 420, height: 320 });
    // Far enough right that left-aligning would run the card off the edge.
    setRect(token, {
      left: window.innerWidth - 60,
      right: window.innerWidth,
      top: 700,
      bottom: 730,
      width: 60,
      height: 30,
    });
    token.dispatchEvent(new MouseEvent('mouseenter'));

    expect(Number.parseInt(tooltip.style.left, 10)).toBe(window.innerWidth - 8 - 420);
  });

  it('keeps a long prompt tooltip open while the pointer moves onto and scrolls it', () => {
    const hideGraceMs = 151;
    vi.useFakeTimers();
    try {
      const longText = Array.from({ length: 20 }, () => prompts[1].text).join('\n');
      const { root, token: marker } = createPreviewTargets();
      const preview = track(
        createSlashPreview({ scheme: () => 'light', resultList: root, onValuesEdited: () => {} }),
      );
      preview.bind(marker, longText);
      marker.dispatchEvent(new MouseEvent('mouseenter'));
      const tooltip = document.getElementById('gv-pm-slash-tooltip')!;
      marker.dispatchEvent(new MouseEvent('mouseleave'));
      tooltip.dispatchEvent(new MouseEvent('mouseenter'));
      vi.advanceTimersByTime(hideGraceMs);

      expect(tooltip.classList.contains('gv-pm-slash-tooltip-visible')).toBe(true);
      tooltip.scrollTop = 120;
      expect(tooltip.scrollTop).toBe(120);
      tooltip.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true }));
      expect(tooltip.classList.contains('gv-pm-slash-tooltip-visible')).toBe(true);

      tooltip.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(hideGraceMs);
      expect(tooltip.classList.contains('gv-pm-slash-tooltip-visible')).toBe(false);
    } finally {
      vi.runOnlyPendingTimers();
      vi.useRealTimers();
    }
  });
});
