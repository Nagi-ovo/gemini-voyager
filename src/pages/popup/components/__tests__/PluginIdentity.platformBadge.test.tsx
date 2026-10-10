import React from 'react';

import { describe, expect, it } from 'vitest';

import type { PluginManifest } from '@/features/plugins/types';

import { platformBadge } from '../PluginIdentity';
import { IconDeepSeek } from '../WebsiteLogos';

describe('platformBadge', () => {
  const formulaCopy: PluginManifest = {
    id: 'voyager.formula-copy',
    name: 'Formula Copy',
    version: '1.0.0',
    description: 'd',
    author: 'a',
    category: 'productivity',
    license: 'MIT',
    engine: '>=1.0.0',
    tier: 'declarative',
    matches: ['https://claude.ai/*', 'https://chatgpt.com/*', 'https://chat.openai.com/*'],
    contributes: {},
  };

  it('uses the CURRENT site colour for a multi-site plugin', () => {
    expect(platformBadge(formulaCopy, 'chatgpt')?.color).toBe('#0ea5e9');
    expect(platformBadge(formulaCopy, 'claude')?.color).toBe('#d97757');
  });

  it('uses the bundled DeepSeek icon and accent for the active platform', () => {
    const plugin = {
      ...formulaCopy,
      matches: [...formulaCopy.matches, 'https://chat.deepseek.com/*'],
    };
    const badge = platformBadge(plugin, 'deepseek');
    expect(badge?.color).toBe('#4d6bfe');
    expect(React.isValidElement(badge?.icon) && badge.icon.type).toBe(IconDeepSeek);
  });

  it('does not use the active DeepSeek badge for a plugin that excludes DeepSeek', () => {
    const badge = platformBadge(
      { ...formulaCopy, matches: ['https://claude.ai/*'] },
      'deepseek',
      'https://chat.deepseek.com/a/chat/s/current',
    );
    expect(badge).toBeNull();
  });

  it('recognizes a DeepSeek-only plugin before a site adapter is available', () => {
    const badge = platformBadge({ ...formulaCopy, matches: ['https://chat.deepseek.com/*'] });
    expect(badge?.color).toBe('#4d6bfe');
    expect(React.isValidElement(badge?.icon) && badge.icon.type).toBe(IconDeepSeek);
  });

  it('preserves a DeepSeek plugin custom accent', () => {
    const plugin = {
      ...formulaCopy,
      matches: ['https://chat.deepseek.com/*'],
      theme: { brand: '#123456' },
    };
    expect(platformBadge(plugin)?.color).toBe('#123456');
    expect(platformBadge(plugin, 'deepseek')?.color).toBe('#123456');
  });

  it.each(['https://chat.deepseek.com.example.org/*', 'https://example.org/chat.deepseek.com/*'])(
    'does not mislabel unrelated matches %s as DeepSeek',
    (pattern) => expect(platformBadge({ ...formulaCopy, matches: [pattern] })).toBeNull(),
  );

  it('prefers the plugin-declared theme.brand over the site default', () => {
    // Existing platforms retain their own fallback colour.
    const themed = { ...formulaCopy, theme: { brand: '#123456' } };
    expect(platformBadge(themed, 'chatgpt')?.color).toBe('#123456');
  });

  it.each([
    'https://notclaude.ai/*',
    'https://claude.ai.example.org/*',
    'https://notchatgpt.com/*',
    'https://chat.openai.com.example.org/*',
    'https://api.openai.com/*',
    'https://example.org/claude.ai/*',
  ])('does not infer an official chat platform from %s', (pattern) => {
    expect(platformBadge({ ...formulaCopy, matches: [pattern] })).toBeNull();
  });

  it.each([
    ['https://claude.ai/*', '#d97757'],
    ['https://chatgpt.com/*', '#0ea5e9'],
    ['https://chat.openai.com/*', '#0ea5e9'],
    ['*://chatgpt.com/*', '#0ea5e9'],
    ['http://chat.deepseek.com/*', '#4d6bfe'],
    ['*://chat.deepseek.com/*', '#4d6bfe'],
  ])('recognizes the exact chat host in %s', (pattern, color) => {
    expect(platformBadge({ ...formulaCopy, matches: [pattern] })?.color).toBe(color);
  });

  it('falls back to the first matched host when the current site is unknown', () => {
    // No currentSiteId → infer from matches (claude is listed first).
    expect(platformBadge(formulaCopy, undefined)?.color).toBe('#d97757');
  });
});
