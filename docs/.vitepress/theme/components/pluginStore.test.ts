import { describe, expect, it } from 'vitest';

import {
  MARKETPLACE_URL,
  displayName,
  localePrefix,
  platformsFromMatches,
  resolveSourceUrl,
} from './pluginStore';

describe('resolveSourceUrl', () => {
  it('resolves a relative source against the catalog base', () => {
    expect(resolveSourceUrl(MARKETPLACE_URL, 'plugins/foo/plugin.json')).toBe(
      'https://raw.githubusercontent.com/nagi-studio/voyager-plugins/main/plugins/foo/plugin.json',
    );
  });

  it('passes absolute http(s) URLs through unchanged', () => {
    const abs = 'https://example.com/plugin.json';
    expect(resolveSourceUrl(MARKETPLACE_URL, abs)).toBe(abs);
  });
});

describe('platformsFromMatches', () => {
  it('maps claude.ai to the Claude platform', () => {
    expect(platformsFromMatches(['https://claude.ai/*'])).toEqual([
      { key: 'claude', label: 'Claude', color: '#d97757' },
    ]);
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
