import { describe, expect, it } from 'vitest';
import { getOriginalSizeGoogleImageUrl } from '../googleImageUrl';

describe('getOriginalSizeGoogleImageUrl', () => {
  it('returns non-Google URLs unchanged', () => {
    expect(getOriginalSizeGoogleImageUrl('https://example.com/photo.jpg?w=800')).toBe(
      'https://example.com/photo.jpg?w=800',
    );
  });

  it('replaces =s220 with =s0', () => {
    expect(
      getOriginalSizeGoogleImageUrl('https://lh3.googleusercontent.com/d/abc=s220'),
    ).toBe('https://lh3.googleusercontent.com/d/abc=s0');
  });

  it('replaces =w512-h286-rw with =s0', () => {
    expect(
      getOriginalSizeGoogleImageUrl('https://lh3.googleusercontent.com/d/abc=w512-h286-rw'),
    ).toBe('https://lh3.googleusercontent.com/d/abc=s0');
  });

  it('does not modify URLs already at =s0', () => {
    const url = 'https://lh3.googleusercontent.com/d/abc=s0';
    expect(getOriginalSizeGoogleImageUrl(url)).toBe(url);
  });

  it('preserves =s0-d-I suffix', () => {
    const url = 'https://lh3.googleusercontent.com/d/abc=s0-d-I';
    expect(getOriginalSizeGoogleImageUrl(url)).toBe(url);
  });

  it('handles ?authuser=N query params', () => {
    const result = getOriginalSizeGoogleImageUrl(
      'https://lh3.googleusercontent.com/gg/export-image?authuser=2',
    );
    const parsed = new URL(result);
    expect(result).not.toContain('authuser=2-s0');
    expect(parsed.searchParams.get('authuser')).toBe('2');
    expect(parsed.searchParams.get('s')).toBe('0');
  });

  it('handles ggpht.com URLs', () => {
    expect(getOriginalSizeGoogleImageUrl('https://lh3.ggpht.com/abc=s512')).toBe(
      'https://lh3.ggpht.com/abc=s0',
    );
  });

  it('preserves fragment identifiers', () => {
    expect(
      getOriginalSizeGoogleImageUrl('https://lh3.googleusercontent.com/d/abc=s220#frag'),
    ).toBe('https://lh3.googleusercontent.com/d/abc=s0#frag');
  });
});
