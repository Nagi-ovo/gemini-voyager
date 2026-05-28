import { afterEach, describe, expect, it } from 'vitest';

import { applyPlatformThemeClass, resolvePlatformThemeId } from '../index';

afterEach(() => {
  document.body.className = '';
});

describe('resolvePlatformThemeId', () => {
  it('themes Claude and ChatGPT', () => {
    expect(resolvePlatformThemeId('https://claude.ai/chat/1')).toBe('claude');
    expect(resolvePlatformThemeId('https://chatgpt.com/c/1')).toBe('chatgpt');
    expect(resolvePlatformThemeId('https://chat.openai.com/')).toBe('chatgpt');
  });

  it('does NOT theme Gemini / AI Studio / unknown sites', () => {
    expect(resolvePlatformThemeId('https://gemini.google.com/app')).toBeNull();
    expect(resolvePlatformThemeId('https://aistudio.google.com/')).toBeNull();
    expect(resolvePlatformThemeId('https://example.com/')).toBeNull();
  });
});

describe('applyPlatformThemeClass', () => {
  it('adds the platform class on a themed site', () => {
    applyPlatformThemeClass('https://claude.ai/x', document);
    expect(document.body.classList.contains('gv-platform-claude')).toBe(true);
  });

  it('adds nothing on Gemini', () => {
    applyPlatformThemeClass('https://gemini.google.com/app', document);
    expect(document.body.className).toBe('');
  });
});
