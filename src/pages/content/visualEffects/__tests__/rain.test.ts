import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('rainEffect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';

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
    window.dispatchEvent(new Event('beforeunload'));
    vi.useRealTimers();
  });

  it('creates canvas when enabled via gvVisualEffect storage', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'rain' });
      },
    );

    const { startRainEffect } = await import('../rain');
    startRainEffect();

    const canvas = document.getElementById('gv-rain-effect-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName).toBe('CANVAS');
    expect(canvas?.style.pointerEvents).toBe('none');
    expect(canvas?.style.position).toBe('fixed');
  });

  it('does not create canvas when visual effect is snow', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'snow' });
      },
    );

    const { startRainEffect } = await import('../rain');
    startRainEffect();

    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();
  });

  it('begins graceful drain when disabled via storage change (canvas persists)', async () => {
    let storageListener: ((changes: Record<string, unknown>, area: string) => void) | null = null;

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: (changes: Record<string, unknown>, area: string) => void) => {
      storageListener = listener;
    });

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'rain' });
      },
    );

    const { startRainEffect } = await import('../rain');
    startRainEffect();

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    // Canvas persists during drain
    storageListener!({ gvVisualEffect: { newValue: 'off', oldValue: 'rain' } }, 'sync');

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();
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
        callback({ gvVisualEffect: 'off' });
      },
    );

    const { startRainEffect } = await import('../rain');
    startRainEffect();

    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();

    storageListener!({ gvVisualEffect: { newValue: 'rain', oldValue: 'off' } }, 'sync');

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();
  });

  it('cleans up on beforeunload', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'rain' });
      },
    );

    const { startRainEffect } = await import('../rain');
    startRainEffect();

    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    window.dispatchEvent(new Event('beforeunload'));

    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();
  });

  it('cleans up on beforeunload even during drain', async () => {
    let storageListener: ((changes: Record<string, unknown>, area: string) => void) | null = null;

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: (changes: Record<string, unknown>, area: string) => void) => {
      storageListener = listener;
    });

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'rain' });
      },
    );

    const { startRainEffect } = await import('../rain');
    startRainEffect();

    // Enter drain mode
    storageListener!({ gvVisualEffect: { newValue: 'off', oldValue: 'rain' } }, 'sync');
    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    // Force cleanup via beforeunload
    window.dispatchEvent(new Event('beforeunload'));
    expect(document.getElementById('gv-rain-effect-canvas')).toBeNull();
  });

  it('cancels drain when re-enabled via storage change', async () => {
    let storageListener: ((changes: Record<string, unknown>, area: string) => void) | null = null;

    (
      chrome.storage.onChanged.addListener as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation((listener: (changes: Record<string, unknown>, area: string) => void) => {
      storageListener = listener;
    });

    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'rain' });
      },
    );

    const { startRainEffect } = await import('../rain');
    startRainEffect();

    // Enter drain mode
    storageListener!({ gvVisualEffect: { newValue: 'off', oldValue: 'rain' } }, 'sync');
    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();

    // Re-enable — cancels drain, canvas stays
    storageListener!({ gvVisualEffect: { newValue: 'rain', oldValue: 'off' } }, 'sync');
    expect(document.getElementById('gv-rain-effect-canvas')).not.toBeNull();
  });
});
