import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashString } from '@/core/utils/hash';
import { createContentExtractor } from '@/features/export/services/DOMContentExtractor';
import { chatgptAdapter } from '@/features/plugins/sites/adapters/chatgpt';
import { StarredMessagesService } from '@/features/savedLibrary/StarredMessagesService';
import type { StarredMessage } from '@/features/savedLibrary/starTypes';
import { CatalogTimelineAdapter } from '@/features/timeline/adapters/catalog/CatalogTimelineAdapter';
import { CatalogTurnOwnership } from '@/features/timeline/adapters/catalog/CatalogTurnOwnership';
import { turnSummary } from '@/features/timeline/adapters/catalog/turnHash';

import { createChatGptExportSite } from '../../sites/chatgpt';
import { buildChatGptTurnsForSelection } from '../chatgpt';
import type { ChatGptCrawlTiming } from '../chatgptCrawl';
import { createChatGptThreadPreparer, type ChatGptThreadSession } from '../chatgptThreadExport';
import { buildChatGptAdapter } from '../platform/chatgpt';
import { makeTurns, mountThreadFixture } from './chatgptThreadFixture';

const FAST: Partial<ChatGptCrawlTiming> = {
  pollMs: 1,
  settleMs: 4,
  mountTimeoutMs: 400,
  historyIdleMs: 25,
  historyStallMs: 150,
};
const extractor = createContentExtractor(buildChatGptAdapter(chatgptAdapter));
let libraryRead: MockInstance<(id: string) => Promise<StarredMessage[]>>;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

function star(rawBubbleText: string): StarredMessage {
  const bubble = document.createElement('div');
  bubble.textContent = rawBubbleText;
  return {
    turnId: `c-7-${hashString(turnSummary(bubble))}~2`,
    content: 'Truncated Library preview',
    conversationId: 'chatgpt:conv:conv',
    conversationUrl: 'https://chatgpt.com/u/1/c/conv',
    starredAt: 1,
  };
}

function mountRetained(): void {
  document.body.innerHTML = `
    <main>
      <div data-turn-id-container="prompt-uuid">
        <div data-message-author-role="user">
          <div data-user-message-bubble><div>First</div><div>Second</div></div>
          <button>Copy message</button>
        </div>
      </div>
      <div data-turn-id-container="reply-uuid">
        <div data-message-author-role="assistant"><p>Answer</p></div>
      </div>
    </main>`;
}

beforeEach(() => {
  document.body.replaceChildren();
  vi.stubGlobal('location', new URL('https://chatgpt.com/u/1/c/conv'));
  libraryRead = vi
    .spyOn(StarredMessagesService, 'getStarredMessagesForConversation')
    .mockResolvedValue([]);
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }
});

describe('ChatGPT Library stars on retained containers', () => {
  it('a streaming reply with a Library star exports the completed answer', async () => {
    vi.useFakeTimers();
    mountRetained();
    libraryRead.mockResolvedValue([star('FirstSecond')]);
    const reply = document.querySelector<HTMLElement>('[data-message-author-role="assistant"]')!;
    reply.textContent = 'Partial answer';
    reply.setAttribute('data-message-streaming', 'true');
    window.setTimeout(() => {
      reply.textContent = 'Completed answer';
      reply.removeAttribute('data-message-streaming');
    }, 100);
    const outcome = buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor }).then(
      (turns) => ({ turns, error: null }),
      (error: unknown) => ({ turns: null, error }),
    );

    await vi.advanceTimersByTimeAsync(1000);

    expect(await outcome).toMatchObject({
      error: null,
      turns: [{ user: '', assistant: 'Completed answer', starred: true }],
    });
  });

  it('materializes an unselected virtual prompt for an assistant-only star and restores scroll', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <main style="overflow-y:auto">
        <div data-turn-id-container="prompt-uuid"><section data-turn="user"></section></div>
        <div data-turn-id-container="reply-uuid"><section data-turn="assistant">
          <div data-message-author-role="assistant"><p>Answer</p></div>
        </section></div>
      </main>`;
    const scroller = document.querySelector('main')!;
    Object.defineProperty(scroller, 'scrollHeight', { configurable: true, value: 2000 });
    Object.defineProperty(scroller, 'clientHeight', { configurable: true, value: 500 });
    scroller.scrollTop = 250;
    libraryRead.mockResolvedValue([star('Offscreen prompt')]);
    const prompt = document.querySelector<HTMLElement>('[data-turn-id-container="prompt-uuid"]')!;
    const reply = document.querySelector<HTMLElement>('[data-turn-id-container="reply-uuid"]')!;
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementation(
      function (this: HTMLElement) {
        scroller.scrollTop = 0;
        if (this === prompt) {
          prompt.innerHTML = '<div data-message-author-role="user">Offscreen prompt</div>';
          reply.innerHTML = '<section data-turn="assistant"></section>';
        } else if (this === reply) {
          reply.innerHTML = '<div data-message-author-role="assistant"><p>Answer</p></div>';
        }
      },
    );

    const build = buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor });
    await vi.advanceTimersByTimeAsync(1000);

    await expect(build).resolves.toMatchObject([{ user: '', assistant: 'Answer', starred: true }]);
    expect(scroller.scrollTop).toBe(250);
  });

  it('rejects a branch switch during the offscreen prompt and return scroll instead of starring a new answer', async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <main>
        <div data-turn-id-container="oldprompt"><section data-turn="user"></section></div>
        <div data-turn-id-container="oldreply">
          <div data-message-author-role="assistant"><p>Old answer</p></div>
        </div>
      </main>`;
    const prompt = document.querySelector<HTMLElement>('[data-turn-id-container="oldprompt"]')!;
    const reply = document.querySelector<HTMLElement>('[data-turn-id-container="oldreply"]')!;
    libraryRead.mockResolvedValue([star('Old prompt')]);
    const scrolls: string[] = [];
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementation(
      function (this: HTMLElement) {
        scrolls.push(this.getAttribute('data-turn-id-container')!);
        if (this === prompt) {
          prompt.innerHTML = '<div data-message-author-role="user">Old prompt</div>';
          reply.innerHTML = '<section data-turn="assistant"></section>';
        } else if (this === reply) {
          prompt.setAttribute('data-turn-id-container', 'newprompt');
          reply.setAttribute('data-turn-id-container', 'newreply');
          prompt.innerHTML = '<div data-message-author-role="user">New prompt</div>';
          reply.innerHTML =
            '<div data-message-author-role="assistant"><p>New branch answer</p></div>';
        }
      },
    );

    const outcome = buildChatGptTurnsForSelection(new Set(['oldreply']), { extractor }).then(
      (turns) => ({ turns, error: null }),
      (error: unknown) => ({ turns: null, error }),
    );
    await vi.advanceTimersByTimeAsync(1000);

    const result = await outcome;
    expect(scrolls).toEqual(['oldprompt', 'oldreply']);
    expect(result.error).toMatchObject({ message: 'chatgpt_export_thread_changed' });
    expect(result.turns).toBeNull();
  });

  it('rejects a prompt learned on mount when the return scroll changes its text under the same ids', async () => {
    vi.useFakeTimers();
    mountRetained();
    const prompt = document.querySelector<HTMLElement>('[data-turn-id-container="prompt-uuid"]')!;
    const reply = document.querySelector<HTMLElement>('[data-turn-id-container="reply-uuid"]')!;
    prompt.innerHTML = '<section data-turn="user"></section>';
    libraryRead.mockResolvedValue([star('Old prompt')]);
    vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementation(
      function (this: HTMLElement) {
        if (this === prompt) {
          prompt.innerHTML = '<div data-message-author-role="user">Old prompt</div>';
          reply.innerHTML = '<section data-turn="assistant"></section>';
        } else if (this === reply) {
          prompt.innerHTML = '<div data-message-author-role="user">New prompt</div>';
          reply.innerHTML = '<div data-message-author-role="assistant"><p>Answer</p></div>';
        }
      },
    );
    const outcome = buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor }).then(
      () => null,
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(1000);
    expect(await outcome).toMatchObject({ message: 'chatgpt_export_thread_changed' });
  });

  it('a zero-star assistant export does not materialize its offscreen prompt', async () => {
    mountRetained();
    document.querySelector('[data-turn-id-container="prompt-uuid"]')!.innerHTML = '';

    const turns = await buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor });

    expect(turns).toMatchObject([{ user: '', assistant: 'Answer', starred: false }]);
    expect(libraryRead).toHaveBeenCalledTimes(1);
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it('rejects a prompt edited during the Library read instead of assigning its old star', async () => {
    mountRetained();
    libraryRead.mockImplementation(async () => {
      document.querySelector('[data-user-message-bubble]')!.textContent = 'Edited prompt';
      return [star('FirstSecond')];
    });

    await expect(
      buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor }),
    ).rejects.toThrow('chatgpt_export_thread_changed');
  });

  it.each(['<section data-turn="user"></section>', '<div data-message-author-role="user"></div>'])(
    'allows a prompt to unmount to %s during the Library read and hashes it after remounting',
    async (placeholder) => {
      vi.useFakeTimers();
      mountRetained();
      const prompt = document.querySelector<HTMLElement>('[data-turn-id-container="prompt-uuid"]')!;
      libraryRead.mockImplementation(async () => {
        prompt.innerHTML = placeholder;
        return [star('FirstSecond')];
      });
      vi.mocked(HTMLElement.prototype.scrollIntoView).mockImplementation(
        function (this: HTMLElement) {
          if (this === prompt) {
            prompt.innerHTML = '<div data-message-author-role="user">FirstSecond</div>';
          }
        },
      );

      const build = buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor });
      await vi.advanceTimersByTimeAsync(500);

      await expect(build).resolves.toMatchObject([
        { user: '', assistant: 'Answer', starred: true },
      ]);
    },
  );

  it('surfaces a Library read failure at the retained final build', async () => {
    mountRetained();
    libraryRead.mockRejectedValue(new Error('Library unavailable'));

    await expect(
      buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor }),
    ).rejects.toThrow('Library unavailable');
  });
});

describe('ChatGPT Library stars on a crawled thread', () => {
  it('rejects a reply regenerated while its Library read is pending', async () => {
    const fixture = mountThreadFixture({ turns: makeTurns(3) });
    const session = await createChatGptThreadPreparer().prepare({ extractor, timing: FAST });
    if (!session) throw new Error('thread was not prepared');
    libraryRead.mockImplementation(async () => {
      fixture.replaceTurn('turn-03', { replyId: 'regenerated-reply' });
      return [star('Question 3')];
    });
    try {
      await expect(session.build(new Set(['turn-03:a']), {})).rejects.toThrow(
        'chatgpt_export_thread_changed',
      );
      expect(session.containers()).toEqual([]);
    } finally {
      session.release();
    }
  });

  it('does not revive a session released during its Library read', async () => {
    mountThreadFixture({ turns: makeTurns(2) });
    const session = await createChatGptThreadPreparer().prepare({ extractor, timing: FAST });
    if (!session) throw new Error('thread was not prepared');
    libraryRead.mockImplementation(async () => {
      session.release();
      return [star('Question 1')];
    });

    await expect(session.build(new Set(['turn-01:a']), {})).rejects.toThrow(
      'chatgpt_export_thread_incomplete',
    );
    expect(session.containers()).toEqual([]);
  });

  it('surfaces a Library failure in a crawled session build', async () => {
    mountThreadFixture({ turns: makeTurns(2) });
    const session = await createChatGptThreadPreparer().prepare({ extractor, timing: FAST });
    if (!session) throw new Error('thread was not prepared');
    libraryRead.mockRejectedValue(new Error('Library unavailable'));
    try {
      await expect(session.build(new Set(['turn-01:a']), {})).rejects.toThrow(
        'Library unavailable',
      );
    } finally {
      session.release();
    }
  });
});

describe('ChatGPT timeline and export star identity', () => {
  it.each(['retained', 'crawled'] as const)(
    'exports the real %s timeline marker star from the raw inner bubble despite controls and export line breaks',
    async (kind) => {
      let session: ChatGptThreadSession | null = null;
      if (kind === 'retained') mountRetained();
      else {
        const fixture = mountThreadFixture({
          turns: [{ key: 'one', height: 200, user: 'FirstSecond', assistant: 'Answer' }],
        });
        fixture.main.querySelector('[data-user-message-bubble] [dir="auto"]')!.innerHTML =
          '<div>First</div><div>Second</div>';
      }
      const ownership = new CatalogTurnOwnership({
        routeId: () => location.href,
        starId: () => 'chatgpt:conv:conv',
      });
      ownership.begin();
      const timeline = new CatalogTimelineAdapter(
        {
          siteId: chatgptAdapter.id,
          siteLabel: chatgptAdapter.label,
          turnSelector: chatgptAdapter.selectors.userTurn,
          assistantTurnSelector: chatgptAdapter.selectors.assistantTurn,
          conversationIdPattern: chatgptAdapter.conversationIdPattern,
          position: 'right',
          pluginId: 'voyager.chatgpt-timeline',
          coachmarkId: 'test',
        },
        ownership,
      );
      const markers = timeline.turns.read([]).markers;
      expect(markers).toHaveLength(1);
      const marker = markers[0]!;
      timeline.turns.stop();
      libraryRead.mockResolvedValue([{ ...star('unused'), turnId: marker.id }]);
      if (kind === 'crawled') {
        session = await createChatGptThreadPreparer().prepare({ extractor, timing: FAST });
        if (!session) throw new Error('Expected a crawled thread');
      }
      try {
        const turns = session
          ? await session.build(new Set(['one:u', 'one:a']), {})
          : await buildChatGptTurnsForSelection(new Set(['prompt-uuid', 'reply-uuid']), {
              extractor,
            });
        expect(turns).toMatchObject([{ assistant: 'Answer', starred: true }]);
        expect(turns[0]!.user).toContain('First\nSecond');
        expect(marker.summary).toBe('FirstSecond');
        expect(libraryRead).toHaveBeenCalledWith('chatgpt:conv:conv');
        expect(libraryRead).toHaveBeenCalledTimes(1);
      } finally {
        session?.release();
      }
    },
  );
});

describe('ChatGPT export Library inputs', () => {
  it.each(['/', '/?temporary-chat=true'])(
    'exports an unnamed route %s without reading a Library namespace',
    async (path) => {
      mountRetained();
      vi.stubGlobal('location', new URL(path, 'https://chatgpt.com'));
      expect(
        await buildChatGptTurnsForSelection(new Set(['reply-uuid']), { extractor }),
      ).toMatchObject([{ starred: false }]);
      expect(libraryRead).not.toHaveBeenCalled();
    },
  );

  it('keeps offscreen duplicate prompts starred through positional aliases and reads a removed star at the next build', async () => {
    const prompt = 'Repeated prompt with text beyond a short Library preview';
    libraryRead.mockResolvedValue([star(prompt)]);
    const fixture = mountThreadFixture({
      turns: [
        { key: 'first', height: 1500, user: prompt, assistant: 'First reply' },
        { key: 'second', height: 1500, user: prompt, assistant: 'Second reply' },
        { key: 'last', height: 1500, user: 'Different', assistant: 'Last reply' },
      ],
    });
    const session = await createChatGptThreadPreparer().prepare({ extractor, timing: FAST });
    if (!session) throw new Error('Expected a crawled thread');
    try {
      expect(fixture.mountedKeys()).not.toContain('first');
      expect(
        await session.build(new Set(['first:a', 'second:u', 'second:a', 'last:a']), {}),
      ).toMatchObject([
        { user: '', assistant: 'First reply', starred: true },
        { user: prompt, assistant: 'Second reply', starred: true },
        { user: '', assistant: 'Last reply', starred: false },
      ]);
      libraryRead.mockResolvedValue([]);
      expect(await session.build(new Set(['first:a']), {})).toMatchObject([{ starred: false }]);
    } finally {
      session.release();
    }
  });

  it('marks final turns from the Library through the prepared export site reader', async () => {
    mountThreadFixture({
      turns: [{ key: 'one', height: 200, user: 'Question', assistant: 'Answer' }],
    });
    libraryRead.mockResolvedValue([star('Question')]);
    const session = await createChatGptExportSite(
      buildChatGptAdapter(chatgptAdapter),
    ).turns.prepare?.({});
    if (!session) throw new Error('Expected a prepared export reader');
    try {
      expect(await session.build(new Set(['one:a']), {})).toMatchObject([
        { user: '', assistant: 'Answer', starred: true },
      ]);
    } finally {
      session.release();
    }
  });
});

describe.each(['retained', 'crawled'] as const)(
  '%s export while Library input is pending',
  (kind) => {
    async function reader() {
      if (kind === 'retained') {
        mountRetained();
        return {
          turns: createChatGptExportSite(buildChatGptAdapter(chatgptAdapter)).turns,
          selected: new Set(['reply-uuid']),
        };
      }
      mountThreadFixture({
        turns: [{ key: 'one', height: 200, user: 'Question', assistant: 'Answer' }],
      });
      const session = await createChatGptThreadPreparer().prepare({ extractor, timing: FAST });
      if (!session) throw new Error('Expected a crawled thread');
      return { turns: session, selected: new Set(['one:a']) };
    }

    function pendingLibraryRead(): (messages: StarredMessage[]) => void {
      let resolve!: (messages: StarredMessage[]) => void;
      libraryRead.mockImplementationOnce(
        () =>
          new Promise((reply) => {
            resolve = reply;
          }),
      );
      return (messages) => resolve(messages);
    }

    it('rejects a Library reply after cancellation', async () => {
      const { turns, selected } = await reader();
      try {
        const release = pendingLibraryRead();
        const controller = new AbortController();
        const pending = turns.build(selected, { signal: controller.signal });
        await vi.waitFor(() => expect(libraryRead).toHaveBeenCalled());
        controller.abort();
        release([star('Question')]);
        await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
      } finally {
        if ('release' in turns) turns.release();
      }
    });

    it('rejects a Library reply after the captured account route changes', async () => {
      const { turns, selected } = await reader();
      try {
        const release = pendingLibraryRead();
        const pending = turns.build(selected, {});
        await vi.waitFor(() => expect(libraryRead).toHaveBeenCalled());
        vi.stubGlobal('location', new URL('https://chatgpt.com/u/3/c/conv'));
        release([star('Question')]);
        await expect(pending).rejects.toThrow('chatgpt_export_conversation_changed');
      } finally {
        if ('release' in turns) turns.release();
      }
    });
  },
);
