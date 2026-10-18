// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  type ChatGptPageFixture,
  type PageOptions,
  mountChatGptPage,
} from '../__tests__/chatgptPageFixture';
import { type Harness, createHarness, errorCode } from '../__tests__/harness';

vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn(async () => 'en') }));

let page: ChatGptPageFixture;
let bridge: Harness;

function mount(options: PageOptions): void {
  page = mountChatGptPage(options);
  bridge = createHarness();
}

function setVisibility(state: 'visible' | 'hidden'): void {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
}

beforeEach(() => {
  vi.useFakeTimers();
  setVisibility('visible');
});

afterEach(() => {
  const running = bridge?.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
  vi.useRealTimers();
});

describe('Local Bridge conversation.ready: mode', () => {
  it('switches a work-mode page to chat with one click on its own switch', async () => {
    mount({ mode: 'work' });
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(1_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { mode: 'chat', switchedMode: { from: 'work', to: 'chat' } },
    });
    expect(page.mode()).toBe('chat');
    expect(page.events().clicks).toBe(1);
  });

  it('finds a mode switch that renders after the composer on a fresh tab', async () => {
    mount({ mode: 'work' });
    const header = document.querySelector<HTMLElement>('[data-gv-fixture-header]')!;
    const toggle = Array.from(header.childNodes);
    header.replaceChildren();
    setTimeout(() => header.append(...toggle), 1_500);
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(2_500);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { mode: 'chat', switchedMode: { from: 'work', to: 'chat' } },
    });
    expect(page.events().clicks).toBe(1);
  });

  it('leaves a chat-mode page alone', async () => {
    mount({ mode: 'chat' });
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(0);

    const outcome = bridge.outcome();
    expect(outcome).toMatchObject({ ok: true, data: { mode: 'chat' } });
    expect(outcome?.ok && 'switchedMode' in (outcome.data as object)).toBe(false);
    expect(page.events().clicks).toBe(0);
  });

  it('switches back to work when a close restores the mode the tab had', async () => {
    mount({ mode: 'chat' });
    bridge.start('conversation.ready', { ensureMode: 'work' });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { mode: 'work', switchedMode: { from: 'chat', to: 'work' } },
    });
    expect(page.mode()).toBe('work');
  });

  it('goes home through the page link to restore the mode from a conversation', async () => {
    mount({ mode: 'chat', route: '/c/conv-1' });
    // Measured live: the switch renders on the new-chat page only.
    const header = document.querySelector<HTMLElement>('[data-gv-fixture-header]')!;
    const toggle = Array.from(header.childNodes);
    header.replaceChildren();
    const nav = document.createElement('nav');
    nav.innerHTML = '<a href="/" aria-label="首页">ChatGPT</a>';
    nav.querySelector('a')!.addEventListener('click', (event) => {
      event.preventDefault();
      history.pushState(null, '', '/');
      setTimeout(() => header.append(...toggle), 600);
    });
    document.body.prepend(nav);
    bridge.start('conversation.ready', { ensureMode: 'work' });
    await vi.advanceTimersByTimeAsync(2_000);

    expect(bridge.outcome()).toMatchObject({
      ok: true,
      data: { mode: 'work', switchedMode: { from: 'chat', to: 'work' } },
    });
    expect(location.pathname).toBe('/');
    expect(page.events().clicks).toBe(2);
  });

  it('fails closed without a click when the switch lacks its measured data-state', async () => {
    mount({ mode: 'work', modeSwitch: 'no-state' });
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(6_000);

    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(page.events().clicks).toBe(0);
  });

  it('fails closed without a click when there is no switch at all', async () => {
    mount({ mode: 'work', modeSwitch: 'none' });
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(6_000);

    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(page.events().clicks).toBe(0);
  });

  it('reports a switch the page never confirms, and clicks only once', async () => {
    mount({ mode: 'work', switchWorks: false });
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(6_000);

    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(page.events().clicks).toBe(1);
  });

  it('refuses to switch in a hidden tab, before any click', async () => {
    mount({ mode: 'work' });
    setVisibility('hidden');
    bridge.start('conversation.ready', {});
    await vi.advanceTimersByTimeAsync(0);

    expect(errorCode(bridge.outcome())).toBe('tab-hidden');
    expect(page.events().clicks).toBe(0);
    expect(page.mode()).toBe('work');
  });
});

describe('Local Bridge conversation.ready: deadline', () => {
  it('waits for the app shell only as long as its grant lasts', async () => {
    mount({});
    page.form.remove();
    bridge.start('conversation.ready', {}, { deadline: Date.now() + 5_000 });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(errorCode(bridge.outcome())).toBe('timeout');
  });
});
