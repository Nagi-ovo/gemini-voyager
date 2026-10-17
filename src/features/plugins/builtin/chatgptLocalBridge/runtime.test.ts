// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { isUserEvent } from '@/core/utils/userEvent';

import { type ChatGptPageFixture, mountChatGptPage } from './__tests__/chatgptPageFixture';
import { type Harness, createHarness, errorCode } from './__tests__/harness';
import { DETACH_GRACE_MS, createBridgeRuntime } from './runtime';

const toasts = vi.hoisted(() => ({ show: vi.fn() }));

vi.mock('@/core/utils/userEvent', () => ({ isUserEvent: vi.fn(() => false) }));
vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn(async () => 'zh') }));
vi.mock('@/core/ui/toast/toaster', () => ({
  createToaster: () => ({
    show: toasts.show,
    dismiss: vi.fn(),
    setAnchor: vi.fn(),
    clear: vi.fn(),
    destroy: vi.fn(),
  }),
}));

let page: ChatGptPageFixture;
let bridge: Harness;

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

/** Hold the send control disabled, as ChatGPT does while it is not ready to send. */
function holdSendDisabled(): void {
  Object.defineProperty(page.sendButton, 'disabled', { get: () => true, set: () => {} });
}

function noPageEvents(): void {
  expect(page.events()).toEqual({ execCommand: 0, clicks: 0, focus: 0 });
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
  vi.mocked(isUserEvent).mockReturnValue(false);
  toasts.show.mockClear();
  page = mountChatGptPage();
  bridge = createHarness();
});

afterEach(() => {
  const running = bridge.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
  vi.useRealTimers();
});

describe('Local Bridge runtime: op.start', () => {
  it('refuses an op.start meant for another document of the tab', () => {
    const ack = bridge.start('composer.send', { text: 'hi' }, { docNonce: 'earlier-document' });
    expect(ack).toEqual({ accepted: false, reason: 'doc-mismatch' });
    expect(bridge.runtime.runningTaskId).toBeNull();
    noPageEvents();
  });

  it('refuses ops while the plugin is not mounted', () => {
    const runtime = createBridgeRuntime({ send: async () => {}, listen: false });
    const harnessless = runtime.handleOpStart(
      {
        taskId: 'task-x',
        jobId: 'job',
        op: 'turns.read',
        opVersion: 1,
        params: {},
        deadlineMs: 1,
        issuedAt: 0,
      },
      { docNonce: 'unused', deadline: 0 },
    );
    expect(harnessless.accepted).toBe(false);
  });

  it('runs one op at a time and does not run a repeated task id twice', async () => {
    page.composer.remove();
    expect(bridge.start('composer.send', { text: 'hi' })).toEqual({ accepted: true });
    const first = bridge.taskId;
    expect(
      bridge.runtime.handleOpStart(
        {
          taskId: first,
          jobId: 'job-1',
          op: 'composer.send',
          opVersion: 1,
          params: { text: 'hi' },
          deadlineMs: 30_000,
          issuedAt: Date.now(),
        },
        { docNonce: (await import('./docIdentity')).getDocNonce(), deadline: Date.now() + 30_000 },
      ),
    ).toEqual({ accepted: true });
    expect(bridge.start('turns.read', { conversationId: 'c', assistantTurnKey: 'k' })).toEqual({
      accepted: false,
      reason: 'busy',
    });
  });

  it('answers a page-side op it does not run with unsupported-op', async () => {
    bridge.start('model.select', { target: { preset: 'pro' } });
    await vi.advanceTimersByTimeAsync(0);
    expect(errorCode(bridge.outcome())).toBe('unsupported-op');
    noPageEvents();
  });

  it('answers the background only, through the runtime message listener', () => {
    const addListener = vi.mocked(chrome.runtime.onMessage.addListener);
    addListener.mockClear();
    createBridgeRuntime({ send: async () => {} }).attach(null);
    const listener = addListener.mock.calls.at(-1)?.[0] as (
      message: unknown,
      sender: chrome.runtime.MessageSender,
      reply: (response: unknown) => void,
    ) => boolean;
    const reply = vi.fn();
    listener({ type: 'gv.bridge.lease.probe', leaseId: 'l' }, { id: chrome.runtime.id }, reply);
    expect(reply).toHaveBeenCalledWith({ stopped: true });
    reply.mockClear();
    const fromPageTab = { id: chrome.runtime.id, tab: { id: 3 } as chrome.tabs.Tab };
    listener({ type: 'gv.bridge.lease.probe', leaseId: 'l' }, fromPageTab, reply);
    expect(reply).not.toHaveBeenCalled();
    // A cancel for a task this document is not running stops nothing.
    const cancel = { type: 'gv.bridge.op.cancel', taskId: 't', reason: 'cli-cancel' };
    listener(cancel, fromPageTab, reply);
    expect(reply).not.toHaveBeenCalled();
    listener(cancel, { id: chrome.runtime.id }, reply);
    expect(reply).toHaveBeenCalledWith({ stopped: false });
  });
});

describe('Local Bridge runtime: lease probe', () => {
  it('reports a live holder until its lease expires, then stops it without touching the page', async () => {
    page.composer.remove();
    bridge.start('composer.send', { text: 'hi' }, { deadline: Date.now() + 5_000 });
    expect(bridge.runtime.handleLeaseProbe('other-lease')).toEqual({ stopped: true });
    expect(bridge.runtime.handleLeaseProbe('lease-1')).toEqual({ stopped: false });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(bridge.runtime.handleLeaseProbe('lease-1')).toEqual({ stopped: true });
    page.form.prepend(page.composer);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(errorCode(bridge.outcome())).toBe('timeout');
    noPageEvents();
  });
});

describe('Local Bridge composer.send', () => {
  it('confirms a new chat only once the server named it and the prompt rendered', async () => {
    bridge.start('composer.send', { text: '只回复 OK' });
    await vi.advanceTimersByTimeAsync(500);
    // The provisional `local-…` route and the rendered prompt are not enough yet.
    expect(location.pathname).toBe('/c/local-chatgpt:4a1b2c');
    expect(bridge.outcome()).toBeUndefined();

    await vi.advanceTimersByTimeAsync(1_500);
    expect(bridge.outcome()).toEqual({
      ok: true,
      data: {
        conversationId: 'conv-123',
        userTurnKey: 'turn-new',
        url: 'https://chatgpt.com/c/conv-123',
      },
    });
    expect(page.events().clicks).toBe(1);
  });

  it('takes the newest prompt in an existing chat, not an identical older one', async () => {
    page = mountChatGptPage({
      route: '/c/conv-9',
      turns: [],
    });
    page.addTurn({ key: 'turn-old', user: 'again', reply: { text: 'ok', turnState: 'complete' } });
    page.sendBehavior = { provisionalAfterMs: null, settledAfterMs: null };
    bridge.start('composer.send', { text: 'again' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { conversationId: 'conv-9', userTurnKey: 'turn-new' },
    });
  });

  it('leaves a draft alone and reports composer-busy', async () => {
    page.setDraft('my unsent notes');
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(0);
    expect(errorCode(bridge.outcome())).toBe('composer-busy');
    expect(page.composer.textContent).toBe('my unsent notes');
    noPageEvents();
  });

  it('yields to a person who typed in the composer in the last 8 s', async () => {
    vi.mocked(isUserEvent).mockReturnValue(true);
    page.composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    vi.mocked(isUserEvent).mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(7_000);
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(0);
    expect(errorCode(bridge.outcome())).toBe('composer-busy');
    noPageEvents();
  });

  it('refuses a hidden tab before any page event', async () => {
    setVisibility('hidden');
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(0);
    expect(errorCode(bridge.outcome())).toBe('tab-hidden');
    noPageEvents();
  });

  it('sends nothing after a cancel while it waits for the composer', async () => {
    page.composer.remove();
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    bridge.runtime.abort(bridge.taskId);
    page.form.prepend(page.composer);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(errorCode(bridge.outcome())).toBe('cancelled');
    noPageEvents();
  });

  it('never clicks send after a cancel while it waits for the send control', async () => {
    holdSendDisabled();
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(page.events().execCommand).toBe(1);
    bridge.runtime.abort(bridge.taskId);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(errorCode(bridge.outcome())).toBe('cancelled');
    expect(page.events().clicks).toBe(0);
  });

  it('reports a cancel after the click as send-unverified, so nobody sends again', async () => {
    page.sendBehavior = { settledAfterMs: null, turnAfterMs: null };
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    bridge.runtime.abort(bridge.taskId);
    await vi.advanceTimersByTimeAsync(0);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('send-unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      sent: 'unknown',
      cause: 'cancelled',
    });
    expect(page.events().clicks).toBe(1);
  });

  it('stops at once and tells the person when a challenge replaces the page mid-op', async () => {
    page.composer.remove();
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(1_000);
    document.title = 'Just a moment...';
    document.body.innerHTML = '<div id="challenge-running">Checking your browser</div>';
    await vi.advanceTimersByTimeAsync(500);
    expect(errorCode(bridge.outcome())).toBe('challenge');
    expect(toasts.show).toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }));
    noPageEvents();
  });
});

describe('Local Bridge runtime: remount', () => {
  it('terminates an interactive op on detach and starts nothing on re-attach', async () => {
    holdSendDisabled();
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(500);
    bridge.runtime.detach();
    bridge.runtime.attach(null);
    await vi.advanceTimersByTimeAsync(10_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('cancelled');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      reason: 'adapter-reloaded',
    });
    expect(page.events().clicks).toBe(0);
    const done = bridge.sent.filter((message) => message.type === 'gv.bridge.op.done');
    expect(done).toHaveLength(1);
    expect(bridge.runtime.runningTaskId).toBeNull();
  });

  it('keeps a passive op through a remount and ends it once the plugin stays off', async () => {
    history.replaceState(null, '', '/c/conv-1');
    page.addTurn({ key: 'turn-1', user: 'q' });
    bridge.start('turns.waitReply', { conversationId: 'conv-1', afterUserTurnKey: 'turn-1' });
    bridge.runtime.detach();
    await vi.advanceTimersByTimeAsync(1_000);
    bridge.runtime.attach(null);
    await vi.advanceTimersByTimeAsync(DETACH_GRACE_MS * 2);
    expect(bridge.outcome()).toBeUndefined();

    bridge.runtime.detach();
    await vi.advanceTimersByTimeAsync(DETACH_GRACE_MS + 1_000);
    expect(errorCode(bridge.outcome())).toBe('bridge-disabled');
  });
});
