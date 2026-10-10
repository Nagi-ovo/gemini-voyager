import { afterEach, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';
import {
  buildConversationIdFromUrl,
  buildLegacyConversationIdFromUrl,
} from '@/core/utils/conversationIdentity';
import { findMatchingStarredMessages } from '@/pages/content/timeline/starredLookup';

import { createStarStore } from '../starStore';
import type { StarredMessage } from '../starTypes';

const url = 'https://gemini.google.com/u/2/app/abc';
const canonical = buildConversationIdFromUrl(url);
const legacyId = buildLegacyConversationIdFromUrl(url);
const item: StarredMessage = {
  conversationId: legacyId,
  conversationUrl: url,
  turnId: 's-1111111111111111',
  starredAt: 50,
  content: 'Deleted prompt',
  account: 'opaque-account',
};

function setup(alreadyDeleted = false, id = legacyId) {
  const values: Record<string, unknown> = {
    [StorageKeys.TIMELINE_STARRED_MESSAGES]: {
      messages: alreadyDeleted ? {} : { [id]: [{ ...item, conversationId: id }] },
    },
    ...(alreadyDeleted
      ? {
          [StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]: [
            {
              conversationId: legacyId,
              conversationUrl: url,
              turnId: item.turnId,
              starredAt: item.starredAt,
              deletedAt: 1_800_000_000_000,
              account: item.account,
            },
          ],
        }
      : {}),
  };
  const area = {
    get: vi.fn(async () => structuredClone(values)),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(values, structuredClone(items));
    }),
  };
  return { values, area, store: createStarStore(area) };
}

afterEach(() => vi.restoreAllMocks());

it('a deleted legacy star stays deleted after a stale canonical v1 import', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  const { values, area, store } = setup();
  expect(findMatchingStarredMessages(await store.getAll(), canonical, url)).toEqual({
    messages: [item],
    sourceConversationIds: [legacyId],
  });
  area.set.mockClear();
  await expect(store.remove(legacyId, item.turnId)).resolves.toBe(true);
  expect(area.set).toHaveBeenCalledTimes(1);
  const empty = await store.getAll();
  expect(findMatchingStarredMessages(empty, canonical, url)).toEqual({
    messages: [],
    sourceConversationIds: [],
  });
  expect(values[StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]).toEqual(
    [legacyId, canonical].map((conversationId) => ({
      conversationId,
      conversationUrl: url,
      turnId: item.turnId,
      starredAt: 50,
      deletedAt: 1_800_000_000_000,
      account: 'opaque-account',
    })),
  );
  const restarted = createStarStore(area);
  await restarted.mergeCloud({
    format: 'gemini-voyager.starred.v1',
    data: { messages: { [canonical]: [{ ...item, conversationId: canonical }] } },
  });
  expect(findMatchingStarredMessages(await restarted.getAll(), canonical, url)).toEqual({
    messages: [],
    sourceConversationIds: [],
  });
  expect(values[StorageKeys.TIMELINE_STARRED_MESSAGES]).toEqual({ messages: {} });
  expect(values[StorageKeys.SAVED_LIBRARY_STARS]).toEqual({ messages: {} });
  const newer = { ...item, conversationId: canonical, starredAt: 51 };
  await restarted.mergeCloud({ data: { messages: { [canonical]: [newer] } } });
  expect(findMatchingStarredMessages(await restarted.getAll(), canonical, url).messages).toEqual([
    newer,
  ]);
});

it('a persisted legacy-only deletion suppresses canonical imports without live alias discovery', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  const { values, area, store } = setup(true);
  await store.mergeCloud({
    format: 'gemini-voyager.starred.v1',
    data: { messages: { [canonical]: [{ ...item, conversationId: canonical }] } },
  });
  expect(area.set).toHaveBeenCalledTimes(1);
  expect(findMatchingStarredMessages(await store.getAll(), canonical, url)).toEqual({
    messages: [],
    sourceConversationIds: [],
  });
  expect(values[StorageKeys.SAVED_LIBRARY_STAR_TOMBSTONES]).toEqual(
    expect.arrayContaining([expect.objectContaining({ conversationId: canonical, starredAt: 50 })]),
  );
  await store.add({ ...item, conversationId: canonical, starredAt: 10 });
  expect(findMatchingStarredMessages(await store.getAll(), canonical, url).messages).toEqual([
    { ...item, conversationId: canonical, starredAt: 51 },
  ]);
});

it('a deleted canonical star stays deleted after a stale legacy v1 import', async () => {
  vi.spyOn(Date, 'now').mockReturnValue(1_800_000_000_000);
  const { store } = setup(false, canonical);
  await store.remove(canonical, item.turnId);
  await store.mergeCloud({
    format: 'gemini-voyager.starred.v1',
    data: { messages: { [legacyId]: [item] } },
  });
  expect(findMatchingStarredMessages(await store.getAll(), canonical, url)).toEqual({
    messages: [],
    sourceConversationIds: [],
  });
  await store.add({ ...item, starredAt: 10 });
  expect(findMatchingStarredMessages(await store.getAll(), canonical, url).messages).toEqual([
    { ...item, starredAt: 51 },
  ]);
});
