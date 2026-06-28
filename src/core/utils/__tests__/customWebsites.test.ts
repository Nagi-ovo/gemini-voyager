import { describe, expect, it } from 'vitest';

import {
  customWebsitesIncludeHost,
  normalizeCustomWebsite,
  sanitizeCustomWebsites,
} from '../customWebsites';

describe('custom website normalization', () => {
  it('drops all-url sentinels and match patterns from persisted custom sites', () => {
    expect(
      sanitizeCustomWebsites([
        'all_urls',
        'all urls',
        '<all_urls>',
        '*://*/*',
        'https://*.example.com/*',
        'https://www.DeepSeek.com/',
        'deepseek.com',
        'qwen.ai/path',
      ]),
    ).toEqual(['deepseek.com', 'qwen.ai']);
  });

  it('normalizes only concrete hostnames', () => {
    expect(normalizeCustomWebsite('https://www.example.com/path')).toBe('example.com');
    expect(normalizeCustomWebsite('all_urls')).toBeNull();
    expect(normalizeCustomWebsite('all urls')).toBeNull();
    expect(normalizeCustomWebsite('<all_urls>')).toBeNull();
    expect(normalizeCustomWebsite('localhost')).toBeNull();
  });

  it('matches sanitized custom sites against the current host', () => {
    expect(customWebsitesIncludeHost(['all_urls', 'example.com'], 'chat.example.com')).toBe(true);
    expect(customWebsitesIncludeHost(['all_urls'], 'claude.ai')).toBe(false);
  });
});
