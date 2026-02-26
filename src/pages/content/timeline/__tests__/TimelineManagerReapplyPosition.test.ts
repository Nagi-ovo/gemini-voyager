import { afterEach, describe, expect, it, vi } from 'vitest';

import { TimelineManager } from '../manager';

type TimelineManagerInternal = {
  ui: {
    timelineBar: HTMLElement | null;
  };
  reapplyPosition: () => Promise<void>;
};

describe('TimelineManager reapplyPosition', () => {
  const originalChrome = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;

  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, 'chrome', {
      value: originalChrome,
      configurable: true,
      writable: true,
    });
  });

  it('silently ignores extension context invalidated errors from chrome.storage', async () => {
    const manager = new TimelineManager();
    const internal = manager as unknown as TimelineManagerInternal;

    internal.ui.timelineBar = document.createElement('div');

    const get = vi.fn(
      (_: Record<string, unknown>, cb: (items: Record<string, unknown>) => void) => {
        cb({ geminiTimelinePosition: null });
      },
    );

    Object.defineProperty(globalThis, 'chrome', {
      value: {
        storage: {
          sync: {
            get,
          },
        },
        runtime: {
          lastError: {
            message: 'Extension context invalidated.',
          },
        },
      } as unknown as typeof chrome,
      configurable: true,
      writable: true,
    });

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await internal.reapplyPosition();

    expect(get).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
