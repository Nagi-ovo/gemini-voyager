// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://gemini.google.com/u/1/app/abc?hl=en" }
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { geminiAdapter } from '@/features/plugins/sites/adapters/gemini';
import { StarredMessagesService } from '@/features/savedLibrary/StarredMessagesService';
import type { StarredMessage, StarredMessagesData } from '@/features/savedLibrary/starTypes';

import { historyTimestampStore } from '../../timestamp/historyTimestamps';
import { buildGeminiAdapter } from '../adapter/platform/gemini';
import type { ExportSite } from '../exportSite';
import { createGeminiExportSite } from '../sites/gemini';

const firstId = 's-1111111111111111';
const tailId = 's-3333333333333333';
const conversationId = 'gemini:conv:abc';

beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  document.body.replaceChildren();
  history.replaceState({}, '', '/u/1/app/abc?hl=en');
  vi.spyOn(StarredMessagesService, 'getAllStarredMessages').mockResolvedValue({ messages: {} });
});

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

function render(ids: readonly (string | undefined)[] = [firstId]): ExportSite {
  const main = document.createElement('main');
  for (const id of ids) {
    const turn = document.createElement('div');
    turn.className = 'conversation-container';
    if (id) turn.id = `r_${id.slice(2)}`;
    turn.innerHTML =
      '<div class="user-query-container"><div class="query-text-line">Same prompt</div></div>' +
      '<div class="response-container"><message-content>Answer</message-content></div>';
    main.appendChild(turn);
  }
  document.body.replaceChildren(main);
  return createGeminiExportSite(buildGeminiAdapter(geminiAdapter));
}

function message(turnId = firstId): StarredMessage {
  return {
    conversationId,
    conversationUrl: location.href,
    turnId,
    content: 'Same prompt',
    starredAt: 1,
  };
}

function selectedIds(site: ExportSite): Set<string> {
  return new Set(site.turns.messages().map((entry) => entry.messageId));
}

it('exports a Library-only star while the timeline and page cache are absent', async () => {
  const site = render();
  vi.mocked(StarredMessagesService.getAllStarredMessages).mockResolvedValue({
    messages: { [conversationId]: [message()] },
  });

  const turns = await site.turns.build(selectedIds(site), {});

  expect(turns).toMatchObject([{ user: 'Same prompt', assistant: 'Answer', starred: true }]);
  expect(localStorage.length).toBe(0);
});

it('ignores a stale page cache and stars belonging to another conversation', async () => {
  const site = render();
  localStorage.setItem(`geminiTimelineStars:${conversationId}`, JSON.stringify([firstId]));
  vi.mocked(StarredMessagesService.getAllStarredMessages).mockResolvedValue({
    messages: {
      'gemini:conv:other': [
        {
          ...message(),
          conversationId: 'gemini:conv:other',
          conversationUrl: 'https://gemini.google.com/u/1/app/other',
        },
      ],
    },
  });

  expect((await site.turns.build(selectedIds(site), {}))[0].starred).toBe(false);
});

it('exports a Library star stored under a legacy conversation identity', async () => {
  const site = render();
  vi.mocked(StarredMessagesService.getAllStarredMessages).mockResolvedValue({
    messages: {
      'gemini:legacy-route': [
        {
          ...message(),
          conversationId: 'gemini:legacy-route',
          conversationUrl: 'https://gemini.google.com/u/1/app/abc?hl=ja',
        },
      ],
    },
  });

  expect((await site.turns.build(selectedIds(site), {}))[0].starred).toBe(true);
});

it('keeps a verified positional star on its full-history server turn after a partial mount', async () => {
  const site = render([tailId]);
  vi.mocked(StarredMessagesService.getAllStarredMessages).mockResolvedValue({
    messages: { [conversationId]: [message('u-0')] },
  });
  vi.spyOn(historyTimestampStore, 'getTurnIdAliases').mockImplementation((_conversation, id) =>
    id === firstId ? [id, 'u-0'] : [id, 'u-2'],
  );
  expect((await site.turns.build(selectedIds(site), {}))[0].starred).toBe(false);

  render([firstId, tailId]);
  const turns = await site.turns.build(selectedIds(site), {});
  expect(turns.map((turn) => turn.starred)).toEqual([true, false]);
});

it('does not mark an unverified mounted positional turn even when history has an alias', async () => {
  const site = render([undefined]);
  vi.mocked(StarredMessagesService.getAllStarredMessages).mockResolvedValue({
    messages: { [conversationId]: [message('u-0'), message()] },
  });
  vi.spyOn(historyTimestampStore, 'getTurnIdAliases').mockReturnValue([firstId, 'u-0']);

  expect((await site.turns.build(selectedIds(site), {}))[0].starred).toBe(false);
});

it('rejects export when the Library read fails instead of reporting unstarred turns', async () => {
  const site = render();
  vi.mocked(StarredMessagesService.getAllStarredMessages).mockRejectedValue(
    new Error('Library unavailable'),
  );

  await expect(site.turns.build(selectedIds(site), {})).rejects.toThrow('Library unavailable');
});

it.each(['/u/2/app/abc?hl=en', '/u/1/app/abc?hl=fr', '/u/1/app/other?hl=en'])(
  'rejects the captured Library snapshot after the route changes to %s',
  async (route) => {
    const site = render();
    const data = { messages: { [conversationId]: [message()] } };
    let release!: (data: StarredMessagesData) => void;
    vi.mocked(StarredMessagesService.getAllStarredMessages).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const pending = site.turns.build(selectedIds(site), { expectedUrl: location.href });
    const rejected = expect(pending).rejects.toThrow('export_conversation_changed');
    history.replaceState({}, '', route);
    release(data);
    await rejected;
  },
);

it('keeps a Library-backed export cancelled while its read is pending', async () => {
  const site = render();
  const controller = new AbortController();
  let release!: (data: StarredMessagesData) => void;
  vi.mocked(StarredMessagesService.getAllStarredMessages).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const pending = site.turns.build(selectedIds(site), { signal: controller.signal });
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  controller.abort();
  release({ messages: { [conversationId]: [message()] } });
  await rejected;
});
