import { describe, expect, it } from 'vitest';

import {
  extractLocalizedContent,
  resolveChangelogImageUrl,
  rewriteChangelogImageUrls,
} from '../index';

describe('extractLocalizedContent', () => {
  const sampleMarkdown = `<!-- lang:en -->
### What's New
- Feature A
- Bug fix B

<!-- lang:zh -->
### 更新内容
- 功能 A
- 修复 B

<!-- lang:ja -->
### 新機能
- 機能 A
- バグ修正 B`;

  it('extracts the correct language section', () => {
    const result = extractLocalizedContent(sampleMarkdown, 'zh');
    expect(result).toContain('更新内容');
    expect(result).toContain('功能 A');
    expect(result).not.toContain("What's New");
  });

  it('extracts English section', () => {
    const result = extractLocalizedContent(sampleMarkdown, 'en');
    expect(result).toContain("What's New");
    expect(result).toContain('Feature A');
  });

  it('extracts Japanese section', () => {
    const result = extractLocalizedContent(sampleMarkdown, 'ja');
    expect(result).toContain('新機能');
    expect(result).toContain('機能 A');
  });

  it('falls back to English when requested language is missing', () => {
    const result = extractLocalizedContent(sampleMarkdown, 'fr');
    expect(result).toContain("What's New");
  });

  it('returns empty string when no sections exist', () => {
    const result = extractLocalizedContent('No language markers here', 'en');
    expect(result).toBe('');
  });

  it('handles front matter and strips it from content', () => {
    const withFrontMatter = `---
images:
  hero: ./assets/1.2.8-hero.gif
---

<!-- lang:en -->
### What's New
- Feature A`;

    const result = extractLocalizedContent(withFrontMatter, 'en');
    expect(result).toContain("What's New");
    expect(result).not.toContain('images:');
    expect(result).not.toContain('---');
  });

  it('handles single language section', () => {
    const single = `<!-- lang:en -->
### Only English
- Item 1`;

    const result = extractLocalizedContent(single, 'en');
    expect(result).toContain('Only English');
  });

  it('handles zh_TW language code', () => {
    const withZhTW = `<!-- lang:en -->
### What's New
- Feature A

<!-- lang:zh_TW -->
### 更新內容
- 功能 A`;

    const result = extractLocalizedContent(withZhTW, 'zh_TW');
    expect(result).toContain('更新內容');
  });

  it('trims whitespace from extracted content', () => {
    const result = extractLocalizedContent(sampleMarkdown, 'en');
    expect(result).not.toMatch(/^\s/);
    expect(result).not.toMatch(/\s$/);
  });
});

describe('resolveChangelogImageUrl', () => {
  it('rewrites github raw promotion image URLs to runtime URLs', () => {
    const source =
      'https://github.com/Nagi-ovo/gemini-voyager/raw/main/docs/public/assets/promotion/Promo-Banner.png';

    const result = resolveChangelogImageUrl(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toBe('moz-extension://test-id/changelog-promo-banner.png');
  });

  it('rewrites raw.githubusercontent.com promotion image URLs to runtime URLs', () => {
    const source =
      'https://raw.githubusercontent.com/Nagi-ovo/gemini-voyager/main/docs/public/assets/promotion/Promo-Banner-jp.png';

    const result = resolveChangelogImageUrl(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toBe('moz-extension://test-id/changelog-promo-banner-jp.png');
  });

  it('keeps unsupported image URLs unchanged', () => {
    const source =
      'https://github.com/Nagi-ovo/gemini-voyager/raw/main/docs/public/assets/promotion/Promo-Unknown.png';

    const result = resolveChangelogImageUrl(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toBe(source);
  });
});

describe('rewriteChangelogImageUrls', () => {
  it('rewrites supported markdown image URLs and preserves others', () => {
    const source = [
      '![banner](https://github.com/Nagi-ovo/gemini-voyager/raw/main/docs/public/assets/promotion/Promo-Banner-cn.png)',
      '![external](https://example.com/banner.png)',
    ].join('\n');

    const result = rewriteChangelogImageUrls(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toContain('![banner](moz-extension://test-id/changelog-promo-banner-cn.png)');
    expect(result).toContain('![external](https://example.com/banner.png)');
  });

  it('falls back to original URL when runtime URL resolution fails', () => {
    const source =
      '![banner](https://github.com/Nagi-ovo/gemini-voyager/raw/main/docs/public/assets/promotion/Promo-Banner.png)';

    const result = rewriteChangelogImageUrls(source, () => null);

    expect(result).toBe(source);
  });

  it('skips rewriting when rewrite flag is disabled', () => {
    const source =
      '![banner](https://github.com/Nagi-ovo/gemini-voyager/raw/main/docs/public/assets/promotion/Promo-Banner.png)';

    const result = rewriteChangelogImageUrls(
      source,
      (path) => `moz-extension://test-id/${path}`,
      false,
    );

    expect(result).toBe(source);
  });
});
