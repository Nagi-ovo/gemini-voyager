import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualEffectRenderer } from '../types';

let renderers: VisualEffectRenderer[] = [];

describe('snowEffect', () => {
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

    // Mock canvas context
    const mockCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      moveTo: vi.fn(),
      fillStyle: '',
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
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-snow-effect-canvas');
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
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
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

  it('repeated enable keeps one canvas', async () => {
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-snow-effect-canvas');
    renderer.enable();
    expect(document.getElementById('gv-snow-effect-canvas')).toBe(canvas);
    expect(document.querySelectorAll('#gv-snow-effect-canvas')).toHaveLength(1);
  });

  it('does not create canvas when disabled', async () => {
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);

    const canvas = document.getElementById('gv-snow-effect-canvas');
    expect(canvas).toBeNull();
  });

  it('keeps the canvas while particles drain', async () => {
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();

    // Disabling preserves the particles until they leave the viewport.
    renderer.drain();

    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();
  });

  it('creates a canvas only after selection', async () => {
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);

    expect(document.getElementById('gv-snow-effect-canvas')).toBeNull();

    // Selection starts the idle renderer.
    renderer.enable();

    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();
  });

  it('cleans up on page teardown', async () => {
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();

    for (const renderer of renderers) renderer.destroy();
    renderers = [];

    expect(document.getElementById('gv-snow-effect-canvas')).toBeNull();
  });

  it('cleans up on page teardown even during drain', async () => {
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);
    renderer.enable();

    // Enter drain mode
    renderer.drain();
    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();

    // Page teardown bypasses the drain.
    for (const renderer of renderers) renderer.destroy();
    renderers = [];
    expect(document.getElementById('gv-snow-effect-canvas')).toBeNull();
  });

  it('resumes the same canvas when enabled during drain', async () => {
    const { createSnowRenderer } = await import('../snow');
    const renderer = createSnowRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-snow-effect-canvas');
    // Enter drain mode
    renderer.drain();
    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();

    // Re-enable — cancels drain, canvas stays
    renderer.enable();
    expect(document.getElementById('gv-snow-effect-canvas')).toBe(canvas);
    expect(document.querySelectorAll('#gv-snow-effect-canvas')).toHaveLength(1);
  });
});
