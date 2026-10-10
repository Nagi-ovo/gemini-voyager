import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { hashString } from '@/core/utils/hash';
import { normalizeText } from '@/features/export/services/exportDomPolicy';
import { StarredMessagesService } from '@/features/savedLibrary/StarredMessagesService';
import type { StarredMessage } from '@/features/savedLibrary/starTypes';
import { turnSummary } from '@/features/timeline/adapters/catalog/turnHash';
import {
  makeTurns,
  mountThreadFixture,
} from '@/pages/content/export/adapter/__tests__/chatgptThreadFixture';
import type { ExportPlatformAdapter } from '@/pages/content/export/adapter/platformAdapters';

import { collectTemporaryChatTurns } from './index';

const plainAdapter = vi.hoisted(() => ({ current: null as unknown }));

vi.mock('@/pages/content/export/adapter/platformAdapters', () => ({
  resolveExportAdapter: () => plainAdapter.current,
}));

beforeEach(() => {
  history.replaceState({}, '', '/?temporary-chat=true');
  plainAdapter.current = {
    extractUserImage: (element: HTMLElement) => element.querySelectorAll('img'),
    extractUserText: (
      _lines: NodeListOf<HTMLElement>,
      textParts: string[],
      element: HTMLElement,
    ) => {
      const text = normalizeText(element.textContent || '');
      if (text) textParts.push(text);
    },
    getUserAttachmentCandidates: () => [],
    extractAssistantImage: () => undefined,
    extractFormula: () => undefined,
    extractCodeBlock: () => undefined,
    extractInlineFormula: () => undefined,
  } as unknown as ExportPlatformAdapter;
  vi.spyOn(StarredMessagesService, 'getStarredMessagesForConversation').mockResolvedValue([]);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  document.body.replaceChildren();
  history.replaceState({}, '', '/');
  vi.restoreAllMocks();
});

describe('collectTemporaryChatTurns on the current ChatGPT thread', () => {
  it('reads every turn of the virtualized temporary chat', async () => {
    // Short turns: the whole thread fits one window, so the crawl's default
    // timing keeps this quick.
    const turns = makeTurns(4, 200);
    mountThreadFixture({ turns });

    const collected = await collectTemporaryChatTurns(new AbortController().signal);

    expect(collected.map((turn) => [turn.user, turn.assistant])).toEqual(
      turns.map((turn) => [turn.user, turn.assistant]),
    );
    expect(collected.every((turn) => !turn.starred)).toBe(true);
    expect(StarredMessagesService.getStarredMessagesForConversation).not.toHaveBeenCalled();
  });

  it.each(['thread', 'retained'] as const)(
    'keeps Library stars in a named temporary chat through the direct %s builder',
    async (kind) => {
      history.replaceState({}, '', '/c/temporary-id?temporary-chat=true');
      if (kind === 'thread') mountThreadFixture({ turns: makeTurns(1, 200) });
      else
        document.body.innerHTML = `<main>
      <div data-turn-id-container="user"><section data-turn="user"><div data-message-author-role="user"><div data-user-message-bubble>Question 1</div></div></section></div>
      <div data-turn-id-container="assistant"><section data-turn="assistant"><div data-message-author-role="assistant">Answer 1</div></section></div>
    </main>`;
      const item: StarredMessage = {
        conversationId: 'chatgpt:conv:temporary-id',
        conversationUrl: location.href,
        turnId: `c-0-${hashString(turnSummary(document.querySelector('[data-user-message-bubble]')!))}`,
        content: 'Question 1',
        starredAt: 1,
      };
      vi.mocked(StarredMessagesService.getStarredMessagesForConversation).mockResolvedValue([item]);
      expect(await collectTemporaryChatTurns(new AbortController().signal)).toMatchObject([
        { user: 'Question 1', assistant: 'Answer 1', starred: true },
      ]);
      expect(StarredMessagesService.getStarredMessagesForConversation).toHaveBeenCalledWith(
        'chatgpt:conv:temporary-id',
      );
    },
  );

  it('surfaces a Library failure from the temporary handoff direct builder', async () => {
    history.replaceState({}, '', '/c/temporary-id?temporary-chat=true');
    mountThreadFixture({ turns: makeTurns(1, 200) });
    vi.mocked(StarredMessagesService.getStarredMessagesForConversation).mockRejectedValue(
      new Error('Library unavailable'),
    );
    await expect(collectTemporaryChatTurns(new AbortController().signal)).rejects.toThrow(
      'Library unavailable',
    );
  });

  it('refuses a temporary chat whose last prompt is still waiting for its reply', async () => {
    mountThreadFixture({
      turns: [...makeTurns(1, 200), { key: 'turn-02', height: 200, user: 'Unanswered prompt' }],
    });

    await expect(collectTemporaryChatTurns(new AbortController().signal)).rejects.toThrow(
      'chatgpt_export_response_still_generating',
    );
  });
});
