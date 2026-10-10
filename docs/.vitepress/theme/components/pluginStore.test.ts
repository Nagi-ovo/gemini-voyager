import { describe, expect, it } from 'vitest';

import { BUILTIN_PLUGINS } from '../../../../src/features/plugins/builtin';
import {
  CATEGORY_FALLBACKS,
  CONTRIBUTE,
  NATIVE_PLUGINS,
  describeForPlatforms,
  displayName,
  groupPluginsByFeature,
  localeKey,
  localePrefix,
  platformsFromMatches,
} from './pluginStore';

describe('platformsFromMatches', () => {
  it('maps claude.ai to the Claude platform', () => {
    expect(platformsFromMatches(['https://claude.ai/*'])).toMatchObject([
      { key: 'claude', label: 'Claude', color: '#d97757' },
    ]);
  });

  it('maps chat.deepseek.com to DeepSeek with its logo', () => {
    const [deepseek] = platformsFromMatches(['https://chat.deepseek.com/*']);
    expect(deepseek).toMatchObject({ key: 'deepseek', label: 'DeepSeek', color: '#4d6bfe' });
    expect(deepseek.mark.paths.length).toBeGreaterThan(0);
  });

  it('treats chatgpt.com and chat.openai.com as one ChatGPT platform', () => {
    const result = platformsFromMatches(['https://chatgpt.com/*', 'https://chat.openai.com/*']);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('chatgpt');
  });

  it('returns an empty list for undefined or unknown hosts', () => {
    expect(platformsFromMatches(undefined)).toEqual([]);
    expect(platformsFromMatches(['https://unknown.example/*'])).toEqual([]);
  });
});

describe('displayName', () => {
  it('strips a redundant platform prefix so the logo carries the platform', () => {
    expect(displayName('Claude · Comfortable Reading Width')).toBe('Comfortable Reading Width');
    expect(displayName('ChatGPT · Comfortable Reading Width')).toBe('Comfortable Reading Width');
    expect(displayName('DeepSeek · 公式复制')).toBe('公式复制');
  });

  it('leaves names without a known platform prefix unchanged', () => {
    expect(displayName('Comfortable Reading Width')).toBe('Comfortable Reading Width');
  });
});

describe('localePrefix', () => {
  it('maps the root Chinese locale to an empty prefix', () => {
    expect(localePrefix('zh-CN')).toBe('');
  });

  it('maps secondary locales to their path prefix', () => {
    expect(localePrefix('en-US')).toBe('/en');
    expect(localePrefix('zh-TW')).toBe('/zh_TW');
  });

  it('falls back to the root prefix for unknown locales', () => {
    expect(localePrefix('xx-YY')).toBe('');
  });
});

describe('localeKey', () => {
  it('maps VitePress langs to the catalog locale codes', () => {
    expect(localeKey('zh-CN')).toBe('zh');
    expect(localeKey('zh-TW')).toBe('zh_TW');
    expect(localeKey('ja-JP')).toBe('ja');
    expect(localeKey('en-US')).toBe('en');
  });

  it('falls back to English for unknown locales', () => {
    expect(localeKey('xx-YY')).toBe('en');
  });
});

describe('NATIVE_PLUGINS', () => {
  it('lists every plugin bundled with the extension', () => {
    expect(NATIVE_PLUGINS.map((p) => p.id)).toEqual(BUILTIN_PLUGINS.map((p) => p.id));
  });

  it('marks every native plugin official, productivity, with a source link', () => {
    for (const p of NATIVE_PLUGINS) {
      expect(p.official).toBe(true);
      expect(p.category).toBe('productivity');
      expect(p.homepage).toMatch(/^https:\/\/github\.com\//);
    }
  });

  it('localizes name and description for every catalog locale', () => {
    const locales = ['zh', 'zh_TW', 'ja', 'ko', 'fr', 'es', 'pt', 'ru', 'ar'];
    for (const p of NATIVE_PLUGINS) {
      for (const loc of locales) {
        expect(p.i18n?.[loc]?.name, `${p.id} ${loc} name`).toBeTruthy();
        expect(p.i18n?.[loc]?.description, `${p.id} ${loc} description`).toBeTruthy();
      }
    }
  });

  it('maps Formula Copy to both Claude and ChatGPT', () => {
    const formula = NATIVE_PLUGINS.find((p) => p.id === 'voyager.formula-copy');
    const keys = platformsFromMatches(formula?.matches).map((pl) => pl.key);
    expect(keys).toEqual(expect.arrayContaining(['claude', 'chatgpt']));
  });
});

describe('CATEGORY_FALLBACKS', () => {
  it('provides "all" and "productivity" labels for every catalog locale', () => {
    const locales = ['zh', 'zh_TW', 'en', 'ja', 'ko', 'fr', 'es', 'pt', 'ar', 'ru'];
    for (const loc of locales) {
      expect(CATEGORY_FALLBACKS[loc]?.all, `${loc} all`).toBeTruthy();
      expect(CATEGORY_FALLBACKS[loc]?.productivity, `${loc} productivity`).toBeTruthy();
    }
  });
});

describe('CONTRIBUTE', () => {
  it('has title, body and cta for every catalog locale', () => {
    const locales = ['zh', 'zh_TW', 'en', 'ja', 'ko', 'fr', 'es', 'pt', 'ar', 'ru'];
    for (const loc of locales) {
      expect(CONTRIBUTE[loc]?.title, `${loc} title`).toBeTruthy();
      expect(CONTRIBUTE[loc]?.body, `${loc} body`).toBeTruthy();
      expect(CONTRIBUTE[loc]?.cta, `${loc} cta`).toBeTruthy();
    }
  });
});

describe('groupPluginsByFeature', () => {
  it('merges per-site variants that share a base name into one group', () => {
    const groups = groupPluginsByFeature([
      { name: 'Claude · Comfortable Reading Width' },
      { name: 'ChatGPT · Comfortable Reading Width' },
      { name: 'Formula Copy' },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(2);
    expect(groups[1]).toHaveLength(1);
  });

  it('keeps distinct features in separate groups and preserves order', () => {
    const groups = groupPluginsByFeature([
      { name: 'Formula Copy' },
      { name: 'Claude · Timeline' },
      { name: 'Claude · CJK Render Fix' },
    ]);
    expect(groups.map((g) => g.length)).toEqual([1, 1, 1]);
    expect(displayName(groups[1][0].name)).toBe('Timeline');
  });
});

describe('describeForPlatforms', () => {
  it('names every platform of a merged card in the page language', () => {
    expect(
      describeForPlatforms(
        'Adds a compact conversation timeline to Claude.',
        ['Claude'],
        ['Claude', 'DeepSeek'],
        'en-US',
      ),
    ).toBe('Adds a compact conversation timeline to Claude and DeepSeek.');
    expect(
      describeForPlatforms(
        '将 Claude 的对话拓宽为居中的单栏。',
        ['Claude'],
        ['Claude', 'ChatGPT', 'DeepSeek'],
        'zh-CN',
      ),
    ).toBe('将 Claude、ChatGPT 和 DeepSeek 的对话拓宽为居中的单栏。');
  });

  it('leaves single-platform and platform-neutral descriptions alone', () => {
    expect(describeForPlatforms('Fixes Claude.', ['Claude'], ['Claude'], 'en-US')).toBe(
      'Fixes Claude.',
    );
    expect(
      describeForPlatforms('Copy a formula as LaTeX.', ['Claude'], ['Claude', 'DeepSeek'], 'en-US'),
    ).toBe('Copy a formula as LaTeX.');
  });
});
