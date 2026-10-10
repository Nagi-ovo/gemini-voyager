import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StorageKeys } from '@/core/types/common';

import {
  extractLocalizedContent,
  hasUnreadChangelog,
  openChangelog,
  resolveChangelogImageUrl,
  rewriteChangelogImageUrls,
} from '../index';
import { createChangelogModal } from '../modal';

const parseMarkdown = vi.hoisted(() => vi.fn());
vi.mock('marked', () => ({ marked: { parse: parseMarkdown } }));
vi.mock('@/utils/i18n', () => ({ getCurrentLanguage: async () => 'en' }));

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

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

  it('keeps the 1.6.0 quote at the start of each localized section', () => {
    const notes = readFileSync(
      resolve(process.cwd(), 'src/pages/content/changelog/notes/1.6.0.md'),
      'utf8',
    );

    expect(extractLocalizedContent(notes, 'en')).toMatch(
      /^> \*"Not all those who wander are lost\."/,
    );
    expect(extractLocalizedContent(notes, 'zh')).toMatch(/^> \*「并非所有流浪者都迷失了方向。/);
  });
});

describe('changelog quote styles', () => {
  it('gives the leading quote an explicit cross-browser presentation', () => {
    const overlay = createChangelogModal(
      '<blockquote>Opening quote</blockquote><p>Notes</p>',
      'en',
    );
    const leadingElement = overlay.querySelector('.gv-changelog-body')?.firstElementChild;
    const css = readFileSync(resolve(process.cwd(), 'public/contentStyle.css'), 'utf8');

    expect(leadingElement?.classList.contains('gv-changelog-quote')).toBe(true);
    expect(leadingElement?.tagName).toBe('BLOCKQUOTE');
    expect(css).toMatch(/\.gv-changelog-body > \.gv-changelog-quote\s*\{[^}]*display:\s*block;/s);
  });

  it('leaves a quote after the opening paragraph unclassified', () => {
    const overlay = createChangelogModal('<p>Notes</p><blockquote>Later quote</blockquote>', 'en');

    expect(overlay.querySelector('blockquote')?.classList.contains('gv-changelog-quote')).toBe(
      false,
    );
  });
});

describe('resolveChangelogImageUrl', () => {
  it('rewrites github raw promotion image URLs to runtime URLs', () => {
    const source =
      'https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png';

    const result = resolveChangelogImageUrl(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toBe('moz-extension://test-id/changelog-activity-view.png');
  });

  it('rewrites raw.githubusercontent.com promotion image URLs to runtime URLs', () => {
    const source =
      'https://raw.githubusercontent.com/voyager-crew/voyager/main/docs/public/assets/promotion/Activity-View.png';

    const result = resolveChangelogImageUrl(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toBe('moz-extension://test-id/changelog-activity-view.png');
  });

  // A changelog image must be bundled, not fetched: Firefox applies the host
  // page's CSP to DOM a content script injects, and GitHub is unreachable for a
  // sizeable part of the user base. An image added outside the promotion path,
  // or without a getPromotionRuntimePath entry, fails silently — it renders in
  // Chrome on a good connection and is broken everywhere else. Only the release
  // being shipped is pinned; images in older notes stay remote by choice, since
  // their assets are no longer carried in the package.
  it('resolves every image in the current release note to a runtime URL', () => {
    const version = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'))
      .version as string;
    const notePath = resolve(__dirname, `../notes/${version}.md`);
    const markdown = readFileSync(notePath, 'utf8');

    const unresolved = [...markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+)\)/g)]
      .map((match) => match[1])
      .filter(
        (url) => resolveChangelogImageUrl(url, (path) => `moz-extension://test-id/${path}`) === url,
      );

    expect(unresolved).toEqual([]);
  });

  it('keeps unsupported image URLs unchanged', () => {
    const source =
      'https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Promo-Unknown.png';

    const result = resolveChangelogImageUrl(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toBe(source);
  });
});

describe('changelog sanitizer URI policy', () => {
  // The bundled screenshot resolves to a chrome-extension:// or moz-extension://
  // URL. DOMPurify's default URI policy allows neither, so it strips the src and
  // renders a broken image with no error anywhere — the exact failure this pins.
  it('sanitizes markup before mounting the changelog', async () => {
    parseMarkdown.mockReturnValue('<script>alert(1)</script><p onclick="alert(1)">Notes</p>');

    expect(await openChangelog()).toBe(true);
    const body = document.querySelector('.gv-changelog-body');
    expect(body?.querySelector('script')).toBeNull();
    expect(body?.querySelector('p')?.hasAttribute('onclick')).toBe(false);
  });

  it.each([
    ['chrome-extension://abc/changelog-activity-view.png'],
    ['moz-extension://abc/changelog-activity-view.png'],
    ['https://voyager.nagi.fun/assets/promotion/Activity-View.png'],
  ])('keeps the src for %s', async (src) => {
    parseMarkdown.mockReturnValue(`<img src="${src}" alt="x">`);

    expect(await openChangelog()).toBe(true);
    expect(document.querySelector('.gv-changelog-body img')?.getAttribute('src')).toBe(src);
  });

  it('still drops a javascript: src', async () => {
    parseMarkdown.mockReturnValue('<img src="javascript:alert(1)" alt="x">');

    expect(await openChangelog()).toBe(true);
    expect(document.querySelector('.gv-changelog-body img')?.getAttribute('src')).toBeNull();
  });
});

describe('rewriteChangelogImageUrls', () => {
  it('rewrites supported markdown image URLs and preserves others', () => {
    const source = [
      '![banner](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png)',
      '![external](https://example.com/banner.png)',
    ].join('\n');

    const result = rewriteChangelogImageUrls(source, (path) => `moz-extension://test-id/${path}`);

    expect(result).toContain('![banner](moz-extension://test-id/changelog-activity-view.png)');
    expect(result).toContain('![external](https://example.com/banner.png)');
  });

  it('falls back to original URL when runtime URL resolution fails', () => {
    const source =
      '![banner](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png)';

    const result = rewriteChangelogImageUrls(source, () => null);

    expect(result).toBe(source);
  });

  it('skips rewriting when rewrite flag is disabled', () => {
    const source =
      '![banner](https://github.com/voyager-crew/voyager/raw/main/docs/public/assets/promotion/Activity-View.png)';

    const result = rewriteChangelogImageUrls(
      source,
      (path) => `moz-extension://test-id/${path}`,
      false,
    );

    expect(result).toBe(source);
  });
});

describe('hasUnreadChangelog', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns false on first install (no dismissed version stored)', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({});
    expect(await hasUnreadChangelog()).toBe(false);
  });

  it('returns true when dismissed version differs from current', async () => {
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      [StorageKeys.CHANGELOG_DISMISSED_VERSION]: '0.0.1',
    });
    expect(await hasUnreadChangelog()).toBe(true);
  });

  it('returns false when dismissed version matches current', async () => {
    const { EXTENSION_VERSION } = await import('@/core/utils/version');
    (chrome.storage.local.get as ReturnType<typeof vi.fn>).mockResolvedValue({
      [StorageKeys.CHANGELOG_DISMISSED_VERSION]: EXTENSION_VERSION,
    });
    expect(await hasUnreadChangelog()).toBe(false);
  });
});
