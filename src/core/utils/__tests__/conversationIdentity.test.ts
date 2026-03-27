import { describe, expect, it } from 'vitest';

import {
  buildConversationIdFromUrl,
  buildLegacyConversationIdFromUrl,
  buildRouteConversationIdFromUrl,
  extractConversationIdFromUrl,
  isSameConversationRoute,
  normalizeConversationUrl,
} from '../conversationIdentity';

describe('conversationIdentity', () => {
  it('ignores query parameters when building stable conversation ids', () => {
    const baseUrl = 'https://gemini.google.com/app/abc123?hl=en';
    const changedQueryUrl = 'https://gemini.google.com/app/abc123?hl=zh-CN&utm_source=feed';

    expect(buildConversationIdFromUrl(baseUrl)).toBe(buildConversationIdFromUrl(changedQueryUrl));
    expect(buildConversationIdFromUrl(baseUrl)).toBe('gemini:conv:abc123');
    expect(buildRouteConversationIdFromUrl(baseUrl)).toBe(
      buildRouteConversationIdFromUrl(changedQueryUrl),
    );
    expect(buildLegacyConversationIdFromUrl(baseUrl)).not.toBe(
      buildLegacyConversationIdFromUrl(changedQueryUrl),
    );
  });

  it('normalizes conversation routes by stripping query and hash', () => {
    const firstUrl = 'https://gemini.google.com/u/1/app/abc123?hl=en#gv-turn-u-1';
    const secondUrl = 'https://gemini.google.com/u/1/app/abc123?utm_source=sidebar';

    expect(normalizeConversationUrl(firstUrl)).toBe('https://gemini.google.com/app/abc123');
    expect(isSameConversationRoute(firstUrl, secondUrl)).toBe(true);
  });

  it('extracts the same native conversation id with or without account slot prefixes', () => {
    expect(extractConversationIdFromUrl('https://gemini.google.com/u/1/app/620969b23c467077')).toBe(
      '620969b23c467077',
    );
    expect(extractConversationIdFromUrl('https://gemini.google.com/app/620969b23c467077')).toBe(
      '620969b23c467077',
    );
    expect(
      buildConversationIdFromUrl(
        'https://gemini.google.com/u/1/app/620969b23c467077?hl=zh&pageId=none',
      ),
    ).toBe('gemini:conv:620969b23c467077');
  });
});
