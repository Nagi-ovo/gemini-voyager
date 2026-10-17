import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualEffectRenderer } from '../types';

let renderers: VisualEffectRenderer[] = [];

describe('rainEffect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    const mockCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      ellipse: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      lineCap: 'butt',
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    for (const renderer of renderers) renderer.destroy();
    renderers = [];
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('creates a non-interactive fullscreen canvas', async () => {
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-rain-effect-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
    expect(canvas?.style.pointerEvents).toBe('none');
    expect(canvas?.style.position).toBe('fixed');
  });

  it('does not animate in a hidden tab and resumes when visible', async () => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    const requestFrame = vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(requestFrame).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(requestFrame).toHaveBeenCalledOnce();
  });

  it('does not create a canvas before selection', async () => {
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);

    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();
  });

  it('keeps the canvas while particles drain', async () => {
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    // Canvas persists during drain
    renderer.drain();

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();
  });

  it('creates a canvas only after selection', async () => {
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);

    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();

    renderer.enable();

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();
  });

  it('cleans up on page teardown', async () => {
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    for (const renderer of renderers) renderer.destroy();
    renderers = [];

    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();
  });

  it('cleans up on page teardown even during drain', async () => {
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);
    renderer.enable();

    // Enter drain mode
    renderer.drain();
    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    // Page teardown bypasses the drain.
    for (const renderer of renderers) renderer.destroy();
    renderers = [];
    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();
  });

  it('resumes the same canvas when enabled during drain', async () => {
    const { createRainRenderer } = await import('../rain');
    const renderer = createRainRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-rain-effect-canvas');
    // Enter drain mode
    renderer.drain();
    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    // Re-enable — cancels drain, canvas stays
    renderer.enable();
    expect(document.getElementById('gv-rain-effect-canvas')).toBe(canvas);
    expect(document.querySelectorAll('#gv-rain-effect-canvas')).toHaveLength(1);
  });
});
