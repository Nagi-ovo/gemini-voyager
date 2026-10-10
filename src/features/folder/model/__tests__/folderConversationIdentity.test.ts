import { describe, expect, it } from 'vitest';

import type { ConversationReference } from '@/core/types/folder';

import { conversationKeys, isSameConversation } from '../folderConversationIdentity';

function ref(conversationId: string, url: string): ConversationReference {
  return { conversationId, title: 't', url, addedAt: 1 };
}

describe('folder conversation identity', () => {
  it.each([
    ['a bare id', ref('abc', ''), ['abc']],
    ['a c_ id', ref('c_abc', ''), ['abc']],
    ['an id matching its URL', ref('abc', 'https://gemini.google.com/app/abc'), ['abc']],
    [
      'a synthetic id with an app URL',
      ref('conv_1', 'https://gemini.google.com/app/abc'),
      ['conv_1', 'abc'],
    ],
    ['a gem URL', ref('x', 'https://gemini.google.com/u/1/gem/g1/c_abc?hl=en'), ['x', 'abc']],
    ['a relative URL', ref('conv_1', '/app/abc'), ['conv_1', 'abc']],
    ['an AI Studio URL', ref('p1', '/prompts/p1'), ['p1']],
    ['an empty id with a URL', ref('', '/app/abc'), ['abc']],
    ['nothing', ref('  ', ''), []],
  ])('keys %s', (_shape, conversation, keys) => {
    expect(conversationKeys(conversation)).toEqual(keys);
  });

  it('matches any spelling of a key and nothing else', () => {
    const legacy = ref('conv_1', '/app/abc');
    expect(isSameConversation('abc', legacy)).toBe(true);
    expect(isSameConversation('c_abc', legacy)).toBe(true);
    expect(isSameConversation('conv_1', legacy)).toBe(true);
    expect(isSameConversation('ab', legacy)).toBe(false);
    expect(isSameConversation('', ref('', ''))).toBe(false);
  });
});
