import { describe, expect, it } from 'vitest';

import { matchesAnyPattern, matchesUrl } from './matchPattern';

describe('matchPattern', () => {
  it('matches exact host + path wildcard', () => {
    expect(matchesUrl('https://claude.ai/chat/123', 'https://claude.ai/*')).toBe(true);
    expect(matchesUrl('https://claude.ai/', 'https://claude.ai/*')).toBe(true);
  });

  it('does not match a different host', () => {
    expect(matchesUrl('https://chatgpt.com/c/1', 'https://claude.ai/*')).toBe(false);
  });

  it('supports scheme wildcard', () => {
    expect(matchesUrl('http://claude.ai/x', '*://claude.ai/*')).toBe(true);
    expect(matchesUrl('https://claude.ai/x', '*://claude.ai/*')).toBe(true);
  });

  it('supports subdomain wildcard', () => {
    expect(matchesUrl('https://chat.openai.com/c/1', 'https://*.openai.com/*')).toBe(true);
    expect(matchesUrl('https://openai.com/c/1', 'https://*.openai.com/*')).toBe(false);
  });

  it('<all_urls> matches any http(s) url', () => {
    expect(matchesUrl('https://anything.example/x', '<all_urls>')).toBe(true);
    expect(matchesUrl('ftp://nope/x', '<all_urls>')).toBe(false);
  });

  it('does not let a wildcard host leak across domains', () => {
    // Ensure the `.` in the pattern is escaped (not treated as regex any-char).
    expect(matchesUrl('https://claudexai/x', 'https://claude.ai/*')).toBe(false);
  });

  it('matchesAnyPattern returns true if any pattern matches', () => {
    expect(
      matchesAnyPattern('https://chat.openai.com/c/1', [
        'https://chatgpt.com/*',
        'https://chat.openai.com/*',
      ]),
    ).toBe(true);
    expect(matchesAnyPattern('https://grok.com/', ['https://claude.ai/*'])).toBe(false);
  });
});
