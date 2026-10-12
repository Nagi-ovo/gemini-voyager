import { describe, expect, it } from 'vitest';

import { compareSessions, readConversationSession, sessionKey } from '../sessionIdentity';

const compare = (from: string, to: string) =>
  compareSessions(
    readConversationSession(`https://gemini.google.com${from}`),
    readConversationSession(`https://gemini.google.com${to}`),
  );

describe('compareSessions', () => {
  it.each([
    ['/app', '/app/new-id'],
    ['/u/1/app', '/u/1/app/new-id'],
    ['/gem/coder', '/gem/coder/new-id'],
    ['/app', '/u/0/app/new-id'],
    ['/u/0/app', '/app/new-id'],
  ])('a new chat getting its first address stays the session: %s → %s', (from, to) => {
    expect(compare(from, to)).toBe('addressed');
  });

  it('a query change keeps the conversation', () => {
    expect(compare('/app/chat-a', '/app/chat-a?hl=en')).toBe('same');
  });

  it.each([
    ['/app/chat-a', '/u/0/app/chat-a'],
    ['/u/0/app/chat-a', '/app/chat-a'],
  ])('/app is account slot 0: %s → %s keeps the conversation', (from, to) => {
    expect(compare(from, to)).toBe('same');
    expect(sessionKey(readConversationSession(`https://gemini.google.com${from}`))).toBe(
      sessionKey(readConversationSession(`https://gemini.google.com${to}`)),
    );
  });

  it('another signed-in email on the same URL is a switch; one appearing is not', () => {
    const href = 'https://gemini.google.com/app/chat-a';
    const alice = readConversationSession(href, 'alice@example.com');
    expect(compareSessions(alice, readConversationSession(href, 'bob@example.com'))).toBe(
      'switched',
    );
    expect(compareSessions(readConversationSession(href), alice)).toBe('same');
  });

  it.each([
    ['/app/chat-a', '/app/chat-b'],
    ['/app/chat-a', '/app'],
    ['/u/0/app/chat-a', '/u/1/app/chat-a'],
    ['/u/0/app', '/u/1/app/new-id'],
    ['/gem/coder', '/gem/writer/new-id'],
  ])('another conversation or account is a switch: %s → %s', (from, to) => {
    expect(compare(from, to)).toBe('switched');
  });
});
