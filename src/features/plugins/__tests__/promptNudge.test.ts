import { describe, expect, it } from 'vitest';

import { computeNudgeDomains, normalizeIconResourcePath } from '../promptNudge';

describe('computeNudgeDomains', () => {
  it('nudges plugin sites the user has not enabled', () => {
    expect(computeNudgeDomains(['chatgpt.com', 'claude.ai'], [])).toEqual([
      'chatgpt.com',
      'claude.ai',
    ]);
  });

  it('suppresses the nudge once a site is enabled', () => {
    expect(computeNudgeDomains(['chatgpt.com', 'claude.ai'], ['claude.ai'])).toEqual([
      'chatgpt.com',
    ]);
  });

  it('is case-insensitive so a differently-cased stored domain still suppresses', () => {
    expect(computeNudgeDomains(['ChatGPT.com', 'claude.ai'], ['CHATGPT.COM'])).toEqual([
      'claude.ai',
    ]);
  });

  it('returns nothing when every plugin site is enabled', () => {
    expect(computeNudgeDomains(['chatgpt.com', 'claude.ai'], ['chatgpt.com', 'claude.ai'])).toEqual(
      [],
    );
  });

  it('de-duplicates and drops empty domains', () => {
    expect(computeNudgeDomains(['chatgpt.com', 'chatgpt.com', ''], [])).toEqual(['chatgpt.com']);
  });

  it('accepts a Set for either argument', () => {
    expect(
      computeNudgeDomains(new Set(['chatgpt.com', 'claude.ai']), new Set(['chatgpt.com'])),
    ).toEqual(['claude.ai']);
  });
});

describe('normalizeIconResourcePath', () => {
  it('strips a leading slash', () => {
    expect(normalizeIconResourcePath('/icon-32.png')).toBe('icon-32.png');
  });

  it('strips the dev public/ prefix', () => {
    expect(normalizeIconResourcePath('public/dev-icon-32.png')).toBe('dev-icon-32.png');
  });

  it('leaves an already-relative path untouched', () => {
    expect(normalizeIconResourcePath('icon-128.png')).toBe('icon-128.png');
  });
});
