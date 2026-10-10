import { afterEach, expect, it, vi } from 'vitest';

import { accountIsolationService } from '@/core/services/AccountIsolationService';
import { StorageKeys } from '@/core/types/common';
import { StarredMessagesService } from '@/features/savedLibrary/StarredMessagesService';

import { createSavedLibraryView } from '../savedLibraryView';

vi.mock('webextension-polyfill', () => ({ default: chrome }));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('refreshes on complete neutral-key changes and ignores old-key or partial snapshots', async () => {
  const star = {
    conversationId: 'gemini:conv:saved',
    conversationUrl: 'https://gemini.google.com/app/saved',
    turnId: 's-aaaaaaaaaaaaaaaa',
    content: 'Original answer',
    starredAt: 100,
  };
  const read = vi
    .spyOn(StarredMessagesService, 'getAllStarredMessagesSorted')
    .mockResolvedValue([star]);
  vi.spyOn(accountIsolationService, 'resolveAccountScope').mockResolvedValue({
    accountKey: 'opaque',
    accountId: 1,
    routeUserId: '1',
    emailHash: null,
  });
  vi.mocked(chrome.runtime.sendMessage).mockImplementation((() =>
    Promise.resolve({ ok: true, records: [] })) as typeof chrome.runtime.sendMessage);
  const list = document.createElement('div');
  document.body.appendChild(list);
  const view = createSavedLibraryView({
    list,
    t: (key) => key,
    getQuery: () => '',
    isActive: () => true,
    setNotice: () => {},
    beforeRender: () => {},
    onBack: () => {},
    rememberView: async () => {},
    onNavigated: () => {},
    highlightPlatform: 'gemini',
  });
  await view.load();
  expect(list.textContent).toContain('Original answer');
  read.mockResolvedValue([{ ...star, content: 'Updated answer' }]);

  view.applyStorageChange('local', {
    [StorageKeys.TIMELINE_STARRED_MESSAGES]: { newValue: { messages: {} } },
  });
  view.applyStorageChange('local', {
    [StorageKeys.SAVED_LIBRARY_STARS]: {
      newValue: { messages: { [star.conversationId]: [star, null] } },
    },
  });
  await Promise.resolve();
  expect(list.textContent).toContain('Original answer');

  view.applyStorageChange('local', {
    [StorageKeys.SAVED_LIBRARY_STARS]: {
      newValue: { messages: { [star.conversationId]: [star] } },
    },
  });
  await vi.waitFor(() => expect(list.textContent).toContain('Updated answer'));
  read.mockResolvedValue([]);
  view.applyStorageChange('local', {
    [StorageKeys.SAVED_LIBRARY_STARS]: { oldValue: { messages: {} } },
  });
  await vi.waitFor(() => expect(list.querySelector('.gv-pm-starred-item')).toBeNull());
});
