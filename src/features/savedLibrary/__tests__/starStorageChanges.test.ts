import { expect, it } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import { StarredMessagesService } from '../StarredMessagesService';

const snapshot = {
  messages: {
    one: [
      {
        turnId: 't',
        content: 'Saved answer',
        conversationId: 'one',
        conversationUrl: '',
        starredAt: 1,
        account: 'opaque',
      },
    ],
  },
};

it('decodes the complete neutral snapshot while ignoring the compatibility mirror', () => {
  const changes = {
    [StorageKeys.SAVED_LIBRARY_STARS]: { newValue: snapshot },
    [StorageKeys.TIMELINE_STARRED_MESSAGES]: { newValue: { messages: {} } },
  };
  expect(StarredMessagesService.decodeStorageChange('local', changes)).toEqual(snapshot);
  expect(StarredMessagesService.decodeStorageChange('sync', changes)).toBeUndefined();
  expect(
    StarredMessagesService.decodeStorageChange('local', {
      [StorageKeys.TIMELINE_STARRED_MESSAGES]: { newValue: snapshot },
    }),
  ).toBeUndefined();
});

it.each([
  null,
  {},
  { messages: { one: 'broken' } },
  { messages: { one: [snapshot.messages.one[0], null] } },
])('does not turn an invalid or partial snapshot into authoritative star state', (newValue) => {
  expect(
    StarredMessagesService.decodeStorageChange('local', {
      [StorageKeys.SAVED_LIBRARY_STARS]: { newValue },
    }),
  ).toBeUndefined();
});

it('decodes removal of the neutral key as an empty library', () => {
  expect(
    StarredMessagesService.decodeStorageChange('local', {
      [StorageKeys.SAVED_LIBRARY_STARS]: { oldValue: snapshot },
    }),
  ).toEqual({ messages: {} });
  expect(
    StarredMessagesService.decodeStorageChange('local', {
      [StorageKeys.SAVED_LIBRARY_STARS]: { oldValue: snapshot, newValue: undefined },
    }),
  ).toEqual({ messages: {} });
  expect(
    StarredMessagesService.decodeStorageChange('local', {
      [StorageKeys.SAVED_LIBRARY_STARS]: {},
    }),
  ).toBeUndefined();
});
