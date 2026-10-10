import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { createToaster } from '@/core/ui/toast/toaster';
import { toastDriver } from '@/tests/toastDriver';

import { startPendingFork } from '../pendingFork';

vi.mock('webextension-polyfill', () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(),
        remove: vi.fn().mockResolvedValue(undefined),
      },
    },
  },
}));

describe('pending fork handoff', () => {
  let stop: () => void;
  const pending = {
    sourceConversationId: 'source',
    sourceTurnId: 's-1111111111111111',
    sourceUrl: 'https://gemini.google.com/app/source',
    sourceTitle: 'Source',
    forkGroupId: 'group',
    sourceForkIndex: 0,
    nextForkIndex: 1,
    markdown: '# Source\n\nContext',
    mode: 'fileUpload',
    filename: 'fork.md',
  };

  const flush = async () => {
    for (let i = 0; i < 8; i++) await Promise.resolve();
  };
  const start = () =>
    startPendingFork({
      getConversationId: () => null,
      getConversationTitle: () => 'New',
      onLinked: async () => undefined,
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    document.body.innerHTML =
      '<rich-textarea><div contenteditable="true">An existing draft</div></rich-textarea>';
    const input = document.querySelector<HTMLElement>('[contenteditable]')!;
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ height: 24 } as DOMRect);
    sessionStorage.clear();
  });

  afterEach(() => {
    stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('uses the longer upload TTL without overwriting an existing draft', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, createdAt: Date.now() - 90000 },
    });
    stop = start();
    await flush();

    expect(document.querySelector('[contenteditable]')?.textContent).toBe('An existing draft');
    const [hint] = toastDriver.all();
    expect(hint.message).toContain('fork.md');
    expect(hint.detail).toBe('00:30');
    await vi.advanceTimersByTimeAsync(1000);
    expect(toastDriver.all()[0].detail).toBe('00:29');
    await vi.advanceTimersByTimeAsync(29000);
    expect(toastDriver.all()).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('discards an expired paste and clears the legacy per-tab record', async () => {
    sessionStorage.setItem('gvPendingFork', 'legacy');
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, mode: 'paste', createdAt: Date.now() - 90000 },
    });
    stop = start();
    await flush();

    expect(browser.storage.local.remove).toHaveBeenCalledWith('gvPendingFork');
    expect(sessionStorage.getItem('gvPendingFork')).toBeNull();
    expect(document.querySelector('[contenteditable]')?.textContent).toBe('An existing draft');
    expect(toastDriver.all()).toEqual([]);
  });

  it('keeps the upload hint when other features show several timed toasts', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, createdAt: Date.now() },
    });
    stop = start();
    await flush();
    const others = createToaster();

    for (const n of [1, 2, 3, 4, 5]) others.show({ message: `copied ${n}`, durationMs: 3000 });
    await vi.advanceTimersByTimeAsync(4000);

    expect(toastDriver.all().map((toast) => toast.detail)).toEqual(['01:56']);
    others.destroy();
  });

  it('stops the countdown when the user closes the hint', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, createdAt: Date.now() },
    });
    stop = start();
    await flush();

    toastDriver.press(toastDriver.all()[0], 'Cancel');
    await vi.advanceTimersByTimeAsync(1000);

    expect(toastDriver.all()).toEqual([]);
  });

  it('lets a restarted feature clear upload feedback created by an older pending read', async () => {
    let resolveRead!: (value: Record<string, unknown>) => void;
    vi.mocked(browser.storage.local.get).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
    );
    const stopOld = start();
    stopOld();
    stop = start();
    resolveRead({ gvPendingFork: { ...pending, createdAt: Date.now() } });
    await flush();

    expect(toastDriver.all()[0].detail).toBe('02:00');
    stop();
    await vi.advanceTimersByTimeAsync(1000);

    expect(toastDriver.all()).toEqual([]);
  });
});
