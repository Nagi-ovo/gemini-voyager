import { describe, expect, it } from 'vitest';

import { toSavedLibraryItems } from '@/features/savedLibrary/model';

import { shouldOpenStarredMessageInCurrentTab } from '../StarredHistory';

function item(url: string, conversationId = 'claude:conv:target') {
  return toSavedLibraryItems(
    [{ conversationId, conversationUrl: url, turnId: 'c-1', content: 'Saved', starredAt: 1 }],
    [],
  )[0];
}

describe('shouldOpenStarredMessageInCurrentTab', () => {
  it('allows same-tab starred navigation on Claude', () => {
    expect(
      shouldOpenStarredMessageInCurrentTab(
        'https://claude.ai/chat/current',
        item('https://claude.ai/chat/target'),
      ),
    ).toBe(true);
  });

  it('keeps cross-site starred navigation in a new tab', () => {
    expect(
      shouldOpenStarredMessageInCurrentTab(
        'https://gemini.google.com/app/1',
        item('https://claude.ai/chat/target'),
      ),
    ).toBe(false);
  });
});

it.each([
  ['chatgpt:conv:target', 'https://chatgpt.com/c/target'],
  ['deepseek:conv:target', 'https://chat.deepseek.com/a/chat/s/target'],
  ['gemini:conv:target', 'https://business.gemini.google/app/target'],
  ['aistudio:conv:target', 'https://aistudio.google.cn/prompts/target'],
])('same-tab opening also works for a %s star', (conversationId, url) => {
  expect(shouldOpenStarredMessageInCurrentTab(url, item(url, conversationId))).toBe(true);
});

it('refuses a same-host URL belonging to a different star site', () => {
  expect(
    shouldOpenStarredMessageInCurrentTab(
      'https://claude.ai/chat/current',
      item('https://claude.ai/chat/target', 'chatgpt:conv:target'),
    ),
  ).toBe(false);
});
