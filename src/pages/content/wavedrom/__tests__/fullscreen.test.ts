import { describe, expect, it, vi } from 'vitest';

import { parseViewBoxSize, computeAutoFitScale } from '../fullscreen';
import { createWaveDromFixture } from './fixture';

const fixture = createWaveDromFixture();

describe('fullscreen overlay', () => {
  it('opens a modal with the supplied panel background colour', () => {
    fixture.fullscreen.open('<svg viewBox="0 0 100 50"><g/></svg>', '#1a1a1a');
    const card = document.querySelector('[data-testid="wavedrom-zoom-card"]') as HTMLElement;
    expect(card).not.toBeNull();
    // jsdom normalises #1a1a1a → rgb(26,26,26)
    expect(card.style.background).toBe('rgb(26, 26, 26)');
  });

  it('injects width/height 100% on SVG roots that carry a viewBox', () => {
    fixture.fullscreen.open(
      '<svg viewBox="0 0 800 200" width="800" height="200"><g/></svg>',
      '#f9fafb',
    );
    const svgEl = document.querySelector('[data-testid="wavedrom-zoom-card"] svg') as SVGSVGElement;
    expect(svgEl.getAttribute('width')).toBe('100%');
    expect(svgEl.getAttribute('height')).toBe('100%');
  });

  it('closes on ESC', () => {
    vi.useFakeTimers();
    fixture.fullscreen.open('<svg viewBox="0 0 50 50"><g/></svg>', '#f9fafb');
    // Flush the rAF that adds the 'visible' class.
    vi.runAllTimers();
    expect(document.querySelector('.gv-wavedrom-modal')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    // The modal removes itself after a 300 ms CSS transition.
    vi.advanceTimersByTime(400);
    expect(document.querySelector('.gv-wavedrom-modal')).toBeNull();
    vi.useRealTimers();
  });

  it('tears down completely when closed externally and can reopen', () => {
    fixture.fullscreen.open('<svg viewBox="0 0 50 50"><g/></svg>', '#f9fafb');
    expect(document.querySelector('.gv-wavedrom-modal')).not.toBeNull();
    fixture.fullscreen.close();
    expect(document.querySelector('.gv-wavedrom-modal')).toBeNull();
    // A fresh modal must open again without interference from stale listeners.
    fixture.fullscreen.open('<svg viewBox="0 0 50 50"><g/></svg>', '#f9fafb');
    expect(document.querySelector('.gv-wavedrom-modal')).not.toBeNull();
    fixture.fullscreen.close();
  });

  it('releases document-level listeners when closed via ESC', () => {
    vi.useFakeTimers();
    fixture.fullscreen.open('<svg viewBox="0 0 50 50"><g/></svg>', '#f9fafb');
    vi.runAllTimers();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    vi.advanceTimersByTime(400);
    // After the fade-out the modal is gone and pressing ESC again is a no-op
    // (no stale keydown handler, no re-added modal, no throw).
    expect(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }).not.toThrow();
    expect(document.querySelector('.gv-wavedrom-modal')).toBeNull();
    vi.useRealTimers();
  });

  it('does not let a stale close timer tear down a newly opened modal', () => {
    vi.useFakeTimers();
    fixture.fullscreen.open('<svg viewBox="0 0 50 50"><g/></svg>', '#f9fafb');
    vi.runAllTimers();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    fixture.fullscreen.close();
    fixture.fullscreen.open('<svg viewBox="0 0 100 50"><g/></svg>', '#f9fafb');
    vi.advanceTimersByTime(400);

    expect(document.querySelectorAll('.gv-wavedrom-modal')).toHaveLength(1);
    fixture.fullscreen.close();
  });
});

describe('parseViewBoxSize', () => {
  const makeSvg = (viewBox: string | null): SVGSVGElement => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    if (viewBox !== null) svg.setAttribute('viewBox', viewBox);
    return svg;
  };

  it('parses a 4-value viewBox into intrinsic size', () => {
    expect(parseViewBoxSize(makeSvg('0 0 800 200'))).toEqual({ w: 800, h: 200 });
  });

  it('returns null without a viewBox', () => {
    expect(parseViewBoxSize(makeSvg(null))).toBeNull();
  });

  it('returns null for degenerate viewBox values', () => {
    expect(parseViewBoxSize(makeSvg('0 0 0 200'))).toBeNull();
    expect(parseViewBoxSize(makeSvg('0 0 800 0'))).toBeNull();
    expect(parseViewBoxSize(makeSvg('0 0'))).toBeNull();
  });
});

describe('computeAutoFitScale', () => {
  it('fits a large diagram into the viewport', () => {
    // 1920 - 160 padding on each axis
    expect(computeAutoFitScale(2000, 1000, 1840, 1040)).toBeCloseTo(0.92);
  });

  it('clamps to the 10x maximum', () => {
    expect(computeAutoFitScale(100, 50, 1840, 1040)).toBe(10);
  });

  it('clamps to the 0.1x minimum', () => {
    expect(computeAutoFitScale(100000, 50000, 1840, 1040)).toBe(0.1);
  });

  it('returns 1 for unusable input', () => {
    expect(computeAutoFitScale(0, 100, 1840, 1040)).toBe(1);
    expect(computeAutoFitScale(100, 0, 1840, 1040)).toBe(1);
    expect(computeAutoFitScale(100, 100, 0, 1040)).toBe(1);
  });
});

describe('fullscreen SVG sizing and layout', () => {
  it('sizes the SVG from the viewBox before zooming (no 300x150 fallback)', () => {
    fixture.fullscreen.open(
      '<svg viewBox="0 0 800 200" width="100%" height="100%"><g/></svg>',
      '#f9fafb',
    );
    const svgEl = document.querySelector('[data-testid="wavedrom-zoom-card"] svg') as SVGSVGElement;
    // jsdom window is 1024×768; viewport after the 80px margin is 864×608.
    // fitScale = min(864/800, 608/200) = 1.08 → definite pixel box.
    expect(svgEl.style.width).toBe('864px');
    expect(svgEl.style.height).toBe('216px');
    fixture.fullscreen.close();
  });

  it('lays out overlay, toolbar and hint for both light and dark panels', () => {
    const themes = [
      ['#f9fafb', 'rgb(249, 250, 251)'],
      ['#1a1a1a', 'rgb(26, 26, 26)'],
    ] as const;
    for (const [bg, rgb] of themes) {
      fixture.fullscreen.open('<svg viewBox="0 0 100 50"><g/></svg>', bg);
      const modal = document.querySelector('.gv-wavedrom-modal') as HTMLElement;
      expect(modal).not.toBeNull();
      // Toolbar holds the four zoom/close controls.
      const toolbar = modal.querySelector('.gv-wavedrom-modal-toolbar') as HTMLElement;
      expect(toolbar.querySelectorAll('button')).toHaveLength(4);
      // Card carries the panel backdrop.
      const card = modal.querySelector('[data-testid="wavedrom-zoom-card"]') as HTMLElement;
      expect(card.style.background).toBe(rgb);
      expect(modal.querySelector('.gv-wavedrom-modal-hint')).not.toBeNull();
      fixture.fullscreen.close();
    }
  });

  it('injects centered overlay CSS shared by both themes', async () => {
    // Drive the real render path so the shared styles are injected once.
    const codeBlock = document.createElement('code-block');
    const decoration = document.createElement('div');
    decoration.className = 'code-block-decoration';
    const span = document.createElement('span');
    span.textContent = 'wavedrom';
    decoration.appendChild(span);
    const codeEl = document.createElement('code');
    codeEl.setAttribute('data-test-id', 'code-content');
    codeEl.textContent = '{"signal": [{"name":"clk","wave":"p..."}]}';
    codeBlock.append(decoration, codeEl);
    document.body.appendChild(codeBlock);

    fixture.blocks.process();
    await vi.waitFor(() => {
      expect(document.querySelector('.gv-wavedrom-diagram')).not.toBeNull();
    });

    const styleEl = document.getElementById('gv-wavedrom-styles') as HTMLStyleElement;
    expect(styleEl).not.toBeNull();
    expect(styleEl.textContent).toContain('align-items: center');
    expect(styleEl.textContent).toContain('justify-content: center');
  });
});
