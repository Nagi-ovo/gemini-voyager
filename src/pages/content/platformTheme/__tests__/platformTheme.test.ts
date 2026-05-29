import { afterEach, describe, expect, it } from 'vitest';

import type { PluginManifest } from '@/features/plugins/types';

import { PLATFORM_THEME_CLASS, applyBrandTheme, resolveBrandColor } from '../index';

afterEach(() => {
  document.documentElement.className = '';
  document.documentElement.style.removeProperty('--gv-pm-brand');
});

const themedPlugin = (brand: string, matches: string[]): PluginManifest => ({
  id: 'x.themed',
  name: 'Themed',
  version: '1.0.0',
  description: 'd',
  author: 'a',
  category: 'theme',
  license: 'MIT',
  engine: '>=1.0.0',
  tier: 'declarative',
  matches,
  contributes: {},
  theme: { brand },
});

describe('resolveBrandColor', () => {
  it('uses the adapter brandColor for Claude and ChatGPT', () => {
    expect(resolveBrandColor('https://claude.ai/chat/1')).toBe('#d97757');
    expect(resolveBrandColor('https://chatgpt.com/c/1')).toBe('#0ea5e9');
    expect(resolveBrandColor('https://chat.openai.com/')).toBe('#0ea5e9');
  });

  it('returns null for Gemini / AI Studio / unknown sites', () => {
    expect(resolveBrandColor('https://gemini.google.com/app')).toBeNull();
    expect(resolveBrandColor('https://aistudio.google.com/')).toBeNull();
    expect(resolveBrandColor('https://example.com/')).toBeNull();
  });

  it('lets a matching plugin theme override the adapter default', () => {
    const plugins = [themedPlugin('#ff0000', ['https://claude.ai/*'])];
    expect(resolveBrandColor('https://claude.ai/x', plugins)).toBe('#ff0000');
  });

  it('ignores a plugin theme whose matches do not cover the url', () => {
    const plugins = [themedPlugin('#ff0000', ['https://chatgpt.com/*'])];
    // Falls back to Claude's adapter brandColor, not the ChatGPT-scoped plugin.
    expect(resolveBrandColor('https://claude.ai/x', plugins)).toBe('#d97757');
  });
});

describe('applyBrandTheme', () => {
  it('sets the themed class + --gv-pm-brand on the root for a themed site', () => {
    applyBrandTheme('https://claude.ai/x', [], document);
    expect(document.documentElement.classList.contains(PLATFORM_THEME_CLASS)).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--gv-pm-brand')).toBe('#d97757');
  });

  it('adds nothing on Gemini', () => {
    applyBrandTheme('https://gemini.google.com/app', [], document);
    expect(document.documentElement.className).toBe('');
    expect(document.documentElement.style.getPropertyValue('--gv-pm-brand')).toBe('');
  });

  it('clears a previously-applied theme when navigating to an un-themed site', () => {
    applyBrandTheme('https://claude.ai/x', [], document);
    applyBrandTheme('https://gemini.google.com/app', [], document);
    expect(document.documentElement.classList.contains(PLATFORM_THEME_CLASS)).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--gv-pm-brand')).toBe('');
  });
});
