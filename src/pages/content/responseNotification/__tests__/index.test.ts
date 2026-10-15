// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/app" }
import { type Mock, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

const toast = vi.hoisted(() => ({ showIfNeeded: vi.fn(), stop: vi.fn() }));

vi.mock('../foregroundCompletionToast', () => ({
  createForegroundCompletionToast: () => toast,
}));

const PAGE_OBSERVER_SOURCE = 'gemini-voyager-response-complete-observer';
const ENABLED_KEY = StorageKeys.RESPONSE_COMPLETE_NOTIFICATION_ENABLED;

type StorageListener = (
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string,
) => void;

let cleanup: (() => void) | null = null;

function dispatchPageObserverMessage(
  type: 'request-start' | 'request-complete',
  requestId = 1,
  shouldNotify = true,
  identity: { prompt?: string; conversationId?: string; pageUrl?: string; outcome?: string } = {},
): void {
  const event = new MessageEvent('message', {
    data: {
      source: PAGE_OBSERVER_SOURCE,
      type,
      payload: {
        requestId,
        shouldNotify,
        outcome: 'success',
        ...identity,
      },
    },
  });
  Object.defineProperty(event, 'source', { value: window });
  window.dispatchEvent(event);
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function lastStorageListener(): StorageListener {
  const calls = (chrome.storage.onChanged.addListener as unknown as Mock).mock.calls;
  return calls.at(-1)?.[0] as StorageListener;
}

function notifyCalls(): unknown[] {
  return (chrome.runtime.sendMessage as unknown as Mock).mock.calls.filter(
    ([message]) => (message as { type?: string })?.type === 'gv.responseComplete.notify',
  );
}

/** Lets the user come back to the tab, which flushes a queued foreground fallback. */
function returnToTab(): void {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
  window.dispatchEvent(new Event('focus'));
}

/** A user typing in the visible tab: completion goes to the foreground toast, not the system. */
function typeInForeground(): void {
  returnToTab();
  const composer = document.createElement('rich-textarea');
  document.body.appendChild(composer);
  composer.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/** The signed-in account control Gemini renders; its label carries the email. */
function showAccount(email: string): void {
  let control = document.getElementById('account');
  if (!control) {
    control = document.createElement('button');
    control.id = 'account';
    document.body.prepend(control);
  }
  control.setAttribute('aria-label', `Google Account: ${email}`);
}

function navigate(path: string): void {
  window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  cleanup = null;
  window.history.replaceState({}, '', '/app/chat-a');
  document.body.innerHTML = `
    <article data-author="assistant">
      <p>Final answer</p>
      <button aria-label="Copy response">Copy</button>
    </article>
  `;
  (chrome.storage.sync.get as unknown as Mock).mockResolvedValue({ [ENABLED_KEY]: true });
  (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValue({ ok: true });
  vi.spyOn(document, 'hasFocus').mockReturnValue(false);
});

/** Start a run as the page does and wait until its initial setting read was applied. */
async function startedRun(
  create: typeof import('../index').createResponseNotificationRun,
): Promise<() => void> {
  const run = create();
  await run.ready;
  return run.stop;
}

afterEach(() => {
  cleanup?.();
  vi.useRealTimers();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('response notification run', () => {
  it.each([
    ['failed', false],
    ['cancelled', false],
    ['failed', true],
    ['cancelled', true],
  ] as const)(
    'does not announce a %s request when stale generation UI settles (foreground=%s), and the next send recovers',
    async (outcome, foreground) => {
      vi.useFakeTimers();
      vi.mocked(document.hasFocus).mockReturnValue(foreground);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(
        foreground ? 'visible' : 'hidden',
      );
      const { createResponseNotificationRun } = await import('../index');
      cleanup = await startedRun(createResponseNotificationRun);
      dispatchPageObserverMessage('request-start');
      dispatchPageObserverMessage('request-complete', 1, true, { outcome });
      const stop = document.createElement('button');
      stop.setAttribute('aria-label', 'Stop response');
      Object.defineProperty(stop, 'offsetWidth', { value: 20 });
      document.body.appendChild(stop);
      await vi.advanceTimersByTimeAsync(500);
      stop.remove();
      document.querySelector('p')!.textContent = 'Partial failed answer';
      await vi.advanceTimersByTimeAsync(5000);
      expect(notifyCalls()).toHaveLength(0);
      expect(toast.showIfNeeded).not.toHaveBeenCalled();

      vi.mocked(document.hasFocus).mockReturnValue(false);
      dispatchPageObserverMessage('request-start', 2);
      dispatchPageObserverMessage('request-complete', 2);
      expect(notifyCalls()).toHaveLength(1);
    },
  );

  it.each(['success', 'failed', 'cancelled'])(
    'an older %s terminal event cannot replace the latest failed generation',
    async (outcome) => {
      vi.useFakeTimers();
      const { createResponseNotificationRun } = await import('../index');
      cleanup = await startedRun(createResponseNotificationRun);
      dispatchPageObserverMessage('request-start', 1);
      dispatchPageObserverMessage('request-start', 2);
      dispatchPageObserverMessage('request-complete', 2, true, { outcome: 'failed' });
      dispatchPageObserverMessage('request-complete', 1, true, { outcome });
      await vi.advanceTimersByTimeAsync(5000);
      expect(notifyCalls()).toHaveLength(0);
      dispatchPageObserverMessage('request-start', 3);
      dispatchPageObserverMessage('request-complete', 3);
      expect(notifyCalls()).toHaveLength(1);
    },
  );

  it('shows a foreground completion that rendered before the network ended, once the page is quiet', async () => {
    vi.useFakeTimers();
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);
    typeInForeground();
    dispatchPageObserverMessage('request-start');
    document.querySelector('p')!.textContent = 'A short final answer';
    await vi.advanceTimersByTimeAsync(2000);
    expect(toast.showIfNeeded).not.toHaveBeenCalled();
    dispatchPageObserverMessage('request-complete');
    await vi.advanceTimersByTimeAsync(5000);
    expect(toast.showIfNeeded).toHaveBeenCalledTimes(1);
    expect(notifyCalls()).toHaveLength(0);
  });

  it('uses an empty summary for consecutive requests whose new prompt never renders', async () => {
    document.body.insertAdjacentHTML('afterbegin', '<user-query>Old prompt</user-query>');
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);
    for (const requestId of [1, 2]) {
      dispatchPageObserverMessage('request-start', requestId, true, {
        prompt: `New prompt ${requestId}`,
      });
      dispatchPageObserverMessage('request-complete', requestId);
      expect(notifyCalls()).toHaveLength(requestId);
      expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ userPrompt: '' }) }),
      );
    }
  });

  it('keeps the fresh send-time prompt even when later DOM shows another question', async () => {
    document.body.insertAdjacentHTML(
      'afterbegin',
      '<textarea></textarea><user-query>Old prompt</user-query>',
    );
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);
    document.querySelector('textarea')!.dispatchEvent(new Event('input', { bubbles: true }));
    document.body.insertAdjacentHTML('beforeend', '<user-query>This request</user-query>');
    dispatchPageObserverMessage('request-start', 1, true, { prompt: 'This request' });
    document.body.insertAdjacentHTML('beforeend', '<user-query>Later question</user-query>');
    dispatchPageObserverMessage('request-complete');
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ userPrompt: 'This request' }) }),
    );
  });

  it('does not let a protocol hint authorize an old identical prompt or a conflicting fresh prompt', async () => {
    document.body.insertAdjacentHTML('afterbegin', '<user-query>Same prompt</user-query>');
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start', 1, true, { prompt: 'Same prompt' });
    dispatchPageObserverMessage('request-complete');
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ userPrompt: '' }) }),
    );
    dispatchPageObserverMessage('request-start', 2, true, { prompt: 'Intended question' });
    document.body.insertAdjacentHTML('beforeend', '<user-query>Other question</user-query>');
    dispatchPageObserverMessage('request-complete', 2);
    expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
      expect.objectContaining({ payload: expect.objectContaining({ userPrompt: '' }) }),
    );
  });

  it('notifies each background request before Gemini renders any answer node', async () => {
    document.body.innerHTML = '';
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);

    dispatchPageObserverMessage('request-complete', 99);
    expect(notifyCalls()).toHaveLength(0);
    for (const requestId of [1, 2, 3]) {
      dispatchPageObserverMessage('request-start', requestId);
      dispatchPageObserverMessage('request-complete', requestId);
      expect(notifyCalls()).toHaveLength(requestId);
      dispatchPageObserverMessage('request-complete', requestId);
      expect(notifyCalls()).toHaveLength(requestId);
    }
  });

  it('does not notify old history while its next network request is still running', async () => {
    vi.useFakeTimers();
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);

    dispatchPageObserverMessage('request-start');
    document.body.appendChild(document.createElement('span'));
    await vi.advanceTimersByTimeAsync(5000);
    expect(notifyCalls()).toHaveLength(0);
    dispatchPageObserverMessage('request-complete');
    expect(notifyCalls()).toHaveLength(1);
  });

  it('does not wait for a stale stop button or notify again when background UI catches up', async () => {
    vi.useFakeTimers();
    document.querySelector('button')!.remove();
    const stop = document.createElement('button');
    stop.setAttribute('aria-label', 'Stop response');
    Object.defineProperty(stop, 'offsetWidth', { value: 20 });
    document.body.appendChild(stop);
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);

    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    expect(notifyCalls()).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    stop.remove();
    document.querySelector('p')!.textContent = 'The delayed new answer';
    document
      .querySelector('article')!
      .insertAdjacentHTML('beforeend', '<button aria-label="Copy response">Copy</button>');
    await vi.advanceTimersByTimeAsync(5000);
    expect(notifyCalls()).toHaveLength(1);

    dispatchPageObserverMessage('request-start', 2);
    dispatchPageObserverMessage('request-complete', 2);
    expect(notifyCalls()).toHaveLength(2);
  });

  it('does not postpone completion forever while unrelated page elements keep changing', async () => {
    vi.useFakeTimers();
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);
    typeInForeground();
    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    const decoration = document.createElement('aside');
    document.body.appendChild(decoration);

    for (let tick = 0; tick < 50; tick += 1) {
      decoration.className = `animation-frame-${tick}`;
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(toast.showIfNeeded).toHaveBeenCalledTimes(1);
  });

  it('rechecks completion when the request ends before Gemini removes the stop button', async () => {
    vi.useFakeTimers();
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);
    const stop = document.createElement('button');
    stop.setAttribute('aria-label', 'Stop response');
    Object.defineProperty(stop, 'offsetWidth', { value: 20 });
    document.body.appendChild(stop);
    typeInForeground();
    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    await vi.advanceTimersByTimeAsync(500);
    expect(toast.showIfNeeded).not.toHaveBeenCalled();

    stop.remove();
    document.querySelector('p')!.textContent = 'Final streamed answer';
    await vi.advanceTimersByTimeAsync(5000);
    expect(toast.showIfNeeded).toHaveBeenCalledTimes(1);
  });

  /** Gemini's stop button while it writes, visible so the run counts it. */
  function showStopButton(): HTMLButtonElement {
    const stop = document.createElement('button');
    stop.setAttribute('aria-label', 'Stop response');
    Object.defineProperty(stop, 'offsetWidth', { value: 20 });
    document.body.appendChild(stop);
    return stop;
  }

  it('notifies a hidden-page reply whose typing animation never plays', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);

    // No network signal: the processSession channel ends no request when a reply does.
    const stop = showStopButton();
    await vi.advanceTimersByTimeAsync(500);
    document.body.insertAdjacentHTML(
      'beforeend',
      '<article data-author="assistant"><div class="markdown" aria-busy="true">OK</div></article>',
    );
    Object.defineProperty(document.querySelector('.markdown')!, 'offsetWidth', { value: 300 });
    stop.remove();
    await vi.advanceTimersByTimeAsync(5000);

    expect(notifyCalls()).toHaveLength(1);
  });

  it('notifies each of two identical background replies', async () => {
    vi.useFakeTimers();
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    const { createResponseNotificationRun } = await import('../index');
    cleanup = await startedRun(createResponseNotificationRun);

    for (const expected of [1, 2]) {
      const stop = showStopButton();
      await vi.advanceTimersByTimeAsync(500);
      document.body.insertAdjacentHTML(
        'beforeend',
        '<article data-author="assistant"><p>OK</p><button aria-label="Copy response">Copy</button></article>',
      );
      stop.remove();
      await vi.advanceTimersByTimeAsync(5000);
      expect(notifyCalls()).toHaveLength(expected);
    }
  });

  it('strips hidden Gemini user labels from notification prompt summaries', async () => {
    document.body.innerHTML = `
      <div class="user-query-bubble-with-background">
        <span class="cdk-visually-hidden">You said</span>
        <p>请总结这个页面</p>
      </div>
      <article data-author="assistant">
        <p>Final answer</p>
        <button aria-label="Copy response">Copy</button>
      </article>
    `;
    const promptTurn = document.querySelector('.user-query-bubble-with-background')!;
    promptTurn.remove();
    document.body.insertAdjacentHTML('beforeend', '<textarea></textarea>');
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    document.querySelector('textarea')!.dispatchEvent(new Event('input', { bubbles: true }));
    document.body.prepend(promptTurn);
    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');

    await vi.waitFor(() => {
      expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            userPrompt: '请总结这个页面',
          }),
        }),
      );
    });
  });

  it('a toggle made while the setting loads is not overwritten by the late read', async () => {
    const read = deferred<Record<string, unknown>>();
    (chrome.storage.sync.get as unknown as Mock).mockReturnValueOnce(read.promise);
    const { createResponseNotificationRun } = await import('../index');

    const run = createResponseNotificationRun();
    cleanup = run.stop;
    lastStorageListener()({ [ENABLED_KEY]: { oldValue: true, newValue: false } }, 'sync');
    read.resolve({ [ENABLED_KEY]: true });
    await run.ready;

    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    await settle();

    expect(notifyCalls()).toHaveLength(0);
  });

  it("an old run's cleanup does not silence a new run", async () => {
    const { createResponseNotificationRun } = await import('../index');

    const stopOld = await startedRun(createResponseNotificationRun);
    cleanup = await startedRun(createResponseNotificationRun);
    stopOld();

    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');

    expect(notifyCalls()).toHaveLength(1);
  });

  it('ignores a completion whose start belongs to an earlier run', async () => {
    const { createResponseNotificationRun } = await import('../index');

    const stopOld = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start', 1);
    stopOld();

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start', 2);
    dispatchPageObserverMessage('request-complete', 1);
    expect(notifyCalls()).toHaveLength(0);

    // Only the new run's own request completes a notification, and only once.
    dispatchPageObserverMessage('request-complete', 2);
    await settle();
    expect(notifyCalls()).toHaveLength(1);
  });

  it("does not notify for chat A's reply after moving to chat B", async () => {
    window.history.replaceState({}, '', '/app/chat-a');
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start');
    window.history.pushState({}, '', '/app/chat-b');
    dispatchPageObserverMessage('request-complete');
    await settle();

    expect(notifyCalls()).toHaveLength(0);
  });

  it.each([
    ['/app/chat-a', '/u/0/app/chat-a'],
    ['/u/0/app/chat-a', '/app/chat-a'],
  ])('a pending reply survives Gemini rewriting %s as %s', async (from, to) => {
    window.history.replaceState({}, '', from);
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start');
    navigate(to);
    dispatchPageObserverMessage('request-complete');

    expect(notifyCalls()).toHaveLength(1);
  });

  it('switching account on the same URL drops a pending completion', async () => {
    window.history.replaceState({}, '', '/app/chat-a');
    showAccount('alice@example.com');
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start');
    showAccount('bob@example.com');
    dispatchPageObserverMessage('request-complete');
    await settle();

    expect(notifyCalls()).toHaveLength(0);
  });

  it('a notify reply that returns after a same-URL account switch leaves no fallback toast', async () => {
    window.history.replaceState({}, '', '/app/chat-a');
    showAccount('alice@example.com');
    const reply = deferred<{ ok: boolean }>();
    (chrome.runtime.sendMessage as unknown as Mock).mockReturnValueOnce(reply.promise);
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    expect(notifyCalls()).toHaveLength(1);

    showAccount('bob@example.com');
    reply.resolve({ ok: false });
    await settle();
    returnToTab();

    expect(toast.showIfNeeded).not.toHaveBeenCalled();
  });

  it('an account email that vanishes for a moment is still compared when it returns', async () => {
    window.history.replaceState({}, '', '/app/chat-a');
    showAccount('alice@example.com');
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start');
    document.getElementById('account')?.remove();
    window.dispatchEvent(new Event('focus'));
    showAccount('bob@example.com');
    dispatchPageObserverMessage('request-complete');
    await settle();

    expect(notifyCalls()).toHaveLength(0);
  });

  it('an account email that appears mid-request is the same account', async () => {
    window.history.replaceState({}, '', '/app/chat-a');
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start');
    showAccount('alice@example.com');
    dispatchPageObserverMessage('request-complete');

    expect(notifyCalls()).toHaveLength(1);
  });

  it('switching account drops a pending completion and its fallback toast', async () => {
    window.history.replaceState({}, '', '/u/0/app/chat-a');
    (chrome.runtime.sendMessage as unknown as Mock).mockResolvedValueOnce({ ok: false });
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start', 1);
    dispatchPageObserverMessage('request-complete', 1);
    await settle();
    expect(notifyCalls()).toHaveLength(1);

    dispatchPageObserverMessage('request-start', 2);
    window.history.pushState({}, '', '/u/1/app/chat-a');
    dispatchPageObserverMessage('request-complete', 2);
    returnToTab();
    await settle();

    expect(notifyCalls()).toHaveLength(1);
    expect(toast.showIfNeeded).not.toHaveBeenCalled();
  });

  it('a notify reply that returns after a chat switch does nothing', async () => {
    window.history.replaceState({}, '', '/app/chat-a');
    const reply = deferred<{ ok: boolean }>();
    (chrome.runtime.sendMessage as unknown as Mock).mockReturnValueOnce(reply.promise);
    const { createResponseNotificationRun } = await import('../index');

    cleanup = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    expect(notifyCalls()).toHaveLength(1);

    window.history.pushState({}, '', '/app/chat-b');
    window.dispatchEvent(new PopStateEvent('popstate'));
    reply.resolve({ ok: false });
    await settle();
    returnToTab();

    expect(toast.showIfNeeded).not.toHaveBeenCalled();
  });

  it("a retired run's late setting read neither starts it nor disturbs its successor", async () => {
    const oldRead = deferred<Record<string, unknown>>();
    (chrome.storage.sync.get as unknown as Mock).mockReturnValueOnce(oldRead.promise);
    const { createResponseNotificationRun } = await import('../index');

    const old = createResponseNotificationRun();
    old.stop();
    cleanup = await startedRun(createResponseNotificationRun);
    oldRead.resolve({ [ENABLED_KEY]: true });
    await old.ready;

    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    await settle();

    expect(notifyCalls()).toHaveLength(1);
  });

  it("a retired run's late notify reply leaves its successor notifying alone", async () => {
    window.history.replaceState({}, '', '/app/chat-a');
    const oldReply = deferred<{ ok: boolean }>();
    (chrome.runtime.sendMessage as unknown as Mock).mockReturnValueOnce(oldReply.promise);
    const { createResponseNotificationRun } = await import('../index');

    const stopOld = await startedRun(createResponseNotificationRun);
    dispatchPageObserverMessage('request-start', 1);
    dispatchPageObserverMessage('request-complete', 1);
    expect(notifyCalls()).toHaveLength(1);

    cleanup = await startedRun(createResponseNotificationRun);
    stopOld();
    oldReply.resolve({ ok: false });
    await settle();
    returnToTab();
    expect(toast.showIfNeeded).not.toHaveBeenCalled();

    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    dispatchPageObserverMessage('request-start', 2);
    dispatchPageObserverMessage('request-complete', 2);
    await settle();
    expect(notifyCalls()).toHaveLength(2);
  });

  it('stop during the initial read starts nothing', async () => {
    const read = deferred<Record<string, unknown>>();
    (chrome.storage.sync.get as unknown as Mock).mockReturnValueOnce(read.promise);
    const { createResponseNotificationRun } = await import('../index');

    const run = createResponseNotificationRun();
    const listener = lastStorageListener();
    run.stop();
    read.resolve({ [ENABLED_KEY]: true });
    await run.ready;

    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    await settle();

    expect(notifyCalls()).toHaveLength(0);
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalledWith(listener);
  });

  it('aborting the signal stops the run', async () => {
    const { createResponseNotificationRun } = await import('../index');
    const owner = new AbortController();

    const run = createResponseNotificationRun({ signal: owner.signal });
    cleanup = run.stop;
    await run.ready;
    owner.abort();

    dispatchPageObserverMessage('request-start');
    dispatchPageObserverMessage('request-complete');
    await settle();

    expect(notifyCalls()).toHaveLength(0);
  });
});
