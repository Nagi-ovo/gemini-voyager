// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://chatgpt.com/" }
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { type ChatGptPageFixture, mountChatGptPage } from '../__tests__/chatgptPageFixture';
import { type Harness, createHarness, errorCode } from '../__tests__/harness';
import { liveAttachmentArea, unnamedAttachmentArea } from '../__tests__/liveAttachmentCard';
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
  it('does not send a text prompt with a file the person attached through the composer', async () => {
    page.form.prepend(liveAttachmentArea('probe-card.txt'));
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('composer-busy');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({ reason: 'attachments' });
    expect(page.events()).toMatchObject({ execCommand: 0, clicks: 0 });
  });

  it('does not send a text prompt beside an attachment card that names no file', async () => {
    page.form.prepend(unnamedAttachmentArea());
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('composer-busy');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({ reason: 'attachments' });
    expect(page.events()).toMatchObject({ execCommand: 0, clicks: 0 });
  });

  it('sends once the person removed their file and the attachment area is empty', async () => {
    page.form.prepend(liveAttachmentArea(null));
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toMatchObject({ ok: true });
    expect(page.events().clicks).toBe(1);
  });

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

  it('sends with the expected file whose live card names it in both its preview and remove controls', async () => {
    page.form.prepend(liveAttachmentArea('note.txt'));
    bridge.start('composer.send', { text: 'Read', expectAttachments: ['note.txt'] });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toMatchObject({ ok: true });
    expect(page.events().clicks).toBe(1);
  });

  it('refuses two live cards in the attachment area that both answer to the expected file', async () => {
    const area = liveAttachmentArea('note.txt');
    area.firstElementChild!.append(
      liveAttachmentArea('note(2).txt').firstElementChild!.firstElementChild!,
    );
    page.form.prepend(area);
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

describe('composer.send mode', () => {
  afterEach(() => {
    document.documentElement.lang = '';
  });

  it('sends nothing when the composer label names no measured mode, and says what it read', async () => {
    document.documentElement.lang = 'en-US';
    page.composer.setAttribute('aria-label', 'Ask anything');
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('mode-unknown');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      mode: 'unknown',
      lang: 'en-US',
      composerLabels: ['Ask anything'],
    });
    expect(page.events()).toMatchObject({ execCommand: 0, clicks: 0 });
  });

  it('does not send once the tab switched to Work while the send control was getting ready', async () => {
    const release = holdSend();
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(500);
    page.composer.setAttribute('aria-label', '使用 ChatGPT Work');
    release();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(page.events().clicks).toBe(0);
  });

  it('sends a prompt on a page in English', async () => {
    page = mountChatGptPage({ language: 'en' });
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toMatchObject({ ok: true });
  });

  it('sends a prompt on a page in a language the site data has no words for, by its switch', async () => {
    page = mountChatGptPage({ language: 'de', modeSwitch: 'live' });
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toMatchObject({ ok: true });
  });

  it('sends nothing into a Work composer in a language the site data has no words for', async () => {
    page = mountChatGptPage({ language: 'de', modeSwitch: 'live', mode: 'work' });
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(page.events()).toMatchObject({ execCommand: 0, clicks: 0 });
  });

  it('sends nothing into a ChatGPT Work composer', async () => {
    page = mountChatGptPage({ mode: 'work' });
    bridge.start('composer.send', { text: 'hi' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(errorCode(bridge.outcome())).toBe('mode-unavailable');
    expect(page.events()).toMatchObject({ execCommand: 0, clicks: 0 });
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

describe('composer.send into an existing conversation', () => {
  it('sends nothing when the tab shows another conversation than the one asked for', async () => {
    page = mountChatGptPage({ route: '/c/conv-b' });
    page.addTurn({ key: 'b-1', user: 'other chat', reply: { text: 'ok', turnState: 'complete' } });
    bridge.start('composer.send', { text: 'and now?', expect: { conversationId: 'conv-a' } });
    await vi.advanceTimersByTimeAsync(2_000);
    const outcome = bridge.outcome();
    expect(errorCode(outcome)).toBe('unverified');
    expect(outcome?.ok === false && outcome.error.details).toMatchObject({
      expected: 'conv-a',
      actual: 'conv-b',
    });
    expect(page.events()).toMatchObject({ execCommand: 0, clicks: 0 });
  });

  it('sends when the tab shows the conversation asked for', async () => {
    page = mountChatGptPage({ route: '/c/conv-a' });
    page.sendBehavior = { conversationId: 'conv-a' };
    bridge.start('composer.send', { text: 'and now?', expect: { conversationId: 'conv-a' } });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(bridge.outcome()).toMatchObject({ ok: true, data: { conversationId: 'conv-a' } });
    expect(page.events().clicks).toBe(1);
  });
});
