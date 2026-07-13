import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('startVisualEffects', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete (globalThis as typeof globalThis & { __gvVisualEffectsStarted?: boolean })
      .__gvVisualEffectsStarted;
    (chrome.storage.sync.get as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_defaults: Record<string, unknown>, callback: (result: Record<string, unknown>) => void) => {
        callback({ gvVisualEffect: 'off' });
      },
    );
  });

  it('initializes all effects only once in a content-script world', async () => {
    const { startVisualEffects } = await import('../index');

    startVisualEffects();
    startVisualEffects();

    expect(chrome.storage.sync.get).toHaveBeenCalledTimes(3);
    expect(chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(3);
  });
});
