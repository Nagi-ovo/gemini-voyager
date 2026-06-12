import { describe, expect, it } from 'vitest';

import { resolveGemHref } from '../index';

/**
 * resolveGemHref pins a cached gem link to the account of the window that
 * renders it. Regression coverage for the two-window bug: open two browser
 * windows signed into different Google accounts, click a gem in the sidebar,
 * and both windows would jump to the same account because the shared
 * chrome.storage.local cache baked one account's `/u/<n>` into the href.
 */
describe('gemsSidebar resolveGemHref (multi-account isolation)', () => {
  it('pins an account-relative gem to the current window account', () => {
    expect(resolveGemHref('/gem/abc', '/u/1/app')).toBe('https://gemini.google.com/u/1/gem/abc');
  });

  it('serves the default account at the bare path', () => {
    expect(resolveGemHref('/gem/abc', '/app')).toBe('https://gemini.google.com/gem/abc');
  });

  it('rewrites a cached href carrying another account segment (the two-window bug)', () => {
    // Cache populated by the /u/0 window, rendered inside the /u/1 window.
    expect(resolveGemHref('/u/0/gem/abc', '/u/1/app')).toBe(
      'https://gemini.google.com/u/1/gem/abc',
    );
  });

  it('drops a stale account segment when the current window is the default account', () => {
    expect(resolveGemHref('/u/2/gem/abc', '/app')).toBe('https://gemini.google.com/gem/abc');
  });

  it('preserves query and hash on the cached path', () => {
    expect(resolveGemHref('/gem/abc?ref=side#x', '/u/3/c/123')).toBe(
      'https://gemini.google.com/u/3/gem/abc?ref=side#x',
    );
  });

  it('handles multi-digit account ids', () => {
    expect(resolveGemHref('/gem/abc', '/u/12/app')).toBe('https://gemini.google.com/u/12/gem/abc');
  });
});
