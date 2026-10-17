import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { VisualEffectRenderer } from '../types';

let renderers: VisualEffectRenderer[] = [];

import { isFirefox } from '@/core/utils/browser';

vi.mock('@/core/utils/browser', () => ({
  isFirefox: vi.fn(() => false),
}));

type MockCanvasContext = {
  clearRect: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  moveTo: ReturnType<typeof vi.fn>;
  bezierCurveTo: ReturnType<typeof vi.fn>;
  quadraticCurveTo: ReturnType<typeof vi.fn>;
  closePath: ReturnType<typeof vi.fn>;
  fill: ReturnType<typeof vi.fn>;
  stroke: ReturnType<typeof vi.fn>;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  setTransform: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  globalAlpha: number;
};

class FakeMessagePort {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  start = vi.fn();
  close = vi.fn();

  emit(message: unknown): void {
    this.onmessage?.({ data: message } as MessageEvent);
  }
}

class FakeMessageChannel {
  static instances: FakeMessageChannel[] = [];

  readonly port1 = new FakeMessagePort();
  readonly port2 = new FakeMessagePort();

  constructor() {
    FakeMessageChannel.instances.push(this);
  }
}

describe('sakuraEffect', () => {
  let mockCtx: MockCanvasContext;
  let animationFrameCallback: FrameRequestCallback | null;

  function runAnimationFrame(time: number): void {
    const callback = animationFrameCallback;
    expect(callback).not.toBeNull();
    animationFrameCallback = null;
    callback?.(time);
  }

  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
    animationFrameCallback = null;
    FakeMessageChannel.instances = [];
    vi.mocked(isFirefox).mockReturnValue(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);

    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 1,
    });

    mockCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      setTransform: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      animationFrameCallback = callback;
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  afterEach(() => {
    for (const renderer of renderers) renderer.destroy();
    renderers = [];
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function installWorkerFrameHarness(): void {
    vi.stubGlobal('MessageChannel', FakeMessageChannel);
  }

  function connectWorkerFrame() {
    const frame = document.getElementById('gv-sakura-effect-frame') as HTMLIFrameElement | null;
    expect(frame).not.toBeNull();
    const postMessage = vi.spyOn(frame!.contentWindow!, 'postMessage').mockImplementation(() => {});
    frame!.dispatchEvent(new Event('load'));
    expect(FakeMessageChannel.instances).toHaveLength(1);
    return { frame: frame!, channel: FakeMessageChannel.instances[0], postMessage };
  }

  it('creates a non-interactive fullscreen canvas', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-sakura-effect-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
    expect(canvas?.style.pointerEvents).toBe('none');
    expect(canvas?.style.position).toBe('fixed');
  });

  it('does not create a canvas before selection', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
  });

  it('draining an idle renderer creates no canvas', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.drain();

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
  });

  it('keeps the canvas while particles drain', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    // Canvas persists during drain
    renderer.drain();

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
  });

  it('creates a canvas only after selection', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();

    renderer.enable();

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
  });

  it('starts after an idle drain', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.drain();

    // Switch to sakura
    renderer.enable();
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
  });

  it('cleans up on page teardown', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    for (const renderer of renderers) renderer.destroy();
    renderers = [];

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
  });

  it('cleans up on page teardown even during drain', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    // Enter drain mode
    renderer.drain();
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    // Page teardown bypasses the drain.
    for (const renderer of renderers) renderer.destroy();
    renderers = [];
    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
  });

  it('resumes the same canvas when enabled during drain', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-sakura-effect-canvas');
    // Enter drain mode
    renderer.drain();
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    // Re-enable — cancels drain, canvas stays
    renderer.enable();
    expect(document.getElementById('gv-sakura-effect-canvas')).toBe(canvas);
    expect(document.querySelectorAll('#gv-sakura-effect-canvas')).toHaveLength(1);
  });

  it('draws the full sprite-backed sakura profile outside Firefox', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    runAnimationFrame(16);

    expect(mockCtx.drawImage).toHaveBeenCalledTimes(88);
    expect(mockCtx.fill).toHaveBeenCalledTimes(8);
  });

  it('keeps the full profile when Firefox must use the main-thread fallback', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    vi.stubGlobal('MessageChannel', undefined);
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    runAnimationFrame(16);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(88);

    runAnimationFrame(32);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(176);

    // 10 ms after the last draw is a faster-than-60 Hz tick: skipped, not dropped petals.
    runAnimationFrame(42);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(176);

    runAnimationFrame(49);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(264);
  });

  it('caps the fallback canvas DPR without reducing particle density', async () => {
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 3,
    });
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    const canvas = document.getElementById('gv-sakura-effect-canvas') as HTMLCanvasElement | null;
    expect(canvas?.width).toBe(window.innerWidth);
    expect(canvas?.height).toBe(window.innerHeight);
    expect(mockCtx.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it('never drops particles or skips frames after repeated long frame intervals', async () => {
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    runAnimationFrame(16);
    runAnimationFrame(50);
    runAnimationFrame(84);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(264);

    runAnimationFrame(118);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(352);
  });

  it('connects Firefox to the extension-origin worker renderer', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    installWorkerFrameHarness();
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
    const { frame, channel, postMessage } = connectWorkerFrame();
    const initMessage = channel.port1.postMessage.mock.calls[0][0] as {
      type: string;
      sessionId: number;
      running: boolean;
      mode: string;
    };
    expect(initMessage).toMatchObject({
      type: 'init',
      running: true,
      scheme: 'light',
      mode: 'active',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'gv-sakura-renderer-connect' }),
      'chrome-extension://test-extension-id',
      [channel.port2],
    );
    expect(mockCtx.drawImage).not.toHaveBeenCalled();

    channel.port1.emit({ type: 'ready', sessionId: initMessage.sessionId });
    expect(frame.dataset.gvSakuraRenderer).toBe('worker');

    vi.advanceTimersByTime(3_000);
    expect(document.getElementById('gv-sakura-effect-frame')).toBe(frame);
    expect(channel.port1.close).not.toHaveBeenCalled();
  });

  it('tells the worker to pause while the window is unfocused and to resume on focus', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    installWorkerFrameHarness();
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();
    const { channel } = connectWorkerFrame();
    const { sessionId } = channel.port1.postMessage.mock.calls[0][0] as { sessionId: number };

    vi.mocked(document.hasFocus).mockReturnValue(false);
    window.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(0);
    expect(channel.port1.postMessage).toHaveBeenLastCalledWith({
      type: 'running',
      sessionId,
      running: false,
    });

    vi.mocked(document.hasFocus).mockReturnValue(true);
    window.dispatchEvent(new Event('focus'));
    expect(channel.port1.postMessage).toHaveBeenLastCalledWith({
      type: 'running',
      sessionId,
      running: true,
    });
  });

  it('ignores a stale worker drain completion after Sakura is re-enabled', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    installWorkerFrameHarness();
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();
    const { frame, channel } = connectWorkerFrame();
    const initMessage = channel.port1.postMessage.mock.calls[0][0] as { sessionId: number };
    channel.port1.emit({ type: 'ready', sessionId: initMessage.sessionId });
    renderer.drain();
    const staleDrainMessage = channel.port1.postMessage.mock.calls.at(-1)?.[0] as {
      drainId: number;
    };
    renderer.enable();
    channel.port1.emit({
      type: 'drained',
      sessionId: initMessage.sessionId,
      drainId: staleDrainMessage.drainId,
    });
    expect(document.getElementById('gv-sakura-effect-frame')).toBe(frame);
    expect(FakeMessageChannel.instances).toHaveLength(1);
    expect(channel.port1.close).not.toHaveBeenCalled();
    renderer.drain();
    const latestDrainMessage = channel.port1.postMessage.mock.calls.at(-1)?.[0] as {
      drainId: number;
    };
    channel.port1.emit({
      type: 'drained',
      sessionId: initMessage.sessionId,
      drainId: latestDrainMessage.drainId,
    });
    expect(document.getElementById('gv-sakura-effect-frame')).toBeNull();
    expect(channel.port1.postMessage).toHaveBeenLastCalledWith({
      type: 'dispose',
      sessionId: initMessage.sessionId,
    });
    expect(channel.port1.close).toHaveBeenCalledTimes(1);
  });

  it('disposes the Firefox worker frame immediately on page teardown during drain', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    installWorkerFrameHarness();
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();
    const { channel } = connectWorkerFrame();
    const initMessage = channel.port1.postMessage.mock.calls[0][0] as { sessionId: number };
    renderer.drain();
    renderer.destroy();
    expect(document.getElementById('gv-sakura-effect-frame')).toBeNull();
    expect(channel.port1.postMessage).toHaveBeenLastCalledWith({
      type: 'dispose',
      sessionId: initMessage.sessionId,
    });
    expect(channel.port1.close).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('falls back safely if the extension renderer reports a fatal error', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    installWorkerFrameHarness();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();

    const { channel } = connectWorkerFrame();
    const initMessage = channel.port1.postMessage.mock.calls[0][0] as { sessionId: number };
    channel.port1.emit({ type: 'fatal', sessionId: initMessage.sessionId, reason: 'context lost' });

    expect(document.getElementById('gv-sakura-effect-frame')).toBeNull();
    expect(document.querySelectorAll('#gv-sakura-effect-canvas')).toHaveLength(1);
    expect(document.getElementById('gv-sakura-effect-canvas')?.dataset.gvSakuraRenderer).toBe(
      'main-thread',
    );
    expect(channel.port1.close).toHaveBeenCalledTimes(1);

    runAnimationFrame(16);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(88);
  });

  it('falls back at full quality if the renderer never becomes ready', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    installWorkerFrameHarness();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { createSakuraRenderer } = await import('../sakura');
    const renderer = createSakuraRenderer();
    renderers.push(renderer);
    renderer.enable();
    const { channel } = connectWorkerFrame();
    vi.advanceTimersByTime(3_000);

    expect(document.getElementById('gv-sakura-effect-frame')).toBeNull();
    expect(document.querySelectorAll('#gv-sakura-effect-canvas')).toHaveLength(1);
    expect(document.getElementById('gv-sakura-effect-canvas')?.dataset.gvSakuraRenderer).toBe(
      'main-thread',
    );
    expect(channel.port1.close).toHaveBeenCalledTimes(1);

    runAnimationFrame(16);
    expect(mockCtx.drawImage).toHaveBeenCalledTimes(88);
  });
});
