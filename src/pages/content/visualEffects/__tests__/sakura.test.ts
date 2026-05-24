import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  rotate: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  fillStyle: string;
};

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
    vi.mocked(isFirefox).mockReturnValue(false);

    mockCtx = {
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      bezierCurveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      scale: vi.fn(),
      fillStyle: '',
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
    window.dispatchEvent(new Event('beforeunload'));
    vi.useRealTimers();
  });

  it('creates canvas when enabled via gvVisualEffect storage', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    const canvas = document.getElementById('gv-sakura-effect-canvas');
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

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
  });

  it('does not create canvas when visual effect is off', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'off' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
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
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    // Canvas persists during drain
    storageListener!({ gvVisualEffect: { newValue: 'off', oldValue: 'sakura' } }, 'sync');

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
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

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();

    storageListener!({ gvVisualEffect: { newValue: 'sakura', oldValue: 'off' } }, 'sync');

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
  });

  it('switches from snow to sakura via storage change', async () => {
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

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    // Switch to sakura
    storageListener!({ gvVisualEffect: { newValue: 'sakura', oldValue: 'snow' } }, 'sync');
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
  });

  it('cleans up on beforeunload', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    window.dispatchEvent(new Event('beforeunload'));

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
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
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    // Enter drain mode
    storageListener!({ gvVisualEffect: { newValue: 'off', oldValue: 'sakura' } }, 'sync');
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    // Force cleanup via beforeunload
    window.dispatchEvent(new Event('beforeunload'));
    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
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
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    // Enter drain mode
    storageListener!({ gvVisualEffect: { newValue: 'off', oldValue: 'sakura' } }, 'sync');
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    // Re-enable — cancels drain, canvas stays
    storageListener!({ gvVisualEffect: { newValue: 'sakura', oldValue: 'off' } }, 'sync');
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
  });

  it('draws the full sakura profile outside Firefox', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    runAnimationFrame(16);

    expect(mockCtx.fill).toHaveBeenCalledTimes(88);
  });

  it('uses a lower-load sakura profile on Firefox', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    runAnimationFrame(16);

    expect(mockCtx.fill).toHaveBeenCalledTimes(38);
  });

  it('caps Firefox sakura drawing to roughly 30fps', async () => {
    vi.mocked(isFirefox).mockReturnValue(true);
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'sakura' });
      },
    );

    const { startSakuraEffect } = await import('../sakura');
    startSakuraEffect();

    runAnimationFrame(16);
    runAnimationFrame(32);

    expect(mockCtx.fill).toHaveBeenCalledTimes(38);

    runAnimationFrame(50);

    expect(mockCtx.fill).toHaveBeenCalledTimes(76);
  });
});
