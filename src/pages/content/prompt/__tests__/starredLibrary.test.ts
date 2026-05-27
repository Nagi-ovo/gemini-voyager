import { describe, expect, it } from 'vitest';

import type { StarredMessage } from '../../timeline/starredTypes';
import {
  buildStarredMessageUrl,
  filterStarredMessages,
  formatStarredMessageTime,
} from '../starredLibrary';

function createMessage(overrides: Partial<StarredMessage> = {}): StarredMessage {
  return {
    turnId: 'turn-1',
    content: 'Explain browser GPU usage',
    conversationId: 'conv-1',
    conversationUrl: 'https://gemini.google.com/app/abc#old',
    conversationTitle: 'Firefox performance notes',
    starredAt: new Date('2026-05-27T09:08:07').getTime(),
    ...overrides,
  };
}

describe('starredLibrary', () => {
  it('formats starred timestamps with date and time', () => {
    expect(formatStarredMessageTime(new Date('2026-05-27T09:08:07').getTime())).toMatch(
      /^2026-05-27 09:08:07$/,
    );
  });

  it('builds navigation URLs with the starred turn hash', () => {
    expect(buildStarredMessageUrl(createMessage({ turnId: 'turn:2' }))).toBe(
      'https://gemini.google.com/app/abc#gv-turn-turn:2',
    );
  });

  it('filters by content, title, url, turn id, and formatted time', () => {
    const messages = [
      createMessage(),
      createMessage({
        turnId: 'turn-2',
        content: 'Prompt manager shortcut',
        conversationUrl: 'https://gemini.google.com/app/xyz',
        conversationTitle: 'Voyager UX',
        starredAt: new Date('2026-05-26T10:00:00').getTime(),
      }),
    ];

    expect(filterStarredMessages(messages, 'gpu')).toEqual([messages[0]]);
    expect(filterStarredMessages(messages, 'voyager')).toEqual([messages[1]]);
    expect(filterStarredMessages(messages, 'xyz')).toEqual([messages[1]]);
    expect(filterStarredMessages(messages, 'turn-1')).toEqual([messages[0]]);
    expect(filterStarredMessages(messages, '2026-05-26')).toEqual([messages[1]]);
  });
});
