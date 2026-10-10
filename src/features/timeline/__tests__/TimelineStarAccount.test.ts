import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { createStarStore } from '@/features/savedLibrary/starStore';
import type { StarredMessagesData } from '@/features/savedLibrary/starTypes';
import { createStarredMessagesHandler } from '@/pages/background/starredMessages';
import { createGeminiTimelineStoragePolicy } from '@/pages/content/timeline/GeminiTimelineStorage';

import { TimelineState } from '../TimelineState';

const states: TimelineState[] = [];
beforeEach(() => {
  vi.restoreAllMocks();
  history.replaceState({}, '', '/u/1/app/account');
  localStorage.clear();
  document.body.replaceChildren();
  vi.mocked(chrome.storage.local.get).mockImplementation(async () => ({}));
  vi.mocked(chrome.storage.local.set).mockResolvedValue();
});
afterEach(() => states.splice(0).forEach((state) => state.destroy()));

it('an unrelated Library snapshot during account lookup does not cancel a captured star', async () => {
  const scope = vi
    .spyOn(accountIsolationService, 'resolveAccountScope')
    .mockImplementation(async (hints) => ({
      accountKey: `opaque-${hints?.routeUserId}`,
      accountId: 1,
      routeUserId: hints?.routeUserId ?? null,
      emailHash: null,
    }));
  const stored: Record<string, unknown> = {};
  const store = createStarStore({
    get: async () => structuredClone(stored),
    set: async (items) => {
      Object.assign(stored, structuredClone(items));
    },
  });
  const handle = createStarredMessagesHandler(store);
  vi.mocked(chrome.runtime.sendMessage).mockImplementation(((
    request: unknown,
    reply: (value: unknown) => void,
  ) => {
    void handle(request)?.then(reply, (error: Error) => reply({ ok: false, error: error.message }));
  }) as typeof chrome.runtime.sendMessage);
  const state = new TimelineState(() => {}, createGeminiTimelineStoragePolicy());
  states.push(state);
  await state.init();
  state.replaceMarkers([
    {
      id: 's-1111111111111111',
      element: document.createElement('div'),
      summary: 'Saved',
      assistantSummary: '',
      baseN: 0,
      starred: false,
    },
  ]);
  let release!: () => void;
  let started!: () => void;
  const resolving = new Promise<void>((resolve) => {
    started = resolve;
  });
  scope.mockImplementationOnce(async (hints) => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    return {
      accountKey: `opaque-${hints?.routeUserId}`,
      accountId: 1,
      routeUserId: hints?.routeUserId ?? null,
      emailHash: null,
    };
  });
  const edit = state.toggleStar(state.markers[0].id);
  await resolving;
  for (const [receive] of vi.mocked(chrome.storage.onChanged.addListener).mock.calls) {
    receive(
      {
        [StorageKeys.SAVED_LIBRARY_STARS]: {
          newValue: { messages: { 'gemini:conv:another': [] } },
        },
      },
      'local',
    );
  }
  history.replaceState({}, '', '/u/2/app/other');
  release();
  await edit;
  const data = stored[StorageKeys.SAVED_LIBRARY_STARS] as StarredMessagesData;
  expect(data.messages['gemini:conv:account'][0]).toMatchObject({
    account: 'opaque-1',
    conversationUrl: expect.stringContaining('/u/1/app/account'),
    content: 'Saved',
  });
  expect(stored[StorageKeys.TIMELINE_STARRED_MESSAGES]).toEqual(data);
});
