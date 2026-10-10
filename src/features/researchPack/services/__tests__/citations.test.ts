import { describe, expect, it } from 'vitest';

import { dedupeCitations, normalizeCitationUrl } from '../citations';

describe('normalizeCitationUrl', () => {
  it('strips fragments, tracking parameters and trailing slashes', () => {
    expect(
      normalizeCitationUrl('https://Example.com/paper/?utm_source=gemini&id=7&fbclid=abc#sec-2'),
    ).toBe('https://example.com/paper/?id=7');
    expect(normalizeCitationUrl('https://example.com/paper/')).toBe('https://example.com/paper');
    expect(normalizeCitationUrl('https://example.com/')).toBe('https://example.com');
  });

  it('unwraps Google redirect links to their target', () => {
    expect(
      normalizeCitationUrl(
        'https://www.google.com/url?sa=E&q=https%3A%2F%2Farxiv.org%2Fabs%2F2401.00001%3Futm_medium%3Dx',
      ),
    ).toBe('https://arxiv.org/abs/2401.00001');
  });

  it('unwraps only genuine Google redirect hosts', () => {
    const target = encodeURIComponent('https://arxiv.org/abs/2401.00001');
    expect(normalizeCitationUrl(`https://google.com/url?q=${target}`)).toBe(
      'https://arxiv.org/abs/2401.00001',
    );
    for (const lookalike of [
      `https://google.evil.com/url?q=${target}`,
      `https://www.google.com.evil.com/url?q=${target}`,
      `https://notgoogle.com/url?q=${target}`,
      `https://evil.com/url?q=${target}`,
      `https://google.co.evil/url?url=${target}`,
    ]) {
      const normalized = normalizeCitationUrl(lookalike);
      expect(normalized, lookalike).not.toBe('https://arxiv.org/abs/2401.00001');
      expect(normalized, lookalike).toMatch(/^https:\/\/[^/]*evil|^https:\/\/notgoogle/);
    }
  });

  it('rejects non-http links and the chat apps themselves', () => {
    expect(normalizeCitationUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeCitationUrl('mailto:someone@example.com')).toBeNull();
    expect(normalizeCitationUrl('https://gemini.google.com/app/abc')).toBeNull();
    expect(normalizeCitationUrl('https://support.google.com/gemini')).toBeNull();
    expect(normalizeCitationUrl('not a url')).toBeNull();
  });

  it('resolves relative links against a base URL', () => {
    expect(normalizeCitationUrl('/docs/a', 'https://example.org/x/y')).toBe(
      'https://example.org/docs/a',
    );
  });
});

describe('dedupeCitations', () => {
  it('keeps first-seen order and fills a missing title from a later duplicate', () => {
    expect(
      dedupeCitations([
        { url: 'https://b.example/one', title: '' },
        { url: 'https://a.example/two', title: 'Two' },
        { url: 'https://b.example/one#cite', title: '  One \n Title ' },
        { url: 'https://a.example/two/', title: 'Two again' },
      ]),
    ).toEqual([
      { url: 'https://b.example/one', title: 'One Title' },
      { url: 'https://a.example/two', title: 'Two' },
    ]);
  });

  it('drops a title that only repeats the URL', () => {
    expect(dedupeCitations([{ url: 'https://a.example/x', title: 'https://a.example/x' }])).toEqual(
      [{ url: 'https://a.example/x', title: '' }],
    );
  });
});
