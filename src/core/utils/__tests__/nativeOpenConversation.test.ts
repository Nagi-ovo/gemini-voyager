import { describe, expect, it } from 'vitest';

import {
  NATIVE_OPEN_CONVERSATION_MESSAGE,
  getNativeOpenConversationUrl,
} from '../nativeOpenConversation';

describe('getNativeOpenConversationUrl', () => {
  it('accepts the raw userInfo dictionary shape', () => {
    const url = getNativeOpenConversationUrl({
      type: NATIVE_OPEN_CONVERSATION_MESSAGE,
      url: 'https://gemini.google.com/u/1/app/abc123',
    });

    expect(url?.href).toBe('https://gemini.google.com/u/1/app/abc123');
  });

  it('accepts the wrapped {name, userInfo} shape', () => {
    const url = getNativeOpenConversationUrl({
      name: NATIVE_OPEN_CONVERSATION_MESSAGE,
      userInfo: {
        type: NATIVE_OPEN_CONVERSATION_MESSAGE,
        url: 'https://claude.ai/chat/xyz',
      },
    });

    expect(url?.href).toBe('https://claude.ai/chat/xyz');
  });

  it('accepts a name-tagged wrapper whose userInfo lacks the type field', () => {
    const url = getNativeOpenConversationUrl({
      name: NATIVE_OPEN_CONVERSATION_MESSAGE,
      userInfo: { url: 'https://aistudio.google.com/prompts/1' },
    });

    expect(url?.href).toBe('https://aistudio.google.com/prompts/1');
  });

  it('allows subdomains of allow-listed hosts only', () => {
    expect(
      getNativeOpenConversationUrl({
        type: NATIVE_OPEN_CONVERSATION_MESSAGE,
        url: 'https://business.gemini.google.com/app/1',
      }),
    ).not.toBeNull();

    expect(
      getNativeOpenConversationUrl({
        type: NATIVE_OPEN_CONVERSATION_MESSAGE,
        url: 'https://evilgemini.google.com.attacker.example/app/1',
      }),
    ).toBeNull();
  });

  it('rejects wrong message types, non-https schemes, and malformed urls', () => {
    expect(getNativeOpenConversationUrl(null)).toBeNull();
    expect(getNativeOpenConversationUrl('gvOpenConversation')).toBeNull();
    expect(
      getNativeOpenConversationUrl({ type: 'other', url: 'https://gemini.google.com/app/1' }),
    ).toBeNull();
    expect(
      getNativeOpenConversationUrl({
        type: NATIVE_OPEN_CONVERSATION_MESSAGE,
        url: 'http://gemini.google.com/app/1',
      }),
    ).toBeNull();
    expect(
      getNativeOpenConversationUrl({
        type: NATIVE_OPEN_CONVERSATION_MESSAGE,
        url: 'javascript:alert(1)',
      }),
    ).toBeNull();
    expect(
      getNativeOpenConversationUrl({
        type: NATIVE_OPEN_CONVERSATION_MESSAGE,
        url: 'https://example.com/app/1',
      }),
    ).toBeNull();
    expect(
      getNativeOpenConversationUrl({ type: NATIVE_OPEN_CONVERSATION_MESSAGE, url: 42 }),
    ).toBeNull();
  });
});
