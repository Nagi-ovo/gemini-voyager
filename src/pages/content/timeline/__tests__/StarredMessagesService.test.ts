import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import { StarredMessagesService } from '@/features/savedLibrary/StarredMessagesService';
import { createStarStore } from '@/features/savedLibrary/starStore';
import type { StarredMessage, StarredMessagesData } from '@/features/savedLibrary/starTypes';
import { createStarredMessagesHandler } from '@/pages/background/starredMessages';

const conversationId = 'chatgpt:conv:one';
const star = (turnId: string): StarredMessage => ({
  conversationId,
  turnId,
  content: turnId,
  conversationUrl: 'https://chatgpt.com/c/one',
  starredAt: 1,
});

function installLibrary(messages: StarredMessage[]) {
  let data: StarredMessagesData = { messages: { [conversationId]: messages } };
  let tombstones: unknown = [];
  const area = {
    get: vi.fn(async () => ({
      [StorageKeys.TIMELINE_STARRED_MESSAGES]: structuredClone(data),
      [StorageKeys.SAVED_LIBRARY_STARS]: structuredClone(data),
      [StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]: structuredClone(tombstones),
    })),
    set: vi.fn(async (items: Record<string, unknown>) => {
      data = structuredClone(items[StorageKeys.TIMELINE_STARRED_MESSAGES]) as StarredMessagesData;
      tombstones = structuredClone(items[StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]);
    }),
  };
  const handle = createStarredMessagesHandler(createStarStore(area));
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(((...args: unknown[]) => {
    const callback = args.at(-1);
    if (typeof callback !== 'function') throw new Error('Missing response callback');
    void handle(args[0])?.then(
      (response) => callback(response),
      (error: Error) => callback({ ok: false, error: error.message }),
    );
  }) as typeof chrome.runtime.sendMessage);
  return { area, data: () => data };
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('Saved Library authoritative reads', () => {
  it('Library edits leave stale page arrays untouched without importing them', async () => {
    const library = installLibrary([star('A'), star('B'), star('library-only')]);
    const key = `gvTimelineStars:chatgpt:${conversationId}`;
    const legacyKey = `geminiTimelineStars:${conversationId}`;
    const legacy = JSON.stringify(['A', 'B', 'legacy-only']);
    localStorage.setItem(legacyKey, legacy);

    await StarredMessagesService.removeStarredMessage(conversationId, 'A');

    expect(localStorage.getItem(key)).toBeNull();
    expect(localStorage.getItem(legacyKey)).toBe(legacy);
    expect(library.data().messages[conversationId].map((message) => message.turnId)).toEqual([
      'B',
      'library-only',
    ]);
  });

  it('failed Saved Library storage and message-port reads never report an authoritative empty library', async () => {
    const library = installLibrary([star('A')]);
    for (const read of [
      () => StarredMessagesService.getAllStarredMessages(),
      () => StarredMessagesService.getStarredMessagesForConversation(conversationId),
    ]) {
      library.area.get.mockRejectedValueOnce(new Error('storage unavailable'));
      await expect(read()).rejects.toThrow('storage unavailable');

      const originalChrome = chrome;
      vi.stubGlobal('chrome', {
        ...originalChrome,
        runtime: {
          ...originalChrome.runtime,
          lastError: { message: 'message port closed' },
          sendMessage: (_request: unknown, callback: (response: unknown) => void) =>
            callback(undefined),
        },
      });
      await expect(read()).rejects.toThrow('message port closed');
      vi.unstubAllGlobals();
    }
    await expect(
      StarredMessagesService.getStarredMessagesForConversation(conversationId),
    ).resolves.toEqual([star('A')]);
    expect(library.area.set).not.toHaveBeenCalled();
  });
});
