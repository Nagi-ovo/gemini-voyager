import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('sakuraEffect', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';

    const mockCtx = {
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

    const { startSakuraEffect } = await import('../index');
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

    const { startSakuraEffect } = await import('../index');
    startSakuraEffect();

    expect(document.getElementById('gv-sakura-effect-canvas')).toBeNull();
  });

  it('does not create canvas when visual effect is off', async () => {
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'off' });
      },
    );

    const { startSakuraEffect } = await import('../index');
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

    const { startSakuraEffect } = await import('../index');
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

    const { startSakuraEffect } = await import('../index');
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

    const { startSakuraEffect } = await import('../index');
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

    const { startSakuraEffect } = await import('../index');
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

    const { startSakuraEffect } = await import('../index');
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

    const { startSakuraEffect } = await import('../index');
    startSakuraEffect();

    // Enter drain mode
    storageListener!({ gvVisualEffect: { newValue: 'off', oldValue: 'sakura' } }, 'sync');
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();

    // Re-enable — cancels drain, canvas stays
    storageListener!({ gvVisualEffect: { newValue: 'sakura', oldValue: 'off' } }, 'sync');
    expect(document.getElementById('gv-sakura-effect-canvas')).not.toBeNull();
  });
});
