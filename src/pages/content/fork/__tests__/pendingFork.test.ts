import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import browser from 'webextension-polyfill';

import { createToaster } from '@/core/ui/toast/toaster';
import { toastDriver } from '@/tests/toastDriver';

import { startForkLinkFinisher } from '../linkFinisher';
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
  let stopCore: () => void;
  const pending = {
    sourceConversationId: 'source',
    sourceTurnId: 's-1111111111111111',
    sourceUrl: `${location.origin}/app/source`,
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
    history.replaceState({}, '', '/app');
    stopCore = startForkLinkFinisher();
    vi.mocked(browser.storage.local.get).mockResolvedValue({});
    document.body.innerHTML =
      '<rich-textarea><div contenteditable="true">An existing draft</div></rich-textarea>';
    const input = document.querySelector<HTMLElement>('[contenteditable]')!;
    vi.spyOn(input, 'getBoundingClientRect').mockReturnValue({ height: 24 } as DOMRect);
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    sessionStorage.clear();
  });

  afterEach(() => {
    stop?.();
    stopCore();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    Reflect.deleteProperty(document, 'execCommand');
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

  it.each(['the first read', 'the retry wait', 'the retry read'])(
    'leaves the pending fork in storage when fork stops before reading it (%s)',
    async (boundary) => {
      let resolveRead!: (value: Record<string, unknown>) => void;
      const lateRead = new Promise<Record<string, unknown>>((resolve) => {
        resolveRead = resolve;
      });
      const stale = { gvPendingFork: { ...pending, createdAt: Date.now() - 600000 } };
      if (boundary === 'the first read') {
        vi.mocked(browser.storage.local.get).mockReturnValueOnce(lateRead);
      } else if (boundary === 'the retry read') {
        vi.mocked(browser.storage.local.get)
          .mockResolvedValueOnce({})
          .mockReturnValueOnce(lateRead);
      }
      stop = start();
      await flush();
      if (boundary === 'the retry read') await vi.advanceTimersByTimeAsync(2000);
      stop();
      resolveRead(stale);
      await vi.advanceTimersByTimeAsync(3000);

      expect(browser.storage.local.get).toHaveBeenCalledTimes(
        boundary === 'the retry read' ? 2 : 1,
      );
      expect(browser.storage.local.remove).not.toHaveBeenCalled();
      expect(toastDriver.all()).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it.each([
    ['paste', 'the storage removal'],
    ['paste', 'the composer wait'],
    ['fileUpload', 'the storage removal'],
  ])(
    'pastes nothing and shows no hint when fork stops after taking the pending fork (%s, %s)',
    async (mode, boundary) => {
      const input = document.querySelector<HTMLElement>('[contenteditable]')!;
      input.textContent = '';
      // jsdom has no execCommand; the paste then takes its DOM fallback.
      Object.defineProperty(document, 'execCommand', {
        value: vi.fn().mockReturnValue(false),
        configurable: true,
      });
      let releaseRemoval!: () => void;
      if (boundary === 'the storage removal') {
        vi.mocked(browser.storage.local.remove).mockReturnValueOnce(
          new Promise<void>((resolve) => {
            releaseRemoval = resolve;
          }),
        );
      } else {
        vi.mocked(input.getBoundingClientRect).mockReturnValue({ height: 0 } as DOMRect);
      }
      vi.mocked(browser.storage.local.get).mockResolvedValue({
        gvPendingFork: { ...pending, mode, createdAt: Date.now() },
      });
      stop = start();
      await flush();
      expect(browser.storage.local.remove).toHaveBeenCalledWith('gvPendingFork');

      stop();
      if (boundary === 'the storage removal') releaseRemoval();
      vi.mocked(input.getBoundingClientRect).mockReturnValue({ height: 24 } as DOMRect);
      await vi.advanceTimersByTimeAsync(2000);

      expect(input.textContent).toBe('');
      expect(toastDriver.all()).toEqual([]);
      // No URL watcher was started either: it would hold a poll interval.
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('keeps the new upload hint when an older fork handoff cleans up', async () => {
    vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
      gvPendingFork: { ...pending, createdAt: Date.now() - 110000 },
    });
    const stopOld = start();
    await flush();
    expect(toastDriver.all()[0].detail).toBe('00:10');
    stopOld();

    vi.mocked(browser.storage.local.get).mockResolvedValueOnce({
      gvPendingFork: { ...pending, filename: 'newer.md', createdAt: Date.now() },
    });
    stop = start();
    await flush();
    // The older handoff's watcher reaches its own deadline and cleans up after itself.
    await vi.advanceTimersByTimeAsync(11000);

    const [hint] = toastDriver.all();
    expect(hint.message).toContain('newer.md');
    expect(hint.detail).toBe('01:49');
    await vi.advanceTimersByTimeAsync(1000);
    expect(toastDriver.all()[0].detail).toBe('01:48');
  });

  it.each(['storage read', 'storage removal', 'composer wait'] as const)(
    'does not paste into another account after the %s resumes',
    async (boundary) => {
      const input = document.querySelector<HTMLElement>('[contenteditable]')!;
      input.textContent = '';
      document.body.insertAdjacentHTML(
        'afterbegin',
        '<header data-email="first@example.com"></header>',
      );
      const payload = { gvPendingFork: { ...pending, mode: 'paste', createdAt: Date.now() } };
      let resume: () => void = () => {};
      if (boundary === 'storage read') {
        vi.mocked(browser.storage.local.get).mockReturnValueOnce(
          new Promise((resolve) => {
            resume = () => resolve(payload);
          }),
        );
      } else {
        vi.mocked(browser.storage.local.get).mockResolvedValue(payload);
        if (boundary === 'storage removal') {
          vi.mocked(browser.storage.local.remove).mockReturnValueOnce(
            new Promise<void>((resolve) => {
              resume = resolve;
            }),
          );
        } else {
          vi.mocked(input.getBoundingClientRect).mockReturnValue({ height: 0 } as DOMRect);
          resume = () =>
            vi.mocked(input.getBoundingClientRect).mockReturnValue({ height: 24 } as DOMRect);
        }
      }
      stop = start();
      await flush();
      // The route slot is unchanged; the account header is enough to retire delayed page work.
      document.querySelector('header')!.setAttribute('data-email', 'other@example.com');
      resume();
      await vi.advanceTimersByTimeAsync(3000);
      expect(input.textContent).toBe('');
      expect(toastDriver.all()).toEqual([]);
      if (boundary === 'storage read') expect(browser.storage.local.remove).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('leaves another account’s stored handoff for its destination tab', async () => {
    history.replaceState({}, '', '/u/1/app');
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, createdAt: Date.now() },
    });
    stop = start();
    await vi.advanceTimersByTimeAsync(2500);
    expect(browser.storage.local.remove).not.toHaveBeenCalled();
    expect(toastDriver.all()).toEqual([]);
    expect(document.querySelector('[contenteditable]')?.textContent).toBe('An existing draft');
  });

  it('does not paste a handoff after its original deadline expires during the composer wait', async () => {
    const input = document.querySelector<HTMLElement>('[contenteditable]')!;
    input.textContent = '';
    vi.mocked(input.getBoundingClientRect).mockReturnValue({ height: 0 } as DOMRect);
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, mode: 'paste', createdAt: Date.now() - 59900 },
    });
    stop = start();
    await flush();
    await vi.advanceTimersByTimeAsync(200);
    vi.mocked(input.getBoundingClientRect).mockReturnValue({ height: 24 } as DOMRect);
    await vi.advanceTimersByTimeAsync(100);
    expect(input.textContent).toBe('');
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not refill the upload prompt when the composer appears and sends before the wait resumes', async () => {
    const input = document.querySelector<HTMLElement>('[contenteditable]')!;
    input.textContent = 'My first request';
    vi.mocked(input.getBoundingClientRect).mockReturnValue({ height: 0 } as DOMRect);
    input.closest('rich-textarea')!.outerHTML =
      `<div class="text-input-field">${input.closest('rich-textarea')!.outerHTML}<button aria-label="Send">Send</button></div>`;
    const field = document.querySelector<HTMLElement>('[contenteditable]')!;
    let visible = false;
    vi.spyOn(field, 'getBoundingClientRect').mockImplementation(
      () => ({ height: visible ? 24 : 0 }) as DOMRect,
    );
    const button = document.querySelector('button')!;
    Object.defineProperty(button, 'offsetParent', { value: document.body, configurable: true });
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, createdAt: Date.now() },
    });
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    stop = start();
    await flush();
    visible = true;
    button.click();
    field.textContent = '';
    await vi.advanceTimersByTimeAsync(20);
    expect(field.textContent).toBe('');
  });

  it('pastes into the main composer while leaving a visible edit dialog alone', async () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<div role="dialog"><rich-textarea><div id="edit" contenteditable="true">Edited question</div></rich-textarea></div>',
    );
    vi.spyOn(
      document.querySelector<HTMLElement>('#edit')!,
      'getBoundingClientRect',
    ).mockReturnValue({ height: 24 } as DOMRect);
    Object.defineProperty(document, 'execCommand', {
      value: vi.fn().mockReturnValue(false),
      configurable: true,
    });
    vi.mocked(browser.storage.local.get).mockResolvedValue({
      gvPendingFork: { ...pending, mode: 'paste', createdAt: Date.now() },
    });
    stop = start();
    await flush();
    expect(document.querySelector('#edit')?.textContent).toBe('Edited question');
    expect(document.querySelector('body > rich-textarea')?.textContent).toBe(pending.markdown);
  });
});
