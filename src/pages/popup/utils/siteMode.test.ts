import { describe, expect, it } from 'vitest';

import { isPluginPopupSite } from './siteMode';

describe('isPluginPopupSite', () => {
  it('treats known plugin platforms as plugin popup sites without marketplace manifests', () => {
    expect(isPluginPopupSite('https://chatgpt.com/c/abc', [])).toBe(true);
    expect(isPluginPopupSite('https://chat.openai.com/c/abc', [])).toBe(true);
    expect(isPluginPopupSite('https://claude.ai/chat/abc', [])).toBe(true);
    expect(isPluginPopupSite('https://grok.com/', [])).toBe(true);
  });

  it('keeps native and unknown sites out of plugin popup mode unless a manifest targets them', () => {
    expect(isPluginPopupSite('https://gemini.google.com/app', [])).toBe(false);
    expect(isPluginPopupSite('https://aistudio.google.com/', [])).toBe(false);
    expect(isPluginPopupSite('https://deepseek.com/', [])).toBe(false);
    expect(isPluginPopupSite('https://deepseek.com/', [{}])).toBe(true);
  });
});
