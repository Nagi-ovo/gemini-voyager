import { describe, expect, it } from 'vitest';

import { matchesAnyPattern, matchesUrl, patternWithin } from './matchPattern';

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

  it('limits a wildcard scheme to http and https, like <all_urls> and the containment check', () => {
    expect(matchesUrl('http://claude.ai/x', '*://claude.ai/*')).toBe(true);
    expect(matchesUrl('HTTPS://claude.ai/x', '*://claude.ai/*')).toBe(true);
    expect(matchesUrl('ftp://claude.ai/x', '*://claude.ai/*')).toBe(false);
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

  it('keeps a host wildcard inside the hostname', () => {
    const frame = 'https://*.frame.claudeusercontent.com/*';
    expect(matchesUrl('https://abc123.frame.claudeusercontent.com/x', frame)).toBe(true);
    // The wildcard must not run across `/` or `?` into the path or the query.
    expect(
      matchesUrl('https://gemini.google.com/app/abc?x=.frame.claudeusercontent.com/', frame),
    ).toBe(false);
    expect(matchesUrl('https://gemini.google.com/.frame.claudeusercontent.com/', frame)).toBe(
      false,
    );
    expect(matchesUrl('https://evil.example/?.openai.com/', 'https://*.openai.com/*')).toBe(false);
    expect(matchesUrl('https://user@x.example.com@evil.test/', 'https://*.example.com/*')).toBe(
      false,
    );
  });

  it('matches the host exactly, never a host that merely starts with it', () => {
    expect(matchesUrl('https://claude.ai.evil.test/x', 'https://claude.ai/*')).toBe(false);
    expect(matchesUrl('https://claude.ai:8443/x', 'https://claude.ai/*')).toBe(false);
  });

  it('matches the path and query, but not the fragment', () => {
    expect(matchesUrl('https://claude.ai/x?y=1', 'https://claude.ai/*')).toBe(true);
    expect(
      matchesUrl('https://chat.deepseek.com/a/chat/s/1', 'https://chat.deepseek.com/a/*'),
    ).toBe(true);
    expect(matchesUrl('https://chat.deepseek.com/b/a/', 'https://chat.deepseek.com/a/*')).toBe(
      false,
    );
    expect(
      matchesUrl('https://aistudio.google.com/prompts#x', 'https://aistudio.google.com/prompts'),
    ).toBe(true);
  });

  it('accepts any host for a bare `*` host and rejects malformed input', () => {
    expect(matchesUrl('https://anything.example/x', 'https://*/*')).toBe(true);
    expect(matchesUrl('http://anything.example/x', 'https://*/*')).toBe(false);
    expect(matchesUrl('not a url', 'https://*/*')).toBe(false);
    expect(matchesUrl('https://claude.ai/', 'https://cla*de.ai/*')).toBe(false);
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

describe('patternWithin (plan D18 containment)', () => {
  it('accepts a plugin scope that is the site scope or narrower', () => {
    expect(patternWithin('https://claude.ai/*', 'https://claude.ai/*')).toBe(true);
    expect(patternWithin('https://claude.ai/chat/*', 'https://claude.ai/*')).toBe(true);
    expect(patternWithin('https://x.example.com/*', 'https://*.example.com/*')).toBe(true);
    expect(patternWithin('https://claude.ai/*', '*://claude.ai/*')).toBe(true);
    expect(patternWithin('https://claude.ai/chat/s/*', 'https://claude.ai/chat/*')).toBe(true);
    expect(patternWithin('https://anything.test/*', '<all_urls>')).toBe(true);
  });

  it('rejects a wildcard host, a wider scheme or a wider path than the site allows', () => {
    // One probe URL (x.example.com) would have passed this; y.example.com escapes.
    expect(patternWithin('https://*.example.com/*', 'https://x.example.com/*')).toBe(false);
    // The runtime glob needs a subdomain for *.example.com, so the apex host escapes it.
    expect(patternWithin('https://example.com/*', 'https://*.example.com/*')).toBe(false);
    expect(patternWithin('*://example.com/*', 'https://example.com/*')).toBe(false);
    expect(patternWithin('https://claude.ai/*', 'https://claude.ai/chat/*')).toBe(false);
    expect(patternWithin('https://chatgpt.com/*', 'https://claude.ai/*')).toBe(false);
    expect(patternWithin('<all_urls>', 'https://claude.ai/*')).toBe(false);
    expect(patternWithin('garbage', 'https://claude.ai/*')).toBe(false);
  });
});
