import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('snowEffect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';

    // Mock canvas context
    const mockCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
    };

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      mockCtx as unknown as CanvasRenderingContext2D,
    );
  });

  afterEach(() => {
    window.dispatchEvent(new Event('beforeunload'));
    vi.useRealTimers();
  });

  it('creates canvas when enabled via storage', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSnowEffect: true });
      },
    );

    const { startSnowEffect } = await import('../index');
    startSnowEffect();

    const canvas = document.getElementById('gv-snow-effect-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
    expect(canvas?.style.pointerEvents).toBe('none');
    expect(canvas?.style.position).toBe('fixed');
  });

  it('does not create canvas when disabled', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSnowEffect: false });
      },
    );

    const { startSnowEffect } = await import('../index');
    startSnowEffect();

    const canvas = document.getElementById('gv-snow-effect-canvas');
    expect(canvas).toBeNull();
  });

  it('removes canvas when disabled via storage change', async () => {
    let storageListener: ((changes: Record<string, unknown>, area: string) => void) | null = null;

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: (changes: Record<string, unknown>, area: string) => void) => {
      storageListener = listener;
    });

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSnowEffect: true });
      },
    );

    const { startSnowEffect } = await import('../index');
    startSnowEffect();

    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();

    // Simulate storage change to disable
    storageListener!({ gvSnowEffect: { newValue: false, oldValue: true } }, 'sync');

    expect(document.getElementById('gv-snow-effect-canvas')).toBeNull();
  });

  it('creates canvas when enabled via storage change', async () => {
    let storageListener: ((changes: Record<string, unknown>, area: string) => void) | null = null;

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: (changes: Record<string, unknown>, area: string) => void) => {
      storageListener = listener;
    });

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSnowEffect: false });
      },
    );

    const { startSnowEffect } = await import('../index');
    startSnowEffect();

    expect(document.getElementById('gv-snow-effect-canvas')).toBeNull();

    // Simulate storage change to enable
    storageListener!({ gvSnowEffect: { newValue: true, oldValue: false } }, 'sync');

    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();
  });

  it('cleans up on beforeunload', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvSnowEffect: true });
      },
    );

    const { startSnowEffect } = await import('../index');
    startSnowEffect();

    expect(document.getElementById('gv-snow-effect-canvas')).not.toBeNull();

    window.dispatchEvent(new Event('beforeunload'));

    expect(document.getElementById('gv-snow-effect-canvas')).toBeNull();
  });
});
