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
const TURN = { conversationId: 'conv-1', afterUserTurnKey: 'turn-1' } as const;

interface CardCopy {
  readonly app: string;
  readonly question: string;
  readonly always: string;
  readonly deny: string;
  readonly once: string;
}

const ZH: CardCopy = {
  app: 'Google Drive',
  question: '允许 ChatGPT 使用 Google Drive 吗？',
  always: '始终允许',
  deny: '拒绝',
  once: '允许一次',
};

/**
 * The card as measured on 2026-10-20 (voyager-cli
 * docs/notes/2026-10-20-approval-card/dom-structure.json). Each button records
 * its clicks; `answer` plays ChatGPT taking the card away.
 */
function showCard(
  item: HTMLElement,
  copy: CardCopy = ZH,
  answer: (card: HTMLElement) => void = (card) => card.remove(),
): { readonly clicks: string[] } {
  const clicks: string[] = [];
  const card = document.createElement('div');
  card.className =
    'flex flex-col overflow-hidden rounded-3xl border bg-surface-elevated-secondary @container/approval-card';
  card.innerHTML = `
    <div><div role="alert"><div>
      <div><svg></svg><span>${copy.app}</span></div>
      <div><div>${copy.question}</div><div><button type="button">查看详情</button></div></div>
    </div></div></div>
    <form class="flex shrink-0 items-center gap-2 @max-md/approval-card:flex-col">
      <button type="button" data-test="always"><span>${copy.always}</span></button>
      <div>
        <button type="button" data-test="deny"><span>${copy.deny} <kbd>Esc</kbd></span></button>
        <div>
          <button type="button" data-test="once"><span>${copy.once}</span><span><kbd>⏎</kbd></span></button>
          <button type="button" data-test="menu"><svg></svg></button>
        </div>
      </div>
    </form>`;
  for (const button of card.querySelectorAll<HTMLButtonElement>('button[data-test]')) {
    button.addEventListener('click', () => {
      clicks.push(button.dataset.test!);
      answer(card);
    });
  }
  item.appendChild(card);
  return { clicks };
}

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

describe('Local Bridge turns.waitReply on an approval card', () => {
  it('stops with approval-required when ChatGPT asks to allow Google Drive mid-reply', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    page.setReply('turn-1', { text: 'Uploading the file', turnState: 'streaming' });
    bridge.start('turns.waitReply', { ...TURN, stopOnApproval: true });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(bridge.outcome()).toBeUndefined();

    showCard(item);
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('approval-required');
    expect(outcome).toMatchObject({
      error: { details: { app: 'Google Drive', choices: ['always', 'once'] } },
    });
  });

  it('keeps waiting on the card when the caller did not ask to stop on it', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    page.setReply('turn-1', { text: 'Uploading the file', turnState: 'streaming' });
    showCard(item);
    bridge.start('turns.waitReply', TURN);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(bridge.outcome()).toBeUndefined();
  });

  it("does not take a later prompt's approval card as this reply's", async () => {
    page.addTurn({
      key: 'turn-1',
      user: 'first',
      reply: { text: 'Working', turnState: 'streaming' },
    });
    const later = page.addTurn({ key: 'turn-2', user: 'second' });
    showCard(later);
    bridge.start('turns.waitReply', { ...TURN, stopOnApproval: true });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bridge.outcome()).toBeUndefined();
  });
});

describe('Local Bridge turns.approve', () => {
  it('clicks Always allow, not Allow once, and reports the card answered', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    const card = showCard(item);
    bridge.start('turns.approve', { ...TURN, choice: 'always' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(card.clicks).toEqual(['always']);
    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { clicked: true, app: 'Google Drive' },
    });
  });

  it('clicks Allow once by its ⏎ hint', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    const card = showCard(item);
    bridge.start('turns.approve', { ...TURN, choice: 'once' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(card.clicks).toEqual(['once']);
    expect(bridge.outcome()).toMatchObject({ ok: true, data: { clicked: true } });
  });

  it('finds the buttons in an English UI too, by their keyboard hints', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    const card = showCard(item, {
      app: 'Google Drive',
      question: 'Allow ChatGPT to use Google Drive?',
      always: 'Always allow',
      deny: 'Deny',
      once: 'Allow once',
    });
    bridge.start('turns.approve', { ...TURN, choice: 'always' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(card.clicks).toEqual(['always']);
  });

  it('clicks nothing when the card was already answered', async () => {
    page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    bridge.start('turns.approve', { ...TURN, choice: 'always' });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(bridge.outcome()).toMatchObject({ ok: true, data: { clicked: false } });
  });

  it('clicks once and fails unverified when the card stays after the click', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    const card = showCard(item, ZH, () => {});
    bridge.start('turns.approve', { ...TURN, choice: 'always' });
    await vi.advanceTimersByTimeAsync(15_000);
    expect(card.clicks).toEqual(['always']);
    expect(errorCode(bridge.outcome())).toBe('unverified');
  });

  it('refuses to click without a page lease', async () => {
    const item = page.addTurn({ key: 'turn-1', user: 'save this to my Drive' });
    const card = showCard(item);
    bridge.start('turns.approve', { ...TURN, choice: 'always' }, { leaseId: undefined });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(card.clicks).toEqual([]);
    expect(errorCode(bridge.outcome())).toBe('cancelled');
  });
});
