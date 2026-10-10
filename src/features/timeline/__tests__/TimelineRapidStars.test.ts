import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { createStarStore } from '@/features/savedLibrary/starStore';
import type { StarredMessagesData } from '@/features/savedLibrary/starTypes';
import { createStarredMessagesHandler } from '@/pages/background/starredMessages';
import { createGeminiTimelineStoragePolicy } from '@/pages/content/timeline/GeminiTimelineStorage';

import { TimelineState } from '../TimelineState';

const conversationId = 'gemini:conv:rapid';
const turnId = 's-1111111111111111';
const states: TimelineState[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  history.replaceState({}, '', '/app/rapid');
  localStorage.clear();
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({}));
  vi.mocked(chrome.storage.local.set).mockResolvedValue();
});
afterEach(() => states.splice(0).forEach((state) => state.destroy()));

async function fixture(initiallyStarred: boolean, failFirst = false, delaySecond = false) {
  const data: StarredMessagesData = { messages: {} };
  if (initiallyStarred)
    data.messages[conversationId] = [
      {
        turnId,
        conversationId,
        content: 'Prompt',
        conversationUrl: location.href,
        starredAt: 1,
      },
    ];
  const stored: Record<string, unknown> = {
    [StorageKeys.SAVED_LIBRARY_STARS]: structuredClone(data),
    [StorageKeys.TIMELINE_STARRED_MESSAGES]: structuredClone(data),
    [StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]: [],
  };
  let release!: () => void;
  const delay = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const writing = new Promise<void>((resolve) => {
    entered = resolve;
  });
  let releaseSecond!: () => void;
  const secondDelay = new Promise<void>((resolve) => {
    releaseSecond = resolve;
  });
  let enteredSecond!: () => void;
  const secondWriting = new Promise<void>((resolve) => {
    enteredSecond = resolve;
  });
  let writes = 0;
  const store = createStarStore({
    get: async () => structuredClone(stored),
    set: async (items) => {
      writes += 1;
      if (writes === 1) {
        entered();
        await delay;
        if (failFirst) throw new Error('write unavailable');
      } else if (writes === 2 && delaySecond) {
        enteredSecond();
        await secondDelay;
      }
      const changes = Object.fromEntries(
        Object.entries(items).map(([key, newValue]) => [
          key,
          { oldValue: stored[key], newValue: structuredClone(newValue) },
        ]),
      );
      Object.assign(stored, structuredClone(items));
      for (const [receive] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls)
        receive(changes, 'local');
    },
  });
  const handle = createStarredMessagesHandler(store);
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
    request: unknown,
    reply: (response: unknown) => void,
  ) => {
    void handle(request)?.then(reply, (error: Error) => reply({ ok: false, error: error.message }));
  }) as typeof chrome.runtime.sendMessage);
  const state = new TimelineState(() => {}, createGeminiTimelineStoragePolicy());
  states.push(state);
  await state.init();
  state.replaceMarkers([
    {
      id: turnId,
      element: document.createElement('div'),
      summary: 'Prompt',
      assistantSummary: '',
      baseN: 0,
      starred: false,
    },
  ]);
  return { state, stored, store, handle, writing, release, secondWriting, releaseSecond };
}

it.each([
  { initial: 'unstarred', saved: false },
  { initial: 'starred', saved: true },
])('two quick toggles on an $initial turn return to its saved state', async ({ saved }) => {
  const { state, stored, writing, release } = await fixture(saved);
  const first = state.toggleStar(turnId);
  await writing;
  const second = state.toggleStar(turnId);
  expect(state.markers[0].starred).toBe(saved);
  release();
  await Promise.all([first, second]);
  expect(state.markers[0].starred).toBe(saved);
  const primary = stored[StorageKeys.SAVED_LIBRARY_STARS] as StarredMessagesData;
  expect(primary.messages[conversationId]?.map((item) => item.turnId) ?? []).toEqual(
    saved ? [turnId] : [],
  );
  expect(stored[StorageKeys.TIMELINE_STARRED_MESSAGES]).toEqual(primary);
  expect(localStorage.getItem(`geminiTimelineStars:${conversationId}`)).toBeNull();
});

it('a failed first star write repaints from the Library and a later press works', async () => {
  const { state, stored, writing, release } = await fixture(false, true);
  const edit = state.toggleStar(turnId);
  await writing;
  release();
  await edit;
  expect(state.markers[0].starred).toBe(false);
  const primary = stored[StorageKeys.SAVED_LIBRARY_STARS] as StarredMessagesData;
  expect(primary.messages).toEqual({});
  await state.toggleStar(turnId);
  expect(state.markers[0].starred).toBe(true);
  expect(
    (stored[StorageKeys.SAVED_LIBRARY_STARS] as StarredMessagesData).messages[conversationId][0]
      .turnId,
  ).toBe(turnId);
});

it('three quick toggles alternate through intermediate Library writes', async () => {
  const { state, stored, writing, release, secondWriting, releaseSecond } = await fixture(
    false,
    false,
    true,
  );
  const first = state.toggleStar(turnId);
  await writing;
  const second = state.toggleStar(turnId);
  release();
  await secondWriting;
  const third = state.toggleStar(turnId);
  releaseSecond();
  await Promise.all([first, second, third]);
  expect(state.markers[0].starred).toBe(true);
  const data = stored[StorageKeys.SAVED_LIBRARY_STARS] as StarredMessagesData;
  expect(data.messages[conversationId].map((item) => item.turnId)).toEqual([turnId]);
  expect(stored[StorageKeys.TIMELINE_STARRED_MESSAGES]).toEqual(data);
});

it('a delayed account lookup does not reverse two quick star presses', async () => {
  history.replaceState({}, '', '/u/1/app/rapid');
  const scope = { accountKey: 'opaque-account', accountId: 1, routeUserId: '1', emailHash: null };
  const resolveScope = vi
    .spyOn(accountIsolationService, 'resolveAccountScope')
    .mockResolvedValue(scope);
  const { state, stored, writing, release } = await fixture(false);
  let releaseAccount!: () => void;
  const account = new Promise<void>((resolve) => {
    releaseAccount = resolve;
  });
  resolveScope.mockImplementationOnce(async () => {
    await account;
    return scope;
  });
  const first = state.toggleStar(turnId);
  const second = state.toggleStar(turnId);
  expect(state.markers[0].starred).toBe(false);
  releaseAccount();
  await writing;
  release();
  await Promise.all([first, second]);
  expect(state.markers[0].starred).toBe(false);
  expect(
    (stored[StorageKeys.SAVED_LIBRARY_STARS] as StarredMessagesData).messages[conversationId],
  ).toBeUndefined();
});

it.each([
  { initial: false, operation: 'add' },
  { initial: true, operation: 'remove' },
])(
  'a delayed $operation reply does not undo a newer Library edit or reverse the next press',
  async ({ initial, operation }) => {
    const { state, stored, store, handle, writing, release } = await fixture(initial);
    const requests: string[] = [];
    let releaseReply!: () => void;
    let replyWaiting!: () => void;
    const persisted = new Promise<void>((resolve) => {
      replyWaiting = resolve;
    });
    let held = false;
    vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
      request: { type: string },
      reply: (response: unknown) => void,
    ) => {
      requests.push(request.type);
      void handle(request)?.then(
        (response) => {
          if (!held && request.type === `gv.starred.${operation}`) {
            held = true;
            releaseReply = () => reply(response);
            replyWaiting();
          } else reply(response);
        },
        (error: Error) => reply({ ok: false, error: error.message }),
      );
    }) as typeof chrome.runtime.sendMessage);

    const edit = state.toggleStar(turnId);
    await writing;
    release();
    await persisted;
    expect(state.markers[0].starred).toBe(!initial);
    if (initial) {
      await store.add({
        turnId,
        conversationId,
        conversationUrl: location.href,
        content: 'External choice',
        starredAt: 2,
      });
    } else await store.remove(conversationId, turnId);
    expect(state.markers[0].starred).toBe(initial);
    releaseReply();
    await edit;
    expect(state.markers[0].starred).toBe(initial);
    expect((await store.getForConversation(conversationId)).map((item) => item.turnId)).toEqual(
      initial ? [turnId] : [],
    );

    await state.toggleStar(turnId);
    expect(
      requests.filter((type) => type === 'gv.starred.add' || type === 'gv.starred.remove'),
    ).toEqual([`gv.starred.${operation}`, `gv.starred.${operation}`]);
    expect(state.markers[0].starred).toBe(!initial);
    const data = stored[StorageKeys.SAVED_LIBRARY_STARS] as StarredMessagesData;
    expect(data.messages[conversationId]?.map((item) => item.turnId) ?? []).toEqual(
      initial ? [] : [turnId],
    );
    expect(stored[StorageKeys.TIMELINE_STARRED_MESSAGES]).toEqual(data);
  },
);
