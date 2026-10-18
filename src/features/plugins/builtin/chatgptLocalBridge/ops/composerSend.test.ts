// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChatGptPageFixture, mountChatGptPage } from '../__tests__/chatgptPageFixture';
import { type Harness, createHarness, errorCode } from '../__tests__/harness';
import { namesFile } from './attachmentEvidence';

vi.mock('@/core/utils/userEvent', () => ({ isUserEvent: vi.fn(() => false) }));
vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: vi.fn(async () => 'zh') }));

let page: ChatGptPageFixture;
let bridge: Harness;

/** An uploaded attachment card as measured live: the name, and a `移除 <name>` control. */
function addCard(name: string): HTMLElement {
  const card = document.createElement('div');
  card.innerHTML = '<div><span></span><button type="button"></button></div>';
  card.querySelector('span')!.textContent = name;
  card.querySelector('button')!.setAttribute('aria-label', `移除 ${name}`);
  page.form.prepend(card);
  return card;
}

/** Keep the send control disabled until `release()`, as ChatGPT does while it gets ready. */
function holdSend(): () => void {
  Object.defineProperty(page.sendButton, 'disabled', {
    configurable: true,
    get: () => true,
    set: () => {},
  });
  return () => {
    Reflect.deleteProperty(page.sendButton, 'disabled');
    page.sendButton.disabled = false;
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  page = mountChatGptPage();
  bridge = createHarness();
});

afterEach(() => {
  const running = bridge.runtime.runningTaskId;
  if (running) bridge.runtime.abort(running);
  vi.useRealTimers();
});

describe('composer.send attachments', () => {
  it('does not send a file the person added beside the expected attachment', async () => {
    addCard('public-report.txt');
    addCard('private-payroll.csv');
    bridge.start('composer.send', { text: 'Review', expectAttachments: ['public-report.txt'] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(errorCode(bridge.outcome())).toBe('composer-busy');
    expect(page.events().clicks).toBe(0);
  });

  it('does not take a card for private-report.txt as the expected report.txt', async () => {
    addCard('private-report.txt');
    bridge.start('composer.send', { text: 'Review', expectAttachments: ['report.txt'] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()?.ok).toBe(false);
    expect(page.events().clicks).toBe(0);
  });

  it('refuses two cards that both answer to the one expected file', async () => {
    addCard('note.txt');
    addCard('note(2).txt');
    bridge.start('composer.send', { text: 'Read', expectAttachments: ['note.txt'] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(errorCode(bridge.outcome())).toBe('composer-busy');
    expect(page.events().clicks).toBe(0);
  });

  it('does not send an attachment that appeared while the prompt was being written', async () => {
    addCard('public-report.txt');
    const release = holdSend();
    bridge.start('composer.send', { text: 'Review', expectAttachments: ['public-report.txt'] });
    await vi.advanceTimersByTimeAsync(500);
    expect(page.events().execCommand).toBe(1);
    addCard('private-payroll.csv');
    release();
    await vi.advanceTimersByTimeAsync(3_000);
    expect(errorCode(bridge.outcome())).toBe('composer-busy');
    expect(page.events().clicks).toBe(0);
  });

  it('still sends with the expected card beside composer buttons that read like versions', async () => {
    addCard('public-report.txt');
    const model = document.createElement('button');
    model.type = 'button';
    model.setAttribute('aria-label', 'GPT-5.5 Thinking');
    page.form.append(model);
    bridge.start('composer.send', { text: 'Review', expectAttachments: ['public-report.txt'] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toMatchObject({ ok: true, data: { conversationId: 'conv-123' } });
    expect(page.events().clicks).toBe(1);
  });
});

describe('namesFile', () => {
  it('needs the whole file name, not the end of a longer one', () => {
    expect(namesFile('Remove private-report.txt', 'report.txt')).toBe(false);
    expect(namesFile('移除 report.txt', 'report.txt')).toBe(true);
    expect(namesFile('移除 note(2).txt', 'note.txt')).toBe(true);
    expect(namesFile('report.txt.zip', 'report.txt')).toBe(false);
    expect(namesFile('Could not upload report.txt.', 'report.txt')).toBe(true);
  });
});

describe('composer.send confirmation', () => {
  it("does not confirm a new chat's prompt under a conversation the person switched to", async () => {
    page.sendBehavior = { settledAfterMs: null };
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(500);
    expect(location.pathname).toBe('/c/local-chatgpt:4a1b2c');
    // The person opens another chat before the server named the new one; it holds the same words.
    page.list.innerHTML = '';
    page.addTurn({ key: 'b-1', user: 'hi', reply: { text: 'hello', turnState: 'complete' } });
    history.pushState(null, '', '/c/existing-b');
    await vi.advanceTimersByTimeAsync(31_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('send-unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({ sent: 'unknown' });
    expect(page.events().clicks).toBe(1);
  });

  it('reports send-unverified at once when the person leaves an existing chat after the send', async () => {
    page = mountChatGptPage({ route: '/c/conv-9' });
    page.sendBehavior = { provisionalAfterMs: null, settledAfterMs: null, turnAfterMs: null };
    bridge.start('composer.send', { text: 'again' });
    await vi.advanceTimersByTimeAsync(300);
    expect(page.events().clicks).toBe(1);
    page.list.innerHTML = '';
    page.addTurn({ key: 'other-1', user: 'again' });
    history.pushState(null, '', '/c/other-chat');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(errorCode(bridge.outcome())).toBe('send-unverified');
    expect(page.events().clicks).toBe(1);
  });
});
