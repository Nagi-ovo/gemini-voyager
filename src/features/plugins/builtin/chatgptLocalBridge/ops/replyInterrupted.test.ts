// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/c/conv-1" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChatGptPageFixture, mountChatGptPage } from '../__tests__/chatgptPageFixture';
import { type Harness, createHarness, errorCode } from '../__tests__/harness';

vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn(async () => 'en') }));
vi.mock('@/core/ui/toast/toaster', () => ({
  createToaster: () => ({
    show: vi.fn(),
    dismiss: vi.fn(),
    setAnchor: vi.fn(),
    clear: vi.fn(),
    destroy: vi.fn(),
  }),
}));

let page: ChatGptPageFixture;
let bridge: Harness;
const WAIT = { conversationId: 'conv-1', afterUserTurnKey: 'turn-1' } as const;
const EN_NOTICE = 'Connection interrupted. Waiting for the complete answer';
const ZH_NOTICE = '连接已中断，正在等待完整答复';

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
  page = mountChatGptPage({ route: '/c/conv-1' });
  bridge = createHarness();
});

afterEach(() => {
  const running = bridge.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
  vi.useRealTimers();
});

/** A reply cut short: its partial text, an action-like row, and the notice under it (not yet measured live). */
function cutShort(item: HTMLElement, notice: string): void {
  page.setReply('turn-1', {
    text: 'Step 1 of 4 is done, now rendering',
    turnState: 'complete',
    actions: true,
    replyId: 'r-1',
  });
  item.insertAdjacentHTML(
    'beforeend',
    `<div><span>${notice}</span><button type="button">Retry</button></div>`,
  );
}

describe('Local Bridge on a reply cut short by a lost connection', () => {
  it('does not save a reply cut short as finished, and stalls with what the page showed', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'render the scene' });
    bridge.start('turns.waitReply', { ...WAIT, stallMs: 2 * 60_000 });
    cutShort(item, EN_NOTICE);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(bridge.outcome()).toBeUndefined();

    await vi.advanceTimersByTimeAsync(100_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('reply-stalled');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      interrupted: EN_NOTICE,
      turnState: 'complete',
      stop: false,
      thinking: [],
      replyTail: 'Step 1 of 4 is done, now rendering',
      buttonsAfterReply: expect.arrayContaining(['Retry']),
    });
  });

  it('knows the notice in the Chinese UI too', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'render the scene' });
    bridge.start('turns.waitReply', WAIT);
    cutShort(item, ZH_NOTICE);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(bridge.outcome()).toBeUndefined();
  });

  it('still finishes a reply, and a prompt, that only talk about the notice', async () => {
    const item = page.addTurn({ key: 'turn-1', user: `${ZH_NOTICE} 是什么意思？` });
    bridge.start('turns.waitReply', WAIT);
    page.setReply('turn-1', {
      text: `${EN_NOTICE}: ChatGPT shows this when its stream drops.`,
      turnState: 'complete',
      actions: true,
      replyId: 'r-1',
    });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bridge.outcome()).toMatchObject({ ok: true, data: { status: 'complete' } });
    expect(item.isConnected).toBe(true);
  });

  it('refuses to read a reply cut short', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'render the scene' });
    cutShort(item, EN_NOTICE);
    bridge.start('turns.read', { conversationId: 'conv-1', assistantTurnKey: 'r-1' });
    await vi.advanceTimersByTimeAsync(0);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      reason: 'connection-interrupted',
      notice: EN_NOTICE,
    });
  });

  it('times out with the state of the reply it was still waiting on', async () => {
    page.addTurn({ key: 'turn-1', user: 'render the scene' });
    bridge.start('turns.waitReply', { ...WAIT, timeoutMs: 60_000 });
    page.setReply('turn-1', { text: 'Working on it', turnState: 'streaming', replyId: 'r-1' });
    await vi.advanceTimersByTimeAsync(61_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('timeout');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      turnState: 'streaming',
      replyTail: 'Working on it',
    });
  });
});
