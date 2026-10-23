import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { chatgptAdapter } from '@/features/plugins/sites/adapters/chatgpt';
import { StarredMessagesService } from '@/features/savedLibrary/StarredMessagesService';

import type { ExportSite } from '../../exportSite';
import { createChatGptExportSite } from '../../sites/chatgpt';
import type { ChatGptCrawlTiming } from '../chatgptCrawl';
import { buildChatGptAdapter, chatgptIsConversationPage } from '../platform/chatgpt';
import { makeTurns, mountThreadFixture } from './chatgptThreadFixture';

const adapter = buildChatGptAdapter(chatgptAdapter);
let site: ExportSite;

/**
 * ChatGPT's logged-out page (issue #1066): served without an account at any width, not only
 * on phones. Desktop virtual-list attributes are deliberately absent.
 */
function mountLoggedOut(): void {
  document.body.innerHTML = `
    <main><div data-mobile-thread>
      <li data-message-role="user" id="u1" data-message-id="u1">
        <h4>You said:</h4><button data-user-message-bubble>Voyager 测试<br>second line</button>
        <button>Copy prompt</button><button>Edit prompt</button>
      </li>
      <li data-message-role="assistant" id="a1" data-message-id="a1" data-message-complete>
        <h4>ChatGPT said:</h4>
        <div data-assistant-markdown-root><p>First answer</p><ul><li>Item</li></ul>
          <pre><code class="language-js">const answer = 42;</code></pre>
        </div><button>Copy answer</button><button>Good response</button>
      </li>
      <section data-message-role="user" data-message-id="u2">
        <div data-user-message-bubble>Second prompt</div><button>Edit</button>
      </section>
      <section data-message-role="assistant" data-message-id="a2">
        <div data-assistant-markdown-root><p>Second answer</p></div><button>Copy</button>
      </section>
    </div></main>`;
}

function ids(): string[] {
  return site.turns.messages().map((message) => message.messageId);
}

beforeEach(() => {
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/uc/logged-out-chat');
  vi.spyOn(StarredMessagesService, 'getStarredMessagesForConversation').mockResolvedValue([]);
  site = createChatGptExportSite(adapter);
  mountLoggedOut();
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
  window.history.replaceState({}, '', '/');
});

describe('ChatGPT logged-out conversation recognition', () => {
  it.each(['/uc/logged-out-chat', '/u/1/uc/logged-out-chat', '/c/desktop', '/g/g-abc/c/desktop'])(
    'recognizes %s and extracts its conversation id',
    (path) => {
      document.body.replaceChildren();
      expect(chatgptIsConversationPage(document, `https://chatgpt.com${path}`)).toBe(true);
      window.history.replaceState({}, '', path);
      expect(adapter.extractConversationIdFromUrl()).toBe(path.split('/').at(-1));
    },
  );

  it('recognizes a mounted logged-out conversation before its URL changes', () => {
    expect(chatgptIsConversationPage(document, 'https://chatgpt.com/')).toBe(true);
    document.querySelector('[data-mobile-thread]')!.replaceChildren();
    expect(chatgptIsConversationPage(document, 'https://chatgpt.com/')).toBe(false);
    expect(chatgptIsConversationPage(document, 'https://chatgpt.com/uc/')).toBe(false);
  });

  it('does not show export on the home page for a hidden cached logged-out conversation', () => {
    document.querySelector('main')!.hidden = true;
    document.body.insertAdjacentHTML('beforeend', '<main><p>New chat</p></main>');
    expect(chatgptIsConversationPage(document, 'https://chatgpt.com/')).toBe(false);
    expect(chatgptIsConversationPage(document, 'https://chatgpt.com/library')).toBe(false);
    expect(site.turns.messages()).toEqual([]);
  });

  it("does not title the export with the logged-out page's marketing tab title", () => {
    const tabTitle = document.title;
    try {
      document.title = 'ChatGPT - Free AI chat';
      expect(site.title()).toBe('Conversation logged-o');
      window.history.replaceState({}, '', '/');
      expect(site.title()).toBe('Untitled Conversation');
      window.history.replaceState({}, '', '/c/desktop');
      document.body.innerHTML = '<main><section data-turn="user">Prompt</section></main>';
      document.title = 'Trip planning';
      expect(site.title()).toBe('Trip planning');
    } finally {
      document.title = tabTitle;
    }
  });
});

describe('ChatGPT logged-out page export', () => {
  it('offers logged-out messages in DOM order and prepares without a desktop crawl', async () => {
    const messages = site.turns.messages();
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
    expect(new Set(ids()).size).toBe(4);
    const session = await site.turns.prepare!({});
    expect(session?.messages().map((message) => message.messageId)).toEqual(ids());
    expect(await session?.roles!(new Set(ids()), {})).toEqual(
      new Map(messages.map((message) => [message.messageId, message.role])),
    );
    session?.release();
  });

  it('exports logged-out messages with rich content and leaves action labels out', async () => {
    const turns = await site.turns.build(new Set(ids()), {});
    expect(turns).toHaveLength(2);
    expect(turns[0].user).toBe('Voyager 测试\nsecond line');
    expect(turns[0].assistant).toContain('First answer');
    expect(turns[0].assistant).toContain('Item');
    expect(turns[0].assistant).toContain('```js\nconst answer = 42;\n```');
    expect(turns[0].assistantContent?.hasCode).toBe(true);
    expect(turns[0].assistantContent?.html).toContain('<li>Item</li>');
    expect(turns[1]).toMatchObject({ user: 'Second prompt', assistant: 'Second answer' });
    expect(JSON.stringify(turns)).not.toMatch(/Copy|Edit|Good response|You said|ChatGPT said/);
    expect(site.page.collectChatPairs().map((pair) => pair.assistant)).toHaveLength(2);
    expect(site.page.collectChatPairs()[0].assistant).toContain('First answer');
  });

  it('preserves user-only and assistant-only selections', async () => {
    const [userId, assistantId] = ids();
    expect(await site.turns.build(new Set([userId]), {})).toMatchObject([
      { user: 'Voyager 测试\nsecond line', assistant: '', omitEmptySections: true },
    ]);
    const turns = await site.turns.build(new Set([assistantId]), {});
    expect(turns).toHaveLength(1);
    expect(turns[0].user).toBe('');
    expect(turns[0].assistant).toContain('First answer');
  });

  it('never pairs selected messages across an unselected exchange', async () => {
    const messages = ids();
    expect(await site.turns.build(new Set([messages[0], messages[3]]), {})).toMatchObject([
      { user: 'Voyager 测试\nsecond line', assistant: '' },
      { user: '', assistant: 'Second answer' },
    ]);
  });

  it('keeps repeated text without native message ids separately selectable', async () => {
    document.querySelectorAll('[data-message-id]').forEach((element) => {
      element.removeAttribute('data-message-id');
      element.removeAttribute('id');
    });
    document.querySelectorAll('[data-user-message-bubble]').forEach((element) => {
      element.textContent = 'Same prompt';
    });
    const first = ids();
    expect(new Set(first).size).toBe(4);
    expect(ids()).toEqual(first);
    expect(await site.turns.build(new Set(first), {})).toMatchObject([
      { user: 'Same prompt' },
      { user: 'Same prompt' },
    ]);
  });

  it('exports a reconciled native message only once', async () => {
    const reply = document.querySelector('[data-message-id="a1"]')!;
    reply.after(reply.cloneNode(true));
    expect(ids()).toHaveLength(4);
    const turns = await site.turns.build(new Set(ids()), {});
    expect(turns).toHaveLength(2);
    expect(turns[0].assistant.match(/First answer/g)).toHaveLength(1);
  });

  it('ignores a cached hidden logged-out page, including its stop button', async () => {
    const cached = document.createElement('div');
    cached.hidden = true;
    cached.innerHTML = `<main><div data-mobile-thread>
      <div data-message-role="user"><div data-user-message-bubble>Cached prompt</div></div>
      <button data-testid="stop-button">Stop</button>
    </div></main>`;
    document.body.prepend(cached);
    expect(site.turns.messages()).toHaveLength(4);
    expect(JSON.stringify(await site.turns.build(new Set(ids()), {}))).not.toContain('Cached');
  });

  it('fails instead of dropping a selected message that disappeared', async () => {
    const selected = new Set(ids());
    document.querySelector('[data-message-id="a1"]')!.remove();
    await expect(site.turns.build(selected, {})).rejects.toThrow(
      'chatgpt_export_messages_missing:',
    );
  });

  it('does not export a reply that is still streaming', async () => {
    const selected = new Set(ids());
    // As measured live: an empty attribute on the message, and Stop outside `main`.
    document.querySelector('[data-message-id="a2"]')!.setAttribute('data-message-streaming', '');
    document.body.insertAdjacentHTML(
      'beforeend',
      '<button aria-label="Stop streaming">Stop</button>',
    );
    await expect(site.turns.build(selected, {})).rejects.toThrow(
      'chatgpt_export_response_still_generating',
    );
    document.querySelector('[data-message-id="a2"]')!.removeAttribute('data-message-streaming');
    await expect(site.turns.build(selected, {})).resolves.toHaveLength(2);
  });

  it('honors cancellation and conversation changes', async () => {
    const selected = new Set(ids());
    const controller = new AbortController();
    controller.abort();
    await expect(site.turns.build(selected, { signal: controller.signal })).rejects.toMatchObject({
      name: 'AbortError',
    });
    await expect(
      site.turns.build(selected, { expectedUrl: `${location.origin}/uc/another-chat` }),
    ).rejects.toThrow('chatgpt_export_conversation_changed');
  });

  // /uc/ has no Library stars to read; only a /c/ route exercises the asynchronous read.
  it('checks the route again after an asynchronous Library read', async () => {
    window.history.replaceState({}, '', '/c/with-stars');
    vi.mocked(StarredMessagesService.getStarredMessagesForConversation).mockImplementation(
      async () => {
        window.history.replaceState({}, '', '/c/another-chat');
        return [];
      },
    );
    await expect(site.turns.build(new Set(ids()), {})).rejects.toThrow(
      'chatgpt_export_conversation_changed',
    );
  });

  it('keeps the retained desktop reader when no logged-out thread is present', async () => {
    window.history.replaceState({}, '', '/c/desktop');
    document.body.innerHTML = `<main>
      <div data-turn-id-container="desktop-u"><div data-message-author-role="user">Desktop prompt</div></div>
      <div data-turn-id-container="desktop-a"><div data-message-author-role="assistant">Desktop answer</div></div>
    </main>`;
    expect(ids()).toEqual(['desktop-u', 'desktop-a']);
    expect(await site.turns.build(new Set(ids()), {})).toMatchObject([
      { user: 'Desktop prompt', assistant: 'Desktop answer' },
    ]);
  });
});

describe('ChatGPT export reader choice', () => {
  const FAST: Partial<ChatGptCrawlTiming> = {
    pollMs: 1,
    settleMs: 4,
    mountTimeoutMs: 400,
    historyIdleMs: 25,
    historyStallMs: 150,
  };
  const LOGGED_OUT_STRAY = `<div data-mobile-thread><div data-message-role="assistant">
    <div data-assistant-markdown-root><p>Stray</p></div></div></div>`;

  beforeEach(() => {
    window.history.replaceState({}, '', '/c/desktop');
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('reads retained desktop turns that sit inside a logged-out thread wrapper', async () => {
    document.body.innerHTML = `<main><div data-mobile-thread>
      <div data-turn-id-container="desktop-u"><div data-message-author-role="user">Desktop prompt</div></div>
      <div data-turn-id-container="desktop-a"><div data-message-author-role="assistant">Desktop answer</div></div>
    </div></main>`;
    expect(ids()).toEqual(['desktop-u', 'desktop-a']);
    expect(await site.turns.build(new Set(ids()), {})).toMatchObject([
      { user: 'Desktop prompt', assistant: 'Desktop answer' },
    ]);
  });

  it("crawls the virtual list's unmounted history when a logged-out message is also on the page", async () => {
    document.body.replaceChildren();
    const fixture = mountThreadFixture({ turns: makeTurns(6) });
    fixture.main.insertAdjacentHTML('afterbegin', LOGGED_OUT_STRAY);
    expect(fixture.mountedKeys().length).toBeLessThan(6);

    const options = { expectedUrl: location.href, timing: FAST };
    const session = await site.turns.prepare!(options);

    expect(session?.messages().map((message) => message.messageId)).toEqual(
      makeTurns(6).flatMap((turn) => [`${turn.key}:u`, `${turn.key}:a`]),
    );
    session?.release();
  });

  it('keeps the reader it prepared with when the page changes under the selection', async () => {
    document.body.innerHTML = `<main>
      <div data-turn-id-container="desktop-u"><div data-message-author-role="user">Desktop prompt</div></div>
    </main>`;
    expect(await site.turns.prepare!({})).toBeNull();
    mountLoggedOut();

    expect(ids()).toEqual([]);
    await site.turns.prepare!({});
    expect(ids()).toHaveLength(4);
  });

  it('offers the logged-out messages that mount after an export starts on an empty thread', async () => {
    window.history.replaceState({}, '', '/uc/logged-out-chat');
    document.body.innerHTML = '<main><div data-mobile-thread></div></main>';
    expect(await site.turns.prepare!({ expectedUrl: location.href })).toBeNull();
    // The messages mount while the export waits for the page to settle.
    mountLoggedOut();

    expect(ids()).toHaveLength(4);
    expect(await site.turns.build(new Set(ids()), {})).toHaveLength(2);
  });

  it('does not export another logged-out conversation opened before the selection appears', async () => {
    window.history.replaceState({}, '', '/uc/logged-out-chat');
    const selected = new Set(ids());
    const session = await site.turns.prepare!({ expectedUrl: location.href });
    window.history.replaceState({}, '', '/uc/another-chat');
    document.querySelector('[data-user-message-bubble]')!.textContent = 'Another prompt';
    const options = { expectedUrl: location.href };

    expect(session?.messages()).toEqual([]);
    await expect(session!.build(selected, options)).rejects.toThrow(
      'chatgpt_export_conversation_changed',
    );
    await expect(session!.roles!(selected, options)).rejects.toThrow(
      'chatgpt_export_conversation_changed',
    );
  });
});
